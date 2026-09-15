import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError, catchAsync } from '../shared/catchAsync';
import prisma from '../shared/prisma';

export interface AuthUser {
  id: string;
  email: string;
  role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const verifyAuth = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Authorization token is missing or invalid');
  }

  const token = header.split(' ')[1];

  let decoded: AuthUser;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  const user = await prisma.user.findFirst({
    where: { id: decoded.id, isDeleted: false },
  });
  if (!user) {
    throw ApiError.unauthorized('User no longer exists');
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
});
