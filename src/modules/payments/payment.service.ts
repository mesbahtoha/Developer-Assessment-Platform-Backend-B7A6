import Stripe from 'stripe';
import { ApiError } from '../../shared/catchAsync';
import prisma from '../../shared/prisma';
import { AuthUser } from '../../middlewares/auth';
import { PaymentStatus } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-09-30',
});

const EXPIRE_MINUTES = 60;

export const createCheckoutSession = async (
  user: AuthUser,
  assessmentId: string,
  amountCents: number
) => {
  // Check if user already has a PAID or PROCESSING payment for this assessment
  const existingPayment = await prisma.payment.findFirst({
    where: { userId: user.id, assessmentId, status: { in: ['PENDING', 'PROCESSING'] } },
  });

  if (existingPayment) {
    throw ApiError.conflict(
      'A payment session is already in progress for this assessment'
    );
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: 'Assessment Payment',
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/payment/cancelled`,
    client_reference_id: assessmentId,
    metadata: {
      userId: user.id,
      assessmentId,
    },
  });

  // Store payment record in DB
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      assessmentId,
      amount: amountCents,
      currency: 'usd',
      status: 'PENDING',
      provider: 'stripe',
      stripeSessionId: session.id,
    },
  });

  return { session, payment };
};

export const retrievePaymentIntent = async (
  paymentId: string
): Promise<{ payment: any; intent: Stripe.PaymentIntent }> => {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId },
  });
  if (!payment) {
    throw ApiError.notFound('Payment not found');
  }

  // Never trust status from client; always verify with Stripe
  const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId!);

  return { payment, intent };
};

export const handleWebhookEvent = async (
  sig: string,
  body: Buffer
): Promise<{ type: string; data: any; payment?: any }> => {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    throw ApiError.badRequest(`Webhook signature verification failed: ${err}`);
  }

  // Handle the event idempotently - check if we've already processed this event
  const existing = await prisma.payment.findFirst({
    where: { stripeSessionId: event.data.object.id },
  });

  if (existing && existing.stripeSessionId === event.data.object.id) {
    // Already processed; return the existing payment status
    return {
      type: event.type,
      data: event.data.object,
      payment: existing,
    };
  }

  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: event.payment_intent?.id },
  });

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.CheckoutSession;
      await prisma.payment.update({
        where: { stripeSessionId: session.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      return {
        type: event.type,
        data: session,
        payment: await prisma.payment.findFirst({ where: { stripeSessionId: session.id } }),
      };
    }

    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.assessmentId && intent.metadata?.userId) {
        await prisma.payment.update({
          where: { stripePaymentIntentId: intent.id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
          },
        });
      }
      return {
        type: event.type,
        data: intent,
        payment: await prisma.payment.findFirst({ where: { stripePaymentIntentId: intent.id } }),
      };
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const pay = await prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
      });
      if (pay) {
        await prisma.payment.update({
          where: { id: pay.id },
          data: { status: 'FAILED', failedAt: new Date() },
        });
      }
      return {
        type: event.type,
        data: intent,
        payment: await prisma.payment.findFirst({ where: { stripePaymentIntentId: intent.id } }),
      };
    }

    default:
      return { type: event.type, data: event.data.object };
  }
};

export const getPaymentById = async (paymentId: string) => {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId },
    include: { user: true, assessment: true },
  });
  if (!payment) throw ApiError.notFound('Payment not found');
  return payment;
};

export const getMyPayments = async (user: AuthUser) => {
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { assessment: true },
  });
  return payments;
};