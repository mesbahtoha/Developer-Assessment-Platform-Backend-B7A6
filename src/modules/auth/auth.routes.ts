import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { env } from '../../config/env';
import { validate } from '../../middlewares/validate';
import { verifyAuth } from '../../middlewares/auth';
import { RedisRateLimitStore } from '../../shared/rateLimitStore';
import {
  changePasswordSchema,
  googleLoginSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.validation';

const router = Router();

// Stricter rate limit for credential endpoints (brute-force protection).
// Redis-backed store keeps the shared quota across serverless instances.
// skipSuccessfulRequests frees quota for valid Postman/E2E runs so automated
// verification never locks out demo accounts with 429s.
const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore({ windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS }),
  skipSuccessfulRequests: true,
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
