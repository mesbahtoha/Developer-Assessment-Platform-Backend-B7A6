import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { ApiError } from '../../shared/catchAsync';
import prisma from '../../shared/prisma';
import { AuthUser } from '../../middlewares/auth';
import { requireRecruiter, requireAdmin } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { createSubmissionSchema } from '../attempt/attempt.validation';
import { sendSuccess } from '../../shared/ApiResponse';
import {
  createCheckoutSession,
  retrievePaymentIntent,
  handleWebhookEvent,
  getPaymentById,
  getMyPayments,
} from './payment.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-09-30',
});

const router = Router();

// All payment routes require authentication
router.use(verifyAuth);

// ---------- Recruiter: create checkout session ----------
router.post(
  '/create',
  requireRecruiter,
  async (req: Request, res: Response) => {
    const { assessmentId, amountInCents } = req.body as {
      assessmentId: string;
      amountInCents: number;
    };
    const user = (req as any).user;

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, recruiterId: user.id },
    });
    if (!assessment) throw ApiError.notFound('Assessment not found');

    const result = await createCheckoutSession(user, assessmentId, amountInCents);
    sendSuccess(res, { session: result.session, payment: result.payment }, 'Checkout session created successfully');
  }
);

// ---------- Stripe webhook endpoint ----------
router.post(
  '/webhook',
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    try {
      event = stripe.Webhook.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      throw ApiError.badRequest(`Webhook signature verification failed: ${err.message}`);
    }

    const result = await handleWebhookEvent(sig, req.body);
    sendSuccess(res, result, 'Webhook processed successfully');
  }
);

// ---------- Get payment by ID ----------
router.get(
  '/:id',
  requireRecruiter,
  async (req: Request, res: Response) => {
    const payment = await getPaymentById(req.params.id);
    sendSuccess(res, payment);
  }
);

// ---------- Get current user's payments ----------
router.get(
  '/my-payments',
  requireRecruiter,
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const payments = await getMyPayments(user);
    sendSuccess(res, payments);
  }
);

export const paymentRoutes = router;