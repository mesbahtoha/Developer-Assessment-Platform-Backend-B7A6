import { Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import prisma from '../../shared/prisma';
import { UpdateMeInput } from './user.validation';

// Never select password in any user query
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
  googleId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const getMe = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    select: publicUserSelect,
  });
  if (!user) {
    throw ApiError.unauthorized('User no longer exists');
  }
  return user;
};

const updateMe = async (userId: string, input: UpdateMeInput) => {
  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl ?? null;

  return prisma.user.update({
    where: { id: userId },
    data,
    select: publicUserSelect,
  });
};

export const UserService = { getMe, updateMe };
