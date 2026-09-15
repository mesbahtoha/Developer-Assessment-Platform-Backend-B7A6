import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { ApiError, catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import prisma from '../../shared/prisma';
import { audit } from '../../shared/audit';
import { AuthService } from './auth.service';
import { verifyGoogleToken } from './auth.google';
import {
  changePasswordSchema,
  googleLoginSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.validation';

const sanitizeUser = (user: {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});

const register = catchAsync(async (req: Request, res: Response) => {
  const parsed = registerSchema.parse(req);
  const result = await AuthService.registerUser(parsed.body);
  sendSuccess(res, result, 'Account registered successfully', 201);
});

const login = catchAsync(async (req: Request, res: Response) => {
  const parsed = loginSchema.parse(req);
  const result = await AuthService.loginUser(parsed.body);
  sendSuccess(res, result, 'Login successful');
});

const socialLogin = catchAsync(async (req: Request, res: Response) => {
  const parsed = googleLoginSchema.parse(req);
  const profile = await verifyGoogleToken(parsed.body.credential);

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
  });

  if (user?.isDeleted) {
    throw ApiError.unauthorized('This account has been deactivated');
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        role: parsed.body.role,
      },
    });
    await audit({
      actorId: user.id,
      action: 'USER_REGISTERED_GOOGLE',
      targetType: 'USER',
      targetId: user.id,
    });
  } else if (!user.googleId) {
    // Link existing email account to Google
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: profile.googleId },
    });
  }

  const tokens = await AuthService.createTokens(user);

  sendSuccess(
    res,
    { user: sanitizeUser(user), ...tokens },
    'Google login successful'
  );
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const parsed = refreshTokenSchema.parse(req);
  const result = await AuthService.rotateRefreshToken(parsed.body.refreshToken);
  sendSuccess(res, result, 'Token refreshed successfully');
});

const logout = catchAsync(async (req: Request, res: Response) => {
  const parsed = refreshTokenSchema.parse(req);
  await AuthService.revokeRefreshToken(parsed.body.refreshToken);
  sendSuccess(res, {}, 'Logged out successfully');
});

const getMe = catchAsync(async (req: Request, res: Response) => {
  const user = await prisma.user.findFirst({
    where: { id: req.user!.id, isDeleted: false },
    select: { id: true, name: true, email: true, role: true, googleId: true, createdAt: true },
  });

  if (!user) throw ApiError.unauthorized('User no longer exists');

  sendSuccess(res, { user }, 'Profile fetched successfully');
});

const changePassword = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
  const parsed = changePasswordSchema.parse(req);
  const result = await AuthService.changePassword(
    req.user!.id,
    parsed.body.currentPassword,
    parsed.body.newPassword
  );
  sendSuccess(res, result, 'Password changed successfully. Please login again.');
});

export const AuthController = {
  register,
  login,
  socialLogin,
  refreshToken,
  logout,
  getMe,
  changePassword,
};
