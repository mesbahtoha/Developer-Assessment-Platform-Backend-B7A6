import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import globalErrorHandler from './middlewares/globalErrorHandler';
import { notFound } from './middlewares/notFound';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/user/user.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { problemRoutes } from './modules/problem/problem.routes';
import { assessmentRoutes } from './modules/assessment/assessment.routes';
import { invitationRoutes } from './modules/invitation/invitation.routes';
import { attemptRoutes } from './modules/attempt/attempt.routes';
import { submissionRoutes } from './modules/attempt/submission.routes';
import { evaluationRoutes } from './modules/evaluation/evaluation.routes';
import { resultRoutes } from './modules/results/results.routes';
import { paymentRoutes } from './modules/payments/payment.routes';
import { catchAsync } from './shared/catchAsync';
import { sendError, sendSuccess } from './shared/ApiResponse';
import { redisHealth } from './config/redis';
import { RedisRateLimitStore } from './shared/rateLimitStore';
import { cacheStats } from './shared/cache';
import prisma from './shared/prisma';

const app: Application = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL.split(',').map((url) => url.trim()),
    credentials: true,
  })
);

// Global rate limiting (Redis-backed store keeps the quota shared across
// serverless instances; falls back to in-memory when Redis is unavailable)
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisRateLimitStore({ windowMs: env.RATE_LIMIT_WINDOW_MS }),
    message: { success: false, message: 'Too many requests, please try again later', errors: [] },
  })
);

// Body parsing (Stripe webhook uses raw body in its own route)
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// API index + health
app.get('/', (_req, res) => {
  sendSuccess(res, { docs: '/api/v1', health: '/api/v1/health' }, 'Developer Assessment Platform API is running');
});

app.get('/api/v1', (_req, res) => {
  sendSuccess(
    res,
    {
      version: 'v1',
      environment: env.NODE_ENV,
      health: '/api/v1/health',
      documentation: 'POSTMAN.json / POSTMAN.md (Postman collection, 60+ requests)',
      modules: {
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        problems: '/api/v1/problems',
        assessments: '/api/v1/assessments',
        invitations: '/api/v1/invitations',
        attempts: '/api/v1/attempts',
        submissions: '/api/v1/submissions',
        evaluation: '/api/v1/evaluation',
        payments: '/api/v1/payments',
        admin: '/api/v1/admin',
      },
    },
    'Developer Assessment Platform API v1'
  );
});

// Liveness + readiness probe: verifies the database round-trip and reports cache state
app.get(
  '/api/v1/health',
  catchAsync(async (_req, res) => {
    const startedAt = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      sendError(res, 'Database is unreachable', ['Database health check failed'], 503);
      return;
    }

    const cache = redisHealth();
    sendSuccess(
      res,
      {
        status: 'ok',
        version: 'v1',
        environment: env.NODE_ENV,
        database: { status: 'up', latencyMs: Date.now() - startedAt },
        cache: { status: cache.status, error: cache.error, stats: cacheStats() },
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      'API is healthy'
    );
  })
);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/problems', problemRoutes);
app.use('/api/v1/assessments', assessmentRoutes);
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/v1/attempts', attemptRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/evaluation', evaluationRoutes);
app.use('/api/v1/results', resultRoutes);
app.use('/api/v1/payments', paymentRoutes);

// 404 + error handling (order matters)
app.use(notFound);
app.use(globalErrorHandler);

export default app;
