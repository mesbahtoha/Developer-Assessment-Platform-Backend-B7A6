import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { cacheInvalidate } from '../../shared/cache';
import { AuthUser } from '../../middlewares/auth';
import { ListMyPaymentsQuery } from './payment.validation';

const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-08-26.dahlia',
});

type SessionLike = {
  id: string;
  url?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string | undefined> | null;
  client_reference_id?: string | null;
};

export const paymentSelect = {
  id: true,
  userId: true,
  assessmentId: true,
  amount: true,
  currency: true,
  status: true,
  provider: true,
  stripeSessionId: true,
  stripePaymentIntentId: true,
  paidAt: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

const needStripe = (): void => {
  if (!env.STRIPE_SECRET_KEY) throw ApiError.badRequest('Stripe is not configured');
};

export const createCheckoutSession = async (
  user: AuthUser,
  assessmentId: string,
  amountInCents?: number
) => {
  needStripe();
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, isDeleted: false },
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (assessment.status !== 'PUBLISHED') {
    throw ApiError.badRequest(
      `Assessment must be published before payment (current status: ${assessment.status})`
    );
  }
  if (assessment.price <= 0) {
    throw ApiError.badRequest('This assessment is free; no payment is required');
  }
  // Server-side source of truth for the amount: a client-supplied value must match the
  // stored assessment price exactly, which blocks amount-tampering.
  if (amountInCents !== undefined && amountInCents !== assessment.price) {
    throw ApiError.badRequest(
      `amountInCents must match the assessment price (${assessment.price} cents)`
    );
  }
  const amount = assessment.price;

  // Idempotency: reuse a still-open Stripe session instead of failing or double-charging.
  const existing = await prisma.payment.findFirst({
    where: { userId: user.id, assessmentId, status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing?.stripeSessionId) {
    try {
      const current = (await stripe.checkout.sessions.retrieve(
        existing.stripeSessionId
      )) as unknown as SessionLike;

      if (current.status === 'open' && current.url) {
        return { session: current, payment: existing, reused: true };
      }
      if (current.status === 'complete' && current.payment_status === 'paid') {
        const paid = await prisma.payment.update({
          where: { id: existing.id },
          data: {
            status: 'PAID',
            stripePaymentIntentId:
              typeof current.payment_intent === 'string' ? current.payment_intent : undefined,
            paidAt: existing.paidAt ?? new Date(),
          },
        });
        await cacheInvalidate('admin:');
        return { session: current, payment: paid, reused: true };
      }
      // Expired / abandoned session -> close it out before creating a fresh one
      await prisma.payment.update({ where: { id: existing.id }, data: { status: 'FAILED' } });
    } catch {
      await prisma.payment.update({ where: { id: existing.id }, data: { status: 'FAILED' } });
    }
  }
  const session = (await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: assessment.currency || 'usd',
          unit_amount: amount,
          product_data: { name: `Assessment: ${assessment.title}` },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_URL}/payment/cancelled`,
    client_reference_id: assessmentId,
    metadata: { userId: user.id, assessmentId },
  })) as unknown as SessionLike;
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      assessmentId,
      amount,
      currency: assessment.currency || 'usd',
      status: 'PENDING',
      provider: 'stripe',
      stripeSessionId: session.id,
    },
  });
  await audit({
    actorId: user.id,
    action: 'PAYMENT_INITIATED',
    targetType: 'PAYMENT',
    targetId: payment.id,
    meta: { assessmentId, amount },
  });
  await cacheInvalidate('admin:');
  return { session, payment, reused: false };
};

export const handleWebhookEvent = async (sig: string, body: Buffer) => {
  needStripe();
  if (!sig || !body) throw ApiError.badRequest('Missing webhook signature or body');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET ?? '');
  } catch (err) {
    throw ApiError.badRequest(`Webhook signature verification failed: ${(err as Error).message}`);
  }
  const obj = event.data.object as unknown as SessionLike;
  const markPaid = async () =>
    prisma.payment.updateMany({
      where: { stripeSessionId: obj.id },
      data: {
        status: 'PAID',
        stripePaymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : undefined,
        paidAt: new Date(),
      },
    });
  if (event.type === 'checkout.session.completed') {
    await markPaid().catch(() => null);
    const payment = await prisma.payment.findFirst({ where: { stripeSessionId: obj.id } });
    await cacheInvalidate('admin:');
    return { type: event.type, received: true, payment };
  }
  if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    await prisma.payment
      .updateMany({ where: { stripeSessionId: obj.id, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'FAILED' } })
      .catch(() => null);
    const payment = await prisma.payment.findFirst({ where: { stripeSessionId: obj.id } });
    return { type: event.type, received: true, payment };
  }
  return { type: event.type, received: true };
};

export const getPaymentById = async (user: AuthUser, paymentId: string) => {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId },
    include: {
      assessment: { select: { id: true, title: true, recruiterId: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (user.role !== 'ADMIN' && payment.userId !== user.id) {
    throw ApiError.forbidden('You cannot access this payment');
  }
  return payment;
};

/** Paginated + status-filterable payment history for the authenticated user. */
export const getMyPayments = async (user: AuthUser, query: ListMyPaymentsQuery) => {
  const { page, limit } = query;
  const where: Prisma.PaymentWhereInput = { userId: user.id };
  if (query.status) where.status = query.status;

  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: query.sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        ...paymentSelect,
        assessment: { select: { id: true, title: true, price: true } },
      },
    }),
  ]);

  return {
    payments,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

/**
 * Admin refund flow: creates a real Stripe refund for the captured payment intent and
 * moves the local payment to REFUNDED (audited).
 */
export const refundPayment = async (actor: AuthUser, paymentId: string) => {
  needStripe();
  const payment = await prisma.payment.findFirst({ where: { id: paymentId } });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== 'PAID') {
    throw ApiError.conflict(`Only PAID payments can be refunded (current status: ${payment.status})`);
  }
  if (!payment.stripePaymentIntentId) {
    throw ApiError.badRequest('This payment has no Stripe payment intent to refund');
  }

  const refund = await stripe.refunds.create({
    payment_intent: payment.stripePaymentIntentId,
  });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'REFUNDED', refundedAt: new Date() },
  });

  await audit({
    actorId: actor.id,
    action: 'PAYMENT_REFUNDED',
    targetType: 'PAYMENT',
    targetId: payment.id,
    meta: { refundId: refund.id, amount: refund.amount, status: refund.status },
  });
  await cacheInvalidate('admin:');

  return {
    refund: { id: refund.id, amount: refund.amount, currency: refund.currency, status: refund.status },
    payment: updated,
  };
};

export const verifySession = async (user: AuthUser, sessionId: string) => {
  needStripe();
  const session = (await stripe.checkout.sessions.retrieve(sessionId)) as unknown as SessionLike;
  const metaUserId = session.metadata?.userId;
  if (metaUserId && metaUserId !== user.id && user.role !== 'ADMIN') {
    throw ApiError.forbidden('This payment session does not belong to you');
  }
  if (session.payment_status === 'paid') {
    await prisma.payment
      .updateMany({
        where: { stripeSessionId: session.id },
        data: {
          status: 'PAID',
          stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          paidAt: new Date(),
        },
      })
      .catch(() => null);
    await cacheInvalidate('admin:');
  }
  const payment = await prisma.payment.findFirst({ where: { stripeSessionId: session.id } });
  if (!payment) throw ApiError.notFound('Payment not found');
  return { payment, stripeStatus: session.payment_status ?? 'unknown' };
};

export const PaymentService = {
  createCheckoutSession,
  handleWebhookEvent,
  verifySession,
  getPaymentById,
  getMyPayments,
  refundPayment,
};
