import { Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { cached, cacheInvalidate, cacheKey, TTL } from '../../shared/cache';
import { AuthUser } from '../../middlewares/auth';
import {
  AssessmentResultsQuery,
  LeaderboardQuery,
  MyResultsQuery,
} from './results.validation';

const paginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Attach the derived `isPublished` flag to a raw Result row. */
const withPublication = <T extends { publishedAt: Date | null }>(result: T) => ({
  ...result,
  isPublished: result.publishedAt !== null,
});

// ---------- Shared access guards ----------

/** Recruiter/admin guard: the assessment must exist (and not be soft-deleted). */
const assertAssessmentAccess = async (user: AuthUser, assessmentId: string) => {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, isDeleted: false },
    select: { id: true, recruiterId: true },
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (user.role === 'RECRUITER' && assessment.recruiterId !== user.id) {
    throw ApiError.notFound('Assessment not found');
  }
  return assessment;
};

/**
 * Load a result with full ownership context and enforce row-level access:
 * candidates may only read their own results, recruiters only results of
 * assessments they own, admins any result. Non-owners get a 404 so the
 * existence of other users' results is never leaked.
 */
const getResultForUser = async (user: AuthUser, resultId: string) => {
  const result = await prisma.result.findFirst({
    where: { id: resultId },
    include: {
      attempt: {
        select: {
          id: true,
          candidateId: true,
          status: true,
          submittedAt: true,
          candidate: { select: { id: true, name: true, email: true } },
          assessment: {
            select: {
              id: true,
              title: true,
              passScorePercent: true,
              recruiterId: true,
              isDeleted: true,
            },
          },
        },
      },
    },
  });
  if (!result) throw ApiError.notFound('Result not found');

  if (result.attempt.assessment.isDeleted) throw ApiError.notFound('Result not found');
  if (user.role === 'CANDIDATE' && result.attempt.candidateId !== user.id) {
    throw ApiError.notFound('Result not found');
  }
  if (user.role === 'RECRUITER' && result.attempt.assessment.recruiterId !== user.id) {
    throw ApiError.notFound('Result not found');
  }
  return result;
};

// ============ CANDIDATE: MY RESULTS ============

