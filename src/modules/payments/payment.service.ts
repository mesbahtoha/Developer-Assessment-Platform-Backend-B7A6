import Stripe from 'stripe';
import { env } from '../../config/env';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { AuthUser } from '../../middlewares/auth';

const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-08-26.dahlia',
});

type SessionLike = {
  id: string;
  url?: string | null;
  payment_status?: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string | undefined> | null;
  client_reference_id?: string | null;
};

const needStripe = (): void => {
  if (!env.STRIPE_SECRET_KEY) throw ApiError.badRequest('Stripe is not configured');
};

export const createCheckoutSession = async (
  user: AuthUser,
  assessmentId: string,
  amountCents: number
) => {
  needStripe();
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, isDeleted: false },
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');
  // Candidates pay for their own attempt; recruiters/admins pay on behalf of the assessment.
  // Ownership is still enforced for reads; creation is intentionally open to all roles
  // so the attempt gate (userId + assessmentId + PAID) can succeed for candidates.
  if (!Number.isInteger(amountCents) || amountCents < 50) {
    throw ApiError.badRequest('amountInCents must be an integer >= 50');
  }
  const existing = await prisma.payment.findFirst({
    where: { userId: user.id, assessmentId, status: { in: ['PENDING', 'PROCESSING'] } },
  });
  if (existing) throw ApiError.conflict('A payment session is already in progress');
  const session = (await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: assessment.currency || 'usd',
          unit_amount: amountCents,
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
      amount: amountCents,
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
    meta: { assessmentId, amount: amountCents },
  });
  return { session, payment };
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

export const getMyPayments = async (user: AuthUser) => {
  return prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { assessment: { select: { id: true, title: true } } },
  });
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
};