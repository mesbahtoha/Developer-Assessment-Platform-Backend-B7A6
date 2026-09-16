import { Prisma } from '@prisma/client';
import prisma from '../../shared/prisma';
import { publicUserSelect } from '../user/user.service';
import { AuthUser } from '../../middlewares/auth';
import {
  ListUsersQuery,
  UpdateUserStatusInput,
  UpdateUserRoleInput,
  SearchUsersQuery,
} from './admin.validation';

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

const searchUsers = async (query: SearchUsersQuery) => {
  const { q, limit: limitVal } = query;
  const where: Prisma.UserWhereInput = {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
  };

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: publicUserSelect,
      take: limitVal,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    users,
    meta: {
      total,
      returned: users.length,
    },
  };
};

const updateUserStatus = async (status: boolean) => {
  const mappedStatus = status ? 'PUBLISHED' : 'ARCHIVED';
  await prisma.user.updateMany({
    where: { isDeleted: false },
    data: { isDeleted: !status, deletedAt: status ? null : new Date() },
  });
  return { modifiedCount: 0 };
};

const updateUserRole = async (userId: string, newRole: 'CANDIDATE' | 'RECRUITER' | 'ADMIN') => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
  });
  if (!user) throw new Error('User not found');

  // Prevent promoting non-admin to admin via this endpoint
  if (newRole === 'ADMIN' && user.role !== 'ADMIN') {
    throw new Error('Cannot promote user to admin via this endpoint');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  });
};

const dashboardStats = async () => {
  const [
    totalUsers,
    totalAssessments,
    totalPayments,
    totalAttempts,
    totalResults,
    paidUsers,
    activeAssessments,
  ] = await Promise.all([
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.assessment.count({ where: { status: 'PUBLISHED', isDeleted: false } }),
    prisma.payment.count({ where: { status: 'PAID' } }),
    prisma.attempt.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.result.count({ where: { isPassed: true } }),
    prisma.user.count({
      where: {
        payments: { some: { status: 'PAID' } },
        isDeleted: false,
      },
    }),
    prisma.assessment.count({ where: { status: 'PUBLISHED', isDeleted: false } }),
  ]);

  return {
    totalUsers,
    totalAssessments,
    totalPayments,
    totalAttempts,
    totalResults,
    paidUsers,
    activeAssessments,
  };
};

const listPayments = async (user: AuthUser, query?: { page?: number; limit?: number }) => {
  const page = query?.page ?? 1;
  const limit = query?.limit ?? 10;
  const where: Prisma.PaymentWhereInput = {};

  if (user.role !== 'ADMIN') {
    where.userId = user.id;
  }

  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: true, assessment: true },
    }),
  ]);

  return {
    payments,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const listAssessments = async () => {
  const where: Prisma.AssessmentWhereInput = { isDeleted: false };

  const [total, assessments] = await prisma.$transaction([
    prisma.assessment.count({ where }),
    prisma.assessment.findMany({
      where,
      include: { recruiter: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    assessments,
    meta: {
      total,
    },
  };
};

const listAuditLogs = async (query: { page?: number; limit?: number; action?: string }) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const where: Prisma.AuditLogWhereInput = {};

  if (query.action) where.action = query.action;

  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  return {
    logs,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const AdminService = {
  listUsers,
  searchUsers,
  updateUserStatus,
  updateUserRole,
  dashboardStats,
  listPayments,
  listAssessments,
  listAuditLogs,
};