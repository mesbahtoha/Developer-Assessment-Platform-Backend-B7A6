import { Prisma } from '@prisma/client';
import prisma from '../../shared/prisma';
import { publicUserSelect } from '../user/user.service';
import { AuthUser } from '../../middlewares/auth';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import { cached, cacheInvalidate, cacheKey, TTL } from '../../shared/cache';
import {
  ListAdminAssessmentsQuery,
  ListAdminPaymentsQuery,
  ListAuditLogsQuery,
  ListUsersQuery,
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

const updateUserStatus = async (userId: string, isActive: boolean, actor: AuthUser) => {
  const user = await prisma.user.findFirst({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  if (user.id === actor.id) throw ApiError.forbidden('You cannot deactivate your own account');
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isDeleted: !isActive, deletedAt: isActive ? null : new Date() },
    select: publicUserSelect,
  });
  await audit({
    actorId: actor.id,
    action: 'USER_STATUS_UPDATED',
    targetType: 'USER',
    targetId: userId,
    meta: { isActive, isDeleted: !isActive, previousIsDeleted: user.isDeleted },
  });
  await cacheInvalidate('admin:');
  return { user: updated };
};

const updateUserRole = async (
  userId: string,
  newRole: 'CANDIDATE' | 'RECRUITER' | 'ADMIN',
  actor: AuthUser
) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
  });
  if (!user) throw ApiError.notFound('User not found');
  if (user.id === actor.id) throw ApiError.forbidden('You cannot change your own role');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
    select: publicUserSelect,
  });
  await audit({
    actorId: actor.id,
    action: 'USER_ROLE_UPDATED',
    targetType: 'USER',
    targetId: userId,
    meta: { from: user.role, to: newRole },
  });
  await cacheInvalidate('admin:');
  return { user: updated };
};

const buildDashboardStats = async () => {
  const [
    totalUsers,
    usersByRole,
    totalProblems,
    totalAssessments,
    publishedAssessments,
    totalInvitations,
    totalAttempts,
    attemptsByStatus,
    totalResults,
    passedResults,
    paymentGroups,
    paidUsers,
  ] = await Promise.all([
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.user.groupBy({ by: ['role'], where: { isDeleted: false }, _count: { _all: true } }),
    prisma.problem.count({ where: { isDeleted: false } }),
    prisma.assessment.count({ where: { isDeleted: false } }),
    prisma.assessment.count({ where: { status: 'PUBLISHED', isDeleted: false } }),
    prisma.invitation.count(),
    prisma.attempt.count(),
    prisma.attempt.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.result.count(),
    prisma.result.count({ where: { isPassed: true } }),
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
    prisma.user.count({ where: { payments: { some: { status: 'PAID' } }, isDeleted: false } }),
  ]);

  const usersByRoleMap: Record<string, number> = {};
  for (const group of usersByRole) usersByRoleMap[group.role] = group._count._all;

  const attemptsByStatusMap: Record<string, number> = {};
  for (const group of attemptsByStatus) attemptsByStatusMap[group.status] = group._count._all;

  const paymentsByStatus: Record<string, { count: number; amountCents: number }> = {};
  let paidAmountCents = 0;
  let refundedAmountCents = 0;
  for (const group of paymentGroups) {
    const amountCents = group._sum.amount ?? 0;
    paymentsByStatus[group.status] = { count: group._count._all, amountCents };
    if (group.status === 'PAID') paidAmountCents += amountCents;
    if (group.status === 'REFUNDED') refundedAmountCents += amountCents;
  }

  const passRate =
    totalResults === 0 ? 0 : Math.round((passedResults / totalResults) * 10000) / 100;

  return {
    users: { total: totalUsers, byRole: usersByRoleMap, paidUsers },
    problems: { total: totalProblems },
    assessments: { total: totalAssessments, published: publishedAssessments },
    invitations: { total: totalInvitations },
    attempts: { total: totalAttempts, byStatus: attemptsByStatusMap },
    results: { total: totalResults, passed: passedResults, failed: totalResults - passedResults, passRate },
    payments: {
      byStatus: paymentsByStatus,
      paidCount: paymentsByStatus.PAID?.count ?? 0,
      grossAmountCents: paidAmountCents,
      refundedAmountCents,
      netRevenueCents: paidAmountCents - refundedAmountCents,
    },
    // Legacy flat counters kept for backwards compatibility with existing clients.
    totalUsers,
    totalAssessments: publishedAssessments,
    totalPayments: paymentsByStatus.PAID?.count ?? 0,
    totalAttempts,
    totalResults: passedResults,
    paidUsers,
    activeAssessments: attemptsByStatusMap.IN_PROGRESS ?? 0,
  };
};

/** Cached: dashboard aggregation is expensive and only needs to be near-real-time. */
const dashboardStats = async () =>
  cached(cacheKey('admin:dashboard-stats'), TTL.short, buildDashboardStats);

/**
 * Admin payment register with filtering/sorting/pagination.
 * Uses explicit `select`s so password hashes and other secrets are never serialized.
 */
const listPayments = async (query: ListAdminPaymentsQuery) => {
  const { page, limit } = query;
  const where: Prisma.PaymentWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.assessmentId) where.assessmentId = query.assessmentId;
  if (query.search) {
    where.user = {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }

  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        provider: true,
        stripeSessionId: true,
        stripePaymentIntentId: true,
        paidAt: true,
        refundedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true, role: true } },
        assessment: { select: { id: true, title: true, price: true } },
      },
    }),
  ]);

  // Status roll-up for the filtered set (kept out of the tx array for clean typing)
  const summary = await prisma.payment.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
    _sum: { amount: true },
  });

  const byStatus: Record<string, { count: number; amountCents: number }> = {};
  for (const group of summary) {
    byStatus[group.status] = { count: group._count._all, amountCents: group._sum.amount ?? 0 };
  }

  return {
    payments,
    byStatus,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const listAssessments = async (query: ListAdminAssessmentsQuery) => {
  const { page, limit } = query;
  const where: Prisma.AssessmentWhereInput = { isDeleted: false };

  if (query.status) where.status = query.status;
  if (query.recruiterId) where.recruiterId = query.recruiterId;
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [total, assessments] = await prisma.$transaction([
    prisma.assessment.count({ where }),
    prisma.assessment.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        durationMin: true,
        price: true,
        currency: true,
        passScorePercent: true,
        createdAt: true,
        updatedAt: true,
        recruiter: { select: { id: true, name: true, email: true } },
        _count: { select: { problems: true, invitations: true, attempts: true, payments: true } },
      },
    }),
  ]);

  return {
    assessments,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const listAuditLogs = async (query: ListAuditLogsQuery) => {
  const { page, limit } = query;
  const where: Prisma.AuditLogWhereInput = {};

  if (query.action) where.action = query.action;
  if (query.actorId) where.actorId = query.actorId;
  if (query.targetType) where.targetType = query.targetType;
  if (query.search) {
    where.OR = [
      { action: { contains: query.search, mode: 'insensitive' } },
      { targetType: { contains: query.search, mode: 'insensitive' } },
    ];
  }

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