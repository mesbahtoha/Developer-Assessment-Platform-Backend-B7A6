import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { PaymentController } from './payment.controller';
import { createCheckoutSchema } from './payment.validation';

const router = Router();

// Stripe webhook MUST be public (Stripe signs it) and MUST be declared
// BEFORE verifyAuth so no Bearer token is required.
router.post('/webhook', PaymentController.webhook);

router.use(verifyAuth);

router.post('/create', authorize('CANDIDATE', 'RECRUITER', 'ADMIN'), validate(createCheckoutSchema), PaymentController.create);

// IMPORTANT: static routes before ':id' so Express does not treat them as ids.
router.get('/my-payments', authorize('CANDIDATE', 'RECRUITER', 'ADMIN'), PaymentController.myPayments);

router.get('/verify/:sessionId', authorize('CANDIDATE', 'RECRUITER', 'ADMIN'), PaymentController.verify);

router.get('/:id', authorize('CANDIDATE', 'RECRUITER', 'ADMIN'), PaymentController.getById);

export const paymentRoutes = router;
