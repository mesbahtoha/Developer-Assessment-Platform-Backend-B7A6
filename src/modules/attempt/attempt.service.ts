import { AttemptStatus, InvitationStatus, Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import { audit, auditInTx } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { AuthUser } from '../../middlewares/auth';
import { cacheInvalidate } from '../../shared/cache';
import { CreateSubmissionInput, ListMyAttemptsQuery } from './attempt.validation';

const EXPIRED_MSG = 'Attempt has expired; submission not allowed';

/**
 * Server-side time-limit enforcement (rule 6/7).
 * Marks the attempt EXPIRED (outside any transaction so the state persists)
 * when the deadline has passed, then rejects the operation.
 */
const markExpiredIfPast = async (
  attempt: { id: string; status: AttemptStatus; deadlineAt: Date | null },
  actorId: string
): Promise<void> => {
  if (
    attempt.status === AttemptStatus.IN_PROGRESS &&
    attempt.deadlineAt &&
    attempt.deadlineAt < new Date()
  ) {
    await prisma.attempt.update({
      where: { id: attempt.id },
      data: { status: AttemptStatus.EXPIRED },
    });
    await audit({
      actorId,
      action: 'ATTEMPT_EXPIRED',
      targetType: 'ATTEMPT',
      targetId: attempt.id,
    });
    throw ApiError.conflict(EXPIRED_MSG);
  }
};

/** Strict in-transaction status gate (no writes, safe to roll back). */
const assertActive = (attempt: { status: AttemptStatus; deadlineAt: Date | null }): void => {
  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    throw ApiError.conflict(`Attempt is not active (status: ${attempt.status})`);
  }
  if (attempt.deadlineAt && attempt.deadlineAt < new Date()) {
    throw ApiError.conflict(EXPIRED_MSG);
  }
};

// ============ START ============

const start = async (user: AuthUser, assessmentId: string) => {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, isDeleted: false },
  });
  if (!assessment || assessment.status !== 'PUBLISHED') {
    throw ApiError.notFound('Assessment not found');
  }

  // Rule: only invited candidates can start
  const invitation = await prisma.invitation.findFirst({
    where: { assessmentId, candidateId: user.id },
  });
  if (!invitation) {
    throw ApiError.notFound('You are not invited to this assessment');
  }
  if (invitation.status !== InvitationStatus.ACCEPTED) {
    throw ApiError.conflict('You must accept the invitation before starting this assessment');
  }

  // Paid assessments require a completed payment first
  if (assessment.price > 0) {
    const paid = await prisma.payment.findFirst({
      where: { userId: user.id, assessmentId, status: 'PAID' },
    });
    if (!paid) {
      throw ApiError.paymentRequired('Payment required before starting this assessment');
    }
  }

  try {
    const attempt = await prisma.$transaction(async (tx) => {
      // Race-safe duplicate check inside the tx
      const existing = await tx.attempt.findUnique({
        where: { candidateId_assessmentId: { candidateId: user.id, assessmentId } },
      });
      if (existing) {
        throw ApiError.conflict('You have already attempted this assessment');
      }

      const startedAt = new Date();
      const deadlineAt = new Date(startedAt.getTime() + assessment.durationMin * 60 * 1000);

      return tx.attempt.create({
        data: {
          candidateId: user.id,
          assessmentId,
          invitationId: invitation.id,
          status: AttemptStatus.IN_PROGRESS,
          startedAt,
          deadlineAt,
        },
      });
    });

    await audit({
      actorId: user.id,
      action: 'ATTEMPT_STARTED',
      targetType: 'ATTEMPT',
      targetId: attempt.id,
      meta: { assessmentId },
    });
    return attempt;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw ApiError.conflict('You have already attempted this assessment');
    }
    throw e;
  }
};

// ============ ACCESS ============

const attemptInclude = {
  assessment: { select: { id: true, title: true, status: true, recruiterId: true, passScorePercent: true } },
  submissions: { include: { problem: true, evaluation: true }, orderBy: { createdAt: 'asc' as const } },
  result: true,
} satisfies Prisma.AttemptInclude;

const getAccess = async (user: AuthUser, attemptId: string) => {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId },
    include: attemptInclude,
  });
  if (!attempt) throw ApiError.notFound('Attempt not found');

  if (user.role === 'CANDIDATE') {
    if (attempt.candidateId !== user.id) {
      throw ApiError.forbidden("You cannot access another candidate's attempt");
    }
    return { attempt, full: false };
  }
  if (user.role === 'RECRUITER') {
    if (attempt.assessment.recruiterId !== user.id) {
      throw ApiError.forbidden('This attempt does not belong to your assessment');
    }
    return { attempt, full: true };
  }
  return { attempt, full: true }; // ADMIN
};

