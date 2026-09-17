import { AssessmentStatus, Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { cached, cacheInvalidate, cacheKey, TTL } from '../../shared/cache';
import { AuthUser } from '../../middlewares/auth';

/** Cache namespaces touched by any assessment write. */
const invalidateAssessmentCache = (): Promise<number> =>
  cacheInvalidate('assessments:list', 'admin:', 'report:assessment');
import {
  CreateAssessmentInput,
  ListAssessmentsQuery,
  UpdateAssessmentInput,
} from './assessment.validation';

// Allowed assessment status lifecycle transitions
const STATUS_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['CLOSED', 'DRAFT', 'ARCHIVED'],
  CLOSED: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: [],
};

const assessmentInclude = {
  problems: {
    orderBy: { order: 'asc' as const },
    include: { problem: true },
  },
  recruiter: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AssessmentInclude;

const assertOwnership = (
  assessment: { recruiterId: string },
  user: AuthUser
): void => {
  if (user.role === 'ADMIN') return;
  if (user.role !== 'RECRUITER' || assessment.recruiterId !== user.id) {
    // 404 (not 403) so foreign assessments cannot be probed
    throw ApiError.notFound('Assessment not found');
  }
};

const create = async (user: AuthUser, input: CreateAssessmentInput) => {
  const assessment = await prisma.assessment.create({
    data: {
      title: input.title,
      description: input.description,
      durationMin: input.durationMin,
      price: input.price,
      passScorePercent: input.passScorePercent,
      status: AssessmentStatus.DRAFT,
      recruiterId: user.id,
    },
  });

  await audit({
    actorId: user.id,
    action: 'ASSESSMENT_CREATED',
    targetType: 'ASSESSMENT',
    targetId: assessment.id,
  });
  await invalidateAssessmentCache();
  return assessment;
};

const fetchList = async (user: AuthUser, query: ListAssessmentsQuery) => {
  const where: Prisma.AssessmentWhereInput = { isDeleted: false };

  if (user.role === 'CANDIDATE') {
    // Candidates only ever see published assessments
    where.status = AssessmentStatus.PUBLISHED;
  } else if (user.role === 'RECRUITER') {
    where.recruiterId = user.id;
    if (query.status) where.status = query.status;
  } else {
    // ADMIN: everything, with optional filters
    if (query.status) where.status = query.status;
    if (query.recruiterId) where.recruiterId = query.recruiterId;
  }

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
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { _count: { select: { problems: true, attempts: true } } },
    }),
  ]);

  return {
    assessments,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
};

/** Redis read-through cache for assessment listings (per role/user/query). */
const list = async (user: AuthUser, query: ListAssessmentsQuery) => {
  const key = cacheKey(
    'assessments:list',
    user.role,
    user.role === 'RECRUITER' ? user.id : 'all',
    JSON.stringify(query)
  );
  return cached(key, TTL.short, () => fetchList(user, query));
};

