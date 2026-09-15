import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { validate } from '../../middlewares/validate';
import { verifyAuth } from '../../middlewares/auth';
import {
  changePasswordSchema,
  googleLoginSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.validation';

const router = Router();

// Stricter rate limit for credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts, please try again later',
    errors: [],
  },
});

router.post('/register', authLimiter, validate(registerSchema), AuthController.register);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post(
  '/social-login',
  authLimiter,
  validate(googleLoginSchema),
  AuthController.socialLogin
);
// Assignment-spec alias: POST /api/v1/auth/google (same Google ID-token flow)
router.post('/google', authLimiter, validate(googleLoginSchema), AuthController.socialLogin);
router.post('/refresh-token', validate(refreshTokenSchema), AuthController.refreshToken);
router.post('/logout', validate(refreshTokenSchema), AuthController.logout);
router.get('/me', verifyAuth, AuthController.getMe);
router.patch(
  '/change-password',
  verifyAuth,
  validate(changePasswordSchema),
  AuthController.changePassword
);

export const authRoutes = router;
