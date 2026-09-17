import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { PaymentController } from './payment.controller';
import {
  createCheckoutSchema,
  listMyPaymentsQuerySchema,
  paymentIdParamSchema,
} from './payment.validation';

const router = Router();

// Stripe webhook MUST be public (Stripe signs it) and MUST be declared
// BEFORE verifyAuth so no Bearer token is required.
router.post('/webhook', PaymentController.webhook);

router.use(verifyAuth);

router.post('/create', authorize('CANDIDATE', 'RECRUITER', 'ADMIN'), validate(createCheckoutSchema), PaymentController.create);

// IMPORTANT: static routes before ':id' so Express does not treat them as ids.
router.get(
  '/my-payments',
  authorize('CANDIDATE', 'RECRUITER', 'ADMIN'),
  validate(listMyPaymentsQuerySchema, ['query']),
  PaymentController.myPayments
);

router.get('/verify/:sessionId', authorize('CANDIDATE', 'RECRUITER', 'ADMIN'), PaymentController.verify);

// Admin-only: issue a real Stripe refund for a captured payment
router.post(
  '/:id/refund',
  authorize('ADMIN'),
  validate(paymentIdParamSchema, ['params']),
  PaymentController.refund
);

router.get(
  '/:id',
  authorize('CANDIDATE', 'RECRUITER', 'ADMIN'),
  validate(paymentIdParamSchema, ['params']),
  PaymentController.getById
);

export const paymentRoutes = router;