const getForUser = async (user: AuthUser, id: string) => {
  const assessment = await prisma.assessment.findFirst({
    where: { id, isDeleted: false },
    include: assessmentInclude,
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');

  if (user.role === 'CANDIDATE') {
    if (assessment.status !== AssessmentStatus.PUBLISHED) {
      throw ApiError.notFound('Assessment not found');
    }
    // Strip correct answers from candidate view
    const { problems, ...rest } = assessment;
    return {
      ...rest,
      problems: problems.map((ap) => ({
        id: ap.problem.id,
        title: ap.problem.title,
        type: ap.problem.type,
        difficulty: ap.problem.difficulty,
        prompt: ap.problem.prompt,
        options: ap.problem.options,
        points: ap.points ?? ap.problem.points,
        order: ap.order,
      })),
    };
  }

  assertOwnership(assessment, user);
  return assessment;
};

const update = async (user: AuthUser, id: string, patch: UpdateAssessmentInput) => {
  const existing = await prisma.assessment.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw ApiError.notFound('Assessment not found');
  assertOwnership(existing, user);

  const { status, ...fields } = patch;
  const data: Prisma.AssessmentUpdateInput = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.durationMin !== undefined) data.durationMin = fields.durationMin;
  if (fields.price !== undefined) data.price = fields.price;
  if (fields.passScorePercent !== undefined) data.passScorePercent = fields.passScorePercent;

  let auditAction = 'ASSESSMENT_UPDATED';

  if (status !== undefined && status !== existing.status) {
    const allowed = STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(status)) {
      throw ApiError.badRequest(
        `Invalid status transition: ${existing.status} -> ${status}. Allowed: ${allowed.join(', ') || 'none'}`
      );
    }
    data.status = status;
    auditAction = `ASSESSMENT_${status}`;
  }

  // Publishing requires at least one attached problem (checked inside the tx)
  const assessment = await prisma.$transaction(async (tx) => {
    if (data.status === AssessmentStatus.PUBLISHED) {
      const problemCount = await tx.assessmentProblem.count({ where: { assessmentId: id } });
      if (problemCount === 0) {
        throw ApiError.badRequest('Cannot publish an assessment without at least one problem');
      }
    }
    return tx.assessment.update({ where: { id }, data });
  });

  await audit({
    actorId: user.id,
    action: auditAction,
    targetType: 'ASSESSMENT',
    targetId: id,
    meta: { status: assessment.status },
  });
  await invalidateAssessmentCache();
  return assessment;
};

const softDelete = async (user: AuthUser, id: string) => {
  const existing = await prisma.assessment.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw ApiError.notFound('Assessment not found');
  assertOwnership(existing, user);

  await prisma.assessment.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    actorId: user.id,
    action: 'ASSESSMENT_SOFT_DELETED',
    targetType: 'ASSESSMENT',
    targetId: id,
  });
  await invalidateAssessmentCache();
  return { id };
};

const attachProblems = async (user: AuthUser, id: string, problemIds: string[]) => {
  const assessment = await prisma.assessment.findFirst({
    where: { id, isDeleted: false },
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');
  assertOwnership(assessment, user);

  // All problems must exist, not be deleted, and belong to the recruiter
  const problems = await prisma.problem.findMany({
    where: { id: { in: problemIds }, isDeleted: false },
  });
  if (problems.length !== problemIds.length) {
    throw ApiError.badRequest('One or more problems do not exist');
  }
  if (user.role !== 'ADMIN' && problems.some((p) => p.createdById !== user.id)) {
    throw ApiError.forbidden('You can only attach your own problems');
  }

  await prisma.$transaction(async (tx) => {
    const maxOrder = await tx.assessmentProblem.aggregate({
      where: { assessmentId: id },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? 0) + 1;

    await tx.assessmentProblem.createMany({
      data: problemIds.map((problemId) => ({
        assessmentId: id,
        problemId,
        order: nextOrder++,
      })),
      skipDuplicates: true, // unique(assessmentId, problemId) guards duplicates
    });
  });

  const linked = await prisma.assessmentProblem.findMany({
    where: { assessmentId: id },
    orderBy: { order: 'asc' },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          type: true,
          difficulty: true,
          points: true,
        },
      },
    },
  });

  await audit({
    actorId: user.id,
    action: 'ASSESSMENT_PROBLEMS_ATTACHED',
    targetType: 'ASSESSMENT',
    targetId: id,
    meta: { problemIds },
  });

  await invalidateAssessmentCache();
  return { assessmentId: id, problems: linked };
};

const detachProblem = async (user: AuthUser, id: string, problemId: string) => {
  const assessment = await prisma.assessment.findFirst({
    where: { id, isDeleted: false },
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');
  assertOwnership(assessment, user);

  const deleted = await prisma.assessmentProblem.deleteMany({
    where: { assessmentId: id, problemId },
  });
  if (deleted.count === 0) throw ApiError.notFound('Problem is not attached to this assessment');

  await audit({
    actorId: user.id,
    action: 'ASSESSMENT_PROBLEM_DETACHED',
    targetType: 'ASSESSMENT',
    targetId: id,
    meta: { problemId },
  });
  await invalidateAssessmentCache();
  return { assessmentId: id, problemId };
};

export const AssessmentService = {
  create,
  list,
  getForUser,
  update,
  softDelete,
  attachProblems,
  detachProblem,
};