const myResults = async (user: AuthUser, query: MyResultsQuery) => {
  const where: Prisma.ResultWhereInput = {
    attempt: {
      candidateId: user.id,
      ...(query.assessmentId ? { assessmentId: query.assessmentId } : {}),
    },
    ...(query.isPassed !== undefined ? { isPassed: query.isPassed } : {}),
  };

  const [total, results] = await prisma.$transaction([
    prisma.result.count({ where }),
    prisma.result.findMany({
      where,
      include: {
        attempt: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            assessment: { select: { id: true, title: true, passScorePercent: true } },
          },
        },
      },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { results: results.map(withPublication), meta: paginationMeta(query.page, query.limit, total) };
};

/** Candidate career statistics across every evaluated attempt (Redis-cached). */
const mySummary = async (user: AuthUser) =>
  cached(cacheKey('results:summary', user.id), TTL.short, async () => {
    const where: Prisma.ResultWhereInput = { attempt: { candidateId: user.id } };
    const [aggregate, passed] = await Promise.all([
      prisma.result.aggregate({
        where,
        _count: { _all: true },
        _avg: { percentage: true },
        _max: { percentage: true },
      }),
      prisma.result.count({ where: { ...where, isPassed: true } }),
    ]);
    const total = aggregate._count._all;
    return {
      total,
      passed,
      failed: total - passed,
      averagePercentage: round2(aggregate._avg.percentage ?? 0),
      bestPercentage: round2(aggregate._max.percentage ?? 0),
    };
  });

// ============ RESULT DETAIL ============

/** Result detail + per-problem submission breakdown (ownership enforced). */
const getById = async (user: AuthUser, resultId: string) => {
  const result = await getResultForUser(user, resultId);

  const submissions = await prisma.submission.findMany({
    where: { attemptId: result.attempt.id },
    select: {
      id: true,
      status: true,
      pointsAwarded: true,
      problem: { select: { id: true, title: true, type: true, points: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return { result: withPublication(result), breakdown: submissions };
};

// ============ PUBLISH / UNPUBLISH LIFECYCLE ============

/**
 * Officially release a result (sets publishedAt). Idempotent by design so
 * retried requests never fail. Only fully evaluated attempts can be published.
 */
const publish = async (user: AuthUser, resultId: string) => {
  const result = await getResultForUser(user, resultId);
  if (user.role === 'CANDIDATE') {
    throw ApiError.forbidden('Candidates cannot publish results');
  }
  if (result.attempt.status !== 'EVALUATED') {
    throw ApiError.badRequest(
      'Result can only be published after the attempt is fully evaluated'
    );
  }

  if (result.publishedAt) {
    return { result: withPublication(result) };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.result.update({
      where: { id: result.id },
      data: { publishedAt: new Date() },
    });
    await audit({
      actorId: user.id,
      action: 'RESULT_PUBLISHED',
      targetType: 'RESULT',
      targetId: result.id,
      meta: { attemptId: result.attempt.id, assessmentId: result.attempt.assessment.id },
    });
    return saved;
  });

  // Cached listings/leaderboards/reports embed publication state
  await cacheInvalidate('results:', 'report:assessment', 'admin:');
  return { result: withPublication(updated) };
};

/** Retract a published result (clears publishedAt). Idempotent. */
const unpublish = async (user: AuthUser, resultId: string) => {
  const result = await getResultForUser(user, resultId);
  if (user.role === 'CANDIDATE') {
    throw ApiError.forbidden('Candidates cannot unpublish results');
  }

  if (!result.publishedAt) {
    return { result: withPublication(result) };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.result.update({
      where: { id: result.id },
      data: { publishedAt: null },
    });
    await audit({
      actorId: user.id,
      action: 'RESULT_UNPUBLISHED',
      targetType: 'RESULT',
      targetId: result.id,
      meta: { attemptId: result.attempt.id, assessmentId: result.attempt.assessment.id },
    });
    return saved;
  });

  await cacheInvalidate('results:', 'report:assessment', 'admin:');
  return { result: withPublication(updated) };
};

// ============ RECRUITER/ADMIN: ASSESSMENT RESULTS ============

const assessmentResults = async (
  user: AuthUser,
  assessmentId: string,
  query: AssessmentResultsQuery
) => {
  await assertAssessmentAccess(user, assessmentId);

  const where: Prisma.ResultWhereInput = {
    attempt: {
      assessmentId,
      ...(query.search
        ? {
            candidate: {
              is: {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { email: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
    },
    ...(query.isPassed !== undefined ? { isPassed: query.isPassed } : {}),
  };

  const [total, results] = await prisma.$transaction([
    prisma.result.count({ where }),
    prisma.result.findMany({
      where,
      include: {
        attempt: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            candidate: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { results: results.map(withPublication), meta: paginationMeta(query.page, query.limit, total) };
};

// ============ LEADERBOARD ============

/**
 * Ranked top-N candidates for an assessment (percentage desc, score desc,
 * earlier submission wins ties). Heavy read served from Redis.
 */
const leaderboard = async (user: AuthUser, assessmentId: string, query: LeaderboardQuery) => {
  await assertAssessmentAccess(user, assessmentId);

  return cached(
    cacheKey('results:leaderboard', assessmentId, query.limit),
    TTL.medium,
    async () => {
      const results = await prisma.result.findMany({
        where: { attempt: { assessmentId } },
        orderBy: [{ percentage: 'desc' }, { score: 'desc' }, { createdAt: 'asc' }],
        take: query.limit,
        include: {
          attempt: {
            select: {
              id: true,
              status: true,
              submittedAt: true,
              candidate: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      return {
        assessmentId,
        leaderboard: results.map((result, index) => ({
          rank: index + 1,
          ...withPublication(result),
        })),
      };
    }
  );
};

export const ResultsService = {
  myResults,
  mySummary,
  getById,
  publish,
  unpublish,
  assessmentResults,
  leaderboard,
};

