import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { UserController } from './user.controller';
import { updateMeSchema, updateProfileSchema } from './user.validation';

const router = Router();

// All routes require a valid Bearer access token
router.get('/me', verifyAuth, UserController.getMe);
router.patch('/me', verifyAuth, validate(updateMeSchema), UserController.updateMe);

// Role-specific profiles: candidate developer profile / recruiter company profile
router.get('/me/profile', verifyAuth, UserController.getMyProfile);
router.patch('/me/profile', verifyAuth, validate(updateProfileSchema), UserController.updateMyProfile);

export const userRoutes = router;
