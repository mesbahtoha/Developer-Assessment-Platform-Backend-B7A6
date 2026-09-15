import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../config/env';
import { ApiError } from '../../shared/catchAsync';
import prisma from '../../shared/prisma';
import { audit } from '../../shared/audit';
import { createHash, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const signAccessToken = (payload: { id: string; email: string; role: Role }): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_ACCESS_SECRET, options);
};

const signRefreshToken = (payload: { id: string }): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_REFRESH_SECRET, options);
};

const getRefreshExpiry = (): Date => {
  const days = 7; // matches JWT_REFRESH_EXPIRES_IN=7d default
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const createTokens = async (
  user: { id: string; email: string; role: Role }
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ id: user.id });

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: getRefreshExpiry(),
    },
  });

  return { accessToken, refreshToken };
};

const rotateRefreshToken = async (refreshToken: string) => {
  try {
    jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  if (stored.user.isDeleted) {
    throw ApiError.unauthorized('User no longer exists');
  }

  const user = stored.user;

  // Revoke old token, issue a new pair (rotation)
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const { accessToken, refreshToken: newRefreshToken } = await createTokens(user);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
};

const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

const registerUser = async (input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const hashed = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: hashed,
      role: input.role,
    },
  });

  await audit({
    actorId: user.id,
    action: 'USER_REGISTERED',
    targetType: 'USER',
    targetId: user.id,
    meta: { role: user.role },
  });

  const { accessToken, refreshToken } = await createTokens(user);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    accessToken,
    refreshToken,
  };
};

const loginUser = async (input: { email: string; password: string }) => {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user || user.isDeleted || !user.password) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const passwordMatch = await bcrypt.compare(input.password, user.password);
  if (!passwordMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const { accessToken, refreshToken } = await createTokens(user);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  };
};

const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
  });
  if (!user || !user.password) {
    throw ApiError.unauthorized('User not found or uses social login');
  }

  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
    // Revoke all existing refresh tokens after password change
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await audit({ actorId: userId, action: 'PASSWORD_CHANGED', targetType: 'USER', targetId: userId });

  return { id: user.id };
};

export const AuthService = {
  registerUser,
  loginUser,
  rotateRefreshToken,
  revokeRefreshToken,
  changePassword,
  createTokens,
};

