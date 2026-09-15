import { Prisma } from '@prisma/client';
import { ApiError } from '../../shared/catchAsync';
import { audit } from '../../shared/audit';
import prisma from '../../shared/prisma';
import { AuthUser } from '../../middlewares/auth';
import {
  CreateProblemInput,
  ListProblemsQuery,
  UpdateProblemInput,
  problemBodySchema,
} from './problem.validation';

export const problemSelect = {
  id: true,
  title: true,
  type: true,
  difficulty: true,
  prompt: true,
  options: true,
  correctAnswer: true,
  points: true,
  tags: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProblemSelect;

const assertOwnership = (
  problem: { createdById: string },
  user: AuthUser
): void => {
  if (user.role === 'ADMIN') return;
  if (problem.createdById !== user.id) {
    throw ApiError.forbidden('You can only manage your own problems');
  }
};

const create = async (user: AuthUser, input: CreateProblemInput) => {
  const problem = await prisma.problem.create({
    data: {
      title: input.title,
      type: input.type,
      difficulty: input.difficulty,
      prompt: input.prompt,
      options: (input.options ?? Prisma.JsonNull) as never,
      correctAnswer: input.correctAnswer,
      points: input.points,
      tags: input.tags,
      createdById: user.id,
    },
    select: problemSelect,
  });

  await audit({
    actorId: user.id,
    action: 'PROBLEM_CREATED',
    targetType: 'PROBLEM',
    targetId: problem.id,
  });
  return problem;
};

const list = async (user: AuthUser, query: ListProblemsQuery) => {
  const where: Prisma.ProblemWhereInput = {
    isDeleted: false,
    // Recruiters only see their own problem bank; ADMIN sees everything
    ...(user.role === 'RECRUITER' ? { createdById: user.id } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { prompt: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, problems] = await prisma.$transaction([
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      select: problemSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    problems,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
};

const getById = async (user: AuthUser, id: string) => {
  const problem = await prisma.problem.findFirst({
    where: { id, isDeleted: false },
    select: problemSelect,
  });
  if (!problem) throw ApiError.notFound('Problem not found');
  assertOwnership(problem, user);
  return problem;
};

const update = async (user: AuthUser, id: string, patch: UpdateProblemInput) => {
  const existing = await prisma.problem.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw ApiError.notFound('Problem not found');
  assertOwnership(existing, user);

  // Merge patch over current values, then re-validate the whole body
  // (keeps MCQ options/correctAnswer consistency rules intact)
  const merged = {
    title: patch.title ?? existing.title,
    type: patch.type ?? existing.type,
    difficulty: patch.difficulty ?? existing.difficulty,
    prompt: patch.prompt ?? existing.prompt,
    options:
      patch.options !== undefined
        ? patch.options
        : existing.options !== null
          ? (existing.options as string[])
          : undefined,
    correctAnswer: patch.correctAnswer ?? existing.correctAnswer,
    points: patch.points ?? existing.points,
    tags: patch.tags ?? existing.tags,
  };

  const parsed = problemBodySchema.safeParse(merged);
  if (!parsed.success) {
    throw ApiError.badRequest(
      'Validation failed',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    );
  }
  const validated = parsed.data;

  const problem = await prisma.problem.update({
    where: { id },
    data: {
      title: validated.title,
      type: validated.type,
      difficulty: validated.difficulty,
      prompt: validated.prompt,
      options: (validated.options ?? Prisma.JsonNull) as never,
      correctAnswer: validated.correctAnswer,
      points: validated.points,
      tags: validated.tags,
    },
    select: problemSelect,
  });

  await audit({
    actorId: user.id,
    action: 'PROBLEM_UPDATED',
    targetType: 'PROBLEM',
    targetId: id,
  });
  return problem;
};

const softDelete = async (user: AuthUser, id: string) => {
  const existing = await prisma.problem.findFirst({
    where: { id, isDeleted: false },
  });
  if (!existing) throw ApiError.notFound('Problem not found');
  assertOwnership(existing, user);

  await prisma.problem.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await audit({
    actorId: user.id,
    action: 'PROBLEM_SOFT_DELETED',
    targetType: 'PROBLEM',
    targetId: id,
  });
  return { id };
};

const search = async (user: AuthUser, q: string, limit: number) => {
  const problems = await prisma.problem.findMany({
    where: {
      isDeleted: false,
      ...(user.role === 'RECRUITER' ? { createdById: user.id } : {}),
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { prompt: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: problemSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return { problems, count: problems.length };
};

export const ProblemService = { create, list, getById, update, softDelete, search };