const getById = async (user: AuthUser, id: string) => {
  const { attempt, full } = await getAccess(user, id);
  const data: Record<string, unknown> = { ...attempt };
  if (!full) {
    // Candidates never see correct answers
    data.submissions = attempt.submissions.map((s) => ({
      id: s.id,
      problemId: s.problemId,
      problemTitle: s.problem.title,
      answer: s.answer,
      language: s.language,
      status: s.status,
      pointsAwarded: s.pointsAwarded,
      submittedAt: s.createdAt,
    }));
  }
  return data;
};

// ============ SUBMIT ============

const submit = async (user: AuthUser, id: string) => {
  // Enforce the time limit before the transaction (state change must persist)
  const pre = await prisma.attempt.findFirst({ where: { id } });
  if (!pre) throw ApiError.notFound('Attempt not found');
  if (pre.candidateId !== user.id) {
    throw ApiError.forbidden('You can only submit your own attempt');
  }
  await markExpiredIfPast(pre, user.id);

  const outcome = await prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.findFirst({
      where: { id },
      include: { assessment: true },
    });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.candidateId !== user.id) {
      throw ApiError.forbidden('You can only submit your own attempt');
    }
    assertActive(attempt);

    const updated = await tx.attempt.update({
      where: { id },
      data: { status: AttemptStatus.SUBMITTED, submittedAt: new Date() },
    });

    // Compute final result from evaluated submissions
    const [submissions, attachedProblems] = await Promise.all([
      tx.submission.findMany({ where: { attemptId: id } }),
      tx.assessmentProblem.findMany({
        where: { assessmentId: attempt.assessmentId },
        include: { problem: { select: { points: true } } },
      }),
    ]);

    const totalPoints = attachedProblems.reduce(
      (sum, ap) => sum + (ap.points ?? ap.problem.points),
      0
    );
    const score = submissions.reduce((sum, s) => sum + (s.pointsAwarded ?? 0), 0);
    const percentage =
      totalPoints === 0 ? 0 : Math.round((score / totalPoints) * 10000) / 100;
    const isPassed = percentage >= attempt.assessment.passScorePercent;

    const result = await tx.result.upsert({
      where: { attemptId: id },
      update: { score, totalPoints, percentage, isPassed },
      create: { attemptId: id, score, totalPoints, percentage, isPassed },
    });

    return { attempt: updated, result };
  });

  await audit({
    actorId: user.id,
    action: 'ATTEMPT_SUBMITTED',
    targetType: 'ATTEMPT',
    targetId: id,
    meta: { score: outcome.result.score, totalPoints: outcome.result.totalPoints },
  });
  // New result affects report analytics and admin dashboard counters
  await cacheInvalidate('report:assessment', 'admin:');
  return outcome;
};

// ============ SUBMISSIONS ============

const sanitizeSubmission = (s: {
  id: string;
  problemId: string;
  answer: string | null;
  language: string | null;
  status: string;
  pointsAwarded: number | null;
  evaluatedAt: Date | null;
  createdAt: Date;
}) => ({
  id: s.id,
  problemId: s.problemId,
  answer: s.answer,
  language: s.language,
  status: s.status,
  pointsAwarded: s.pointsAwarded,
  submittedAt: s.createdAt,
  evaluatedAt: s.evaluatedAt,
});

