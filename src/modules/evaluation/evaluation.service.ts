import { AttemptStatus, EvaluationMethod, Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { AuthUser } from '../../middlewares/auth';
import { EvaluateInput, ListResultsQuery, PendingQuery } from './evaluation.validation';

const paginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const assertAssessmentAccess = async (user: AuthUser, assessmentId: string) => {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, isDeleted: false },
  });
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (user.role === 'RECRUITER' && assessment.recruiterId !== user.id) {
    throw ApiError.notFound('Assessment not found');
  }
  return assessment;
};

/** Recompute and persist the Result for an attempt (score/percentage/pass-fail). */
const recomputeResult = async (
  tx: Prisma.TransactionClient,
  attemptId: string,
  assessmentPassScorePercent: number
) => {
  const [submissions, attached] = await Promise.all([
    tx.submission.findMany({ where: { attemptId } }),
    tx.assessmentProblem.findMany({
      where: { assessmentId: (await tx.attempt.findUniqueOrThrow({ where: { id: attemptId } })).assessmentId },
      include: { problem: { select: { points: true } } },
    }),
  ]);
  const totalPoints = attached.reduce((sum, ap) => sum + (ap.points ?? ap.problem.points), 0);
  const score = submissions.reduce((sum, s) => sum + (s.pointsAwarded ?? 0), 0);
  const percentage = totalPoints === 0 ? 0 : Math.round((score / totalPoints) * 10000) / 100;
  const isPassed = percentage >= assessmentPassScorePercent;

  return tx.result.upsert({
    where: { attemptId },
    update: { score, totalPoints, percentage, isPassed },
    create: { attemptId, score, totalPoints, percentage, isPassed },
  });
};

// ============ PENDING EVALUATION QUEUE ============

