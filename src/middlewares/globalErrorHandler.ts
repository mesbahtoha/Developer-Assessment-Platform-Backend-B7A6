import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env, isProd } from '../config/env';
import { sendError } from '../shared/ApiResponse';
import { ApiError } from '../shared/catchAsync';

const globalErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Something went wrong';
  let errors: unknown[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'A record with this value already exists';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Resource not found';
    }
  } else if (err instanceof SyntaxError) {
    statusCode = 400;
    message = 'Invalid JSON payload';
  }

  if (statusCode === 500 && isProd) {
    message = 'Something went wrong';
  }

  if (!isProd) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
  }

  sendError(res, message, errors, statusCode);
  void env; // keep env import alive for future use
};

export default globalErrorHandler;
