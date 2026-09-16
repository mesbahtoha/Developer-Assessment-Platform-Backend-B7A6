import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { requireRecruiterOrAdmin } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { PaymentController } from './payment.controller';
import { createCheckoutSchema } from './payment.validation';

const router = Router();

// Stripe webhook MUST be public (Stripe signs it) and MUST be declared
// BEFORE verifyAuth so no Bearer token is required.
router.post('/webhook', PaymentController.webhook);

router.use(verifyAuth);

router.post('/create', requireRecruiterOrAdmin, validate(createCheckoutSchema), PaymentController.create);

// IMPORTANT: static routes before ':id' so Express does not treat them as ids.
router.get('/my-payments', requireRecruiterOrAdmin, PaymentController.myPayments);

router.get('/verify/:sessionId', requireRecruiterOrAdmin, PaymentController.verify);

router.get('/:id', requireRecruiterOrAdmin, PaymentController.getById);

export const paymentRoutes = router;
