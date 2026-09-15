import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../shared/catchAsync';
import { AuthUser } from './auth';

type AllowedRoles = AuthUser['role'][];

export const authorize =
  (...roles: AllowedRoles) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authorization token is missing or invalid'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }
    next();
  };
