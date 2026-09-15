import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './config/env';
import globalErrorHandler from './middlewares/globalErrorHandler';
import { notFound } from './middlewares/notFound';
import { authRoutes } from './modules/auth/auth.routes';

const app: Application = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL.split(',').map((url) => url.trim()),
    credentials: true,
  })
);

// Global rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later', errors: [] },
  })
);

// Body parsing (Stripe webhook uses raw body in its own route)
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// API v1 routes
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: `Developer Assessment Platform API is running (${env.NODE_ENV})`,
    data: { docs: '/api/v1' },
  });
});
app.use('/api/v1/auth', authRoutes);
// Future modules mount here:
// app.use('/api/v1/users', userRoutes);
// app.use('/api/v1/assessments', assessmentRoutes);
// app.use('/api/v1/attempts', attemptRoutes);
// app.use('/api/v1/payments', paymentRoutes);
// app.use('/api/v1/admin', adminRoutes);

// 404 + error handling (order matters)
app.use(notFound);
app.use(globalErrorHandler);

void isProd;

export default app;