const listPending = async (user: AuthUser, query: PendingQuery) => {
  const attemptWhere: Prisma.AttemptWhereInput = {
    ...(query.assessmentId ? { assessmentId: query.assessmentId } : {}),
    ...(user.role === 'RECRUITER' ? { assessment: { recruiterId: user.id } } : {}),
  };
  const where: Prisma.SubmissionWhereInput = {
    status: 'SUBMITTED', // awaiting manual evaluation (CODE answers)
    attempt: attemptWhere,
  };

  const [total, submissions] = await prisma.$transaction([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      include: {
        problem: { select: { id: true, title: true, type: true, points: true } },
        attempt: {
          select: {
            id: true,
            submittedAt: true,
            candidate: { select: { id: true, name: true, email: true } },
            assessment: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { submissions, meta: paginationMeta(query.page, query.limit, total) };
};

// ============ MANUAL EVALUATION ============

const evaluateSubmission = async (user: AuthUser, submissionId: string, input: EvaluateInput) => {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId },
    include: {
      problem: true,
      attempt: { include: { assessment: { select: { recruiterId: true, passScorePercent: true } } } },
    },
  });
  if (!submission) throw ApiError.notFound('Submission not found');

  const { problem, attempt } = submission;
  if (user.role === 'RECRUITER' && attempt.assessment.recruiterId !== user.id) {
    throw ApiError.forbidden('This submission does not belong to your assessment');
  }
  // Prevent duplicate evaluation (MCQ submissions are auto-evaluated already)
  if (submission.status === 'EVALUATED') {
    throw ApiError.conflict('Submission has already been evaluated');
  }

  const linked = await prisma.assessmentProblem.findFirst({
    where: { assessmentId: attempt.assessmentId, problemId: submission.problemId },
    include: { problem: { select: { points: true } } },
  });
  const maxScore = linked ? (linked.points ?? problem.points) : problem.points;
  if (input.score > maxScore) {
    throw ApiError.badRequest(`Score cannot exceed the maximum of ${maxScore} points`);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.upsert({
      where: { submissionId },
      update: {
        score: input.score,
        maxScore,
        method: EvaluationMethod.MANUAL,
        evaluatedById: user.id,
        feedback: input.feedback,
      },
      create: {
        submissionId,
        score: input.score,
        maxScore,
        method: EvaluationMethod.MANUAL,
        evaluatedById: user.id,
        feedback: input.feedback,
      },
    });

    const updatedSubmission = await tx.submission.update({
      where: { id: submissionId },
      data: { status: 'EVALUATED', pointsAwarded: input.score, evaluatedAt: new Date() },
    });

    // Update the result after evaluation (same transaction)
    const result = await recomputeResult(tx, attempt.id, attempt.assessment.passScorePercent);

    // When nothing is left awaiting evaluation, mark the attempt EVALUATED
    const remaining = await tx.submission.count({
      where: { attemptId: attempt.id, status: { not: 'EVALUATED' } },
    });
    let attemptStatus = attempt.status;
    if (remaining === 0 && attempt.status === AttemptStatus.SUBMITTED) {
      const updated = await tx.attempt.update({
        where: { id: attempt.id },
        data: { status: AttemptStatus.EVALUATED },
      });
      attemptStatus = updated.status;
    }

    return { evaluation, submission: updatedSubmission, result, attemptStatus };
  });

  await audit({
    actorId: user.id,
    action: 'EVALUATION_RECORDED',
    targetType: 'SUBMISSION',
    targetId: submissionId,
    meta: { score: input.score, maxScore, attemptId: attempt.id },
  });
  return outcome;
};

// ============ RESULTS ============

const myResults = async (user: AuthUser, query: ListResultsQuery) => {
  const where: Prisma.ResultWhereInput = { attempt: { candidateId: user.id } };

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
            assessment: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { results, meta: paginationMeta(query.page, query.limit, total) };
};

const assessmentResults = async (user: AuthUser, assessmentId: string, query: ListResultsQuery) => {
  await assertAssessmentAccess(user, assessmentId);

  const where: Prisma.ResultWhereInput = {
    attempt: { assessmentId },
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

  return { results, meta: paginationMeta(query.page, query.limit, total) };
};

// ============ ASSESSMENT REPORT ============

const assessmentReport = async (user: AuthUser, assessmentId: string) => {
  await assertAssessmentAccess(user, assessmentId);

  const [statusGroups, resultAgg, passCount, submissions, topScorers] = await Promise.all([
    prisma.attempt.groupBy({ by: ['status'], where: { assessmentId }, _count: { _all: true } }),
    prisma.result.aggregate({
      where: { attempt: { assessmentId } },
      _avg: { percentage: true },
      _max: { percentage: true },
      _min: { percentage: true },
      _count: { _all: true },
    }),
    prisma.result.count({ where: { attempt: { assessmentId }, isPassed: true } }),
    prisma.submission.findMany({
      where: { attempt: { assessmentId } },
      select: {
        problemId: true,
        pointsAwarded: true,
        problem: { select: { title: true } },
      },
    }),
    prisma.result.findMany({
      where: { attempt: { assessmentId } },
      orderBy: [{ score: 'desc' }, { percentage: 'desc' }],
      take: 5,
      include: {
        attempt: {
          select: {
            id: true,
            status: true,
            candidate: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
  ]);

  const attemptsByStatus: Record<string, number> = {};
  for (const g of statusGroups) attemptsByStatus[g.status] = g._count._all;
  const totalResults = resultAgg._count._all;

  // Per-problem difficulty report (accuracy = share of submissions with points > 0)
  const byProblem = new Map<
    string,
    { problemId: string; problemTitle: string; submissions: number; correct: number }
  >();
  for (const s of submissions) {
    const entry = byProblem.get(s.problemId) ?? {
      problemId: s.problemId,
      problemTitle: s.problem.title,
      submissions: 0,
      correct: 0,
    };
    entry.submissions += 1;
    if ((s.pointsAwarded ?? 0) > 0) entry.correct += 1;
    byProblem.set(s.problemId, entry);
  }
  const perProblem = [...byProblem.values()].map((p) => ({
    ...p,
    accuracy: p.submissions === 0 ? 0 : Math.round((p.correct / p.submissions) * 10000) / 100,
  }));

  return {
    assessmentId,
    attempts: {
      total: statusGroups.reduce((sum, g) => sum + g._count._all, 0),
      byStatus: attemptsByStatus,
    },
    results: {
      total: totalResults,
      averagePercentage: Math.round((resultAgg._avg.percentage ?? 0) * 100) / 100,
      highestPercentage: Math.round((resultAgg._max.percentage ?? 0) * 100) / 100,
      lowestPercentage: Math.round((resultAgg._min.percentage ?? 0) * 100) / 100,
      passCount,
      failCount: totalResults - passCount,
      passRate:
        totalResults === 0
          ? 0
          : Math.round((passCount / totalResults) * 10000) / 100,
    },
    perProblem,
    topScorers,
  };
};

export const EvaluationService = {
  listPending,
  evaluateSubmission,
  myResults,
  assessmentResults,
  assessmentReport,
};
