import { Prisma } from '@prisma/client';
import prisma from '../../shared/prisma';
import { publicUserSelect } from '../user/user.service';
import { ListUsersQuery } from './admin.validation';

const buildWhere = (query: ListUsersQuery): Prisma.UserWhereInput => {
  const where: Prisma.UserWhereInput = {};

  if (query.role) where.role = query.role;
  if (query.isDeleted !== undefined) where.isDeleted = query.isDeleted;

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return where;
};

const listUsers = async (query: ListUsersQuery) => {
  const where = buildWhere(query);
  const page = query.page;
  const limit = query.limit;

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    users,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const AdminService = { listUsers };
