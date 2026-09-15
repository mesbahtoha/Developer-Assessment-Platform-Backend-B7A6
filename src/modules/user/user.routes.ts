import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { UserController } from './user.controller';
import { updateMeSchema } from './user.validation';

const router = Router();

// All routes require a valid Bearer access token
router.get('/me', verifyAuth, UserController.getMe);
router.patch('/me', verifyAuth, validate(updateMeSchema), UserController.updateMe);

export const userRoutes = router;