const createSubmission = async (user: AuthUser, attemptId: string, input: CreateSubmissionInput) => {
  // Enforce the time limit before the transaction (state change must persist)
  const pre = await prisma.attempt.findFirst({ where: { id: attemptId } });
  if (!pre) throw ApiError.notFound('Attempt not found');
  if (pre.candidateId !== user.id) {
    throw ApiError.forbidden('You can only submit answers to your own attempt');
  }
  await markExpiredIfPast(pre, user.id);

  const submission = await prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.findFirst({
      where: { id: attemptId },
      include: { assessment: true },
    });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.candidateId !== user.id) {
      throw ApiError.forbidden('You can only submit answers to your own attempt');
    }
    assertActive(attempt);

    const linked = await tx.assessmentProblem.findFirst({
      where: { assessmentId: attempt.assessmentId, problemId: input.problemId },
      include: { problem: true },
    });
    if (!linked) {
      throw ApiError.notFound('This problem is not part of this assessment');
    }
    const { problem } = linked;

    // Auto-grade MCQ instantly; CODE problems await manual evaluation
    const isMcq = problem.type === 'MCQ';
    const isCorrect = isMcq && problem.correctAnswer === input.answer;
    const pointsAwarded = isCorrect ? (linked.points ?? problem.points) : isMcq ? 0 : null;
    const status = isMcq ? 'EVALUATED' : 'SUBMITTED';

    const saved = await tx.submission.upsert({
      where: { attemptId_problemId: { attemptId, problemId: input.problemId } },
      update: {
        answer: input.answer,
        language: input.language ?? null,
        status,
        pointsAwarded,
        evaluatedAt: isMcq ? new Date() : null,
      },
      create: {
        attemptId,
        problemId: input.problemId,
        answer: input.answer,
        language: input.language ?? null,
        status,
        pointsAwarded,
        evaluatedAt: isMcq ? new Date() : null,
      },
    });

    if (isMcq) {
      await tx.evaluation.upsert({
        where: { submissionId: saved.id },
        update: {
          score: pointsAwarded ?? 0,
          maxScore: linked.points ?? problem.points,
          method: 'AUTO',
          feedback: isCorrect ? 'Correct answer' : 'Incorrect answer',
        },
        create: {
          submissionId: saved.id,
          method: 'AUTO',
          score: pointsAwarded ?? 0,
          maxScore: linked.points ?? problem.points,
          feedback: isCorrect ? 'Correct answer' : 'Incorrect answer',
        },
      });
    } else {
      // CODE resubmission: drop any stale evaluation
      await tx.evaluation.deleteMany({ where: { submissionId: saved.id } });
    }

    await auditInTx(tx)({
      actorId: user.id,
      action: 'SUBMISSION_RECORDED',
      targetType: 'SUBMISSION',
      targetId: saved.id,
      meta: { attemptId, problemId: input.problemId, status },
    });

    return saved;
  });

  return sanitizeSubmission(submission);
};

const listSubmissions = async (user: AuthUser, attemptId: string) => {
  const { attempt, full } = await getAccess(user, attemptId);
  if (full) return attempt.submissions;
  return attempt.submissions.map((s) => ({
    id: s.id,
    problemId: s.problemId,
    problemTitle: s.problem.title,
    answer: s.answer,
    language: s.language,
    status: s.status,
    pointsAwarded: s.pointsAwarded,
    submittedAt: s.createdAt,
    evaluatedAt: s.evaluatedAt,
  }));
};

const getSubmissionById = async (user: AuthUser, submissionId: string) => {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId },
    include: {
      problem: true,
      evaluation: true,
      attempt: {
        include: {
          assessment: { select: { id: true, title: true, recruiterId: true } },
        },
      },
    },
  });
  if (!submission) throw ApiError.notFound('Submission not found');

  const { problem, attempt, ...rest } = submission;
  if (user.role === 'CANDIDATE') {
    if (attempt.candidateId !== user.id) {
      throw ApiError.forbidden("You cannot access another candidate's submission");
    }
    return {
      ...sanitizeSubmission(rest as never),
      problem: {
        id: problem.id,
        title: problem.title,
        type: problem.type,
        difficulty: problem.difficulty,
        prompt: problem.prompt,
        options: problem.options,
        points: problem.points,
      },
    };
  }
  if (user.role === 'RECRUITER' && attempt.assessment.recruiterId !== user.id) {
    throw ApiError.forbidden('This submission does not belong to your assessment');
  }
  return { ...rest, problem, attempt: { id: attempt.id, candidateId: attempt.candidateId } };
};

/**
 * Candidate assessment history: paginated + status-filterable attempt list with the
 * final result attached (score, percentage, pass/fail).
 */
const myAttempts = async (user: AuthUser, query: ListMyAttemptsQuery) => {
  const where: Prisma.AttemptWhereInput = { candidateId: user.id };
  if (query.status) where.status = query.status;
  if (query.assessmentId) where.assessmentId = query.assessmentId;

  const [total, attempts] = await prisma.$transaction([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        status: true,
        startedAt: true,
        deadlineAt: true,
        submittedAt: true,
        createdAt: true,
        assessment: {
          select: {
            id: true,
            title: true,
            durationMin: true,
            price: true,
            passScorePercent: true,
          },
        },
        result: {
          select: {
            score: true,
            totalPoints: true,
            percentage: true,
            isPassed: true,
            publishedAt: true,
          },
        },
        _count: { select: { submissions: true } },
      },
    }),
  ]);

  return {
    attempts,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
};

export const AttemptService = {
  start,
  getById,
  submit,
  createSubmission,
  listSubmissions,
  getSubmissionById,
  myAttempts,
};
