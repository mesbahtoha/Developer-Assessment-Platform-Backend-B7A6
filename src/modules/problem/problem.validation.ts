import { z } from 'zod';

const mcqOptions = z.array(z.string().trim().min(1).max(300)).min(2).max(6);

const baseProblemShape = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  type: z.enum(['MCQ', 'CODE']).default('MCQ'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('EASY'),
  prompt: z.string().trim().min(5, 'Prompt must be at least 5 characters').max(5000),
  options: mcqOptions.nullish(),
  correctAnswer: z.string().trim().min(1, 'correctAnswer is required').max(2000),
  points: z.coerce.number().int().min(1, 'points must be at least 1').max(100).default(1),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
};

// Shared MCQ consistency rules (also reused to validate merged update payloads)
export const problemBodySchema = z.object(baseProblemShape).superRefine((val, ctx) => {
  if (val.type === 'MCQ') {
    if (!val.options || val.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'MCQ problems require at least 2 options',
      });
    } else if (!val.options.includes(val.correctAnswer)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctAnswer'],
        message: 'correctAnswer must exactly match one of the options for MCQ problems',
      });
    }
  }
});

export const createProblemSchema = z.object({ body: problemBodySchema });

export const updateProblemSchema = z.object({
  body: z
    .object({
      title: baseProblemShape.title.optional(),
      type: baseProblemShape.type.optional(),
      difficulty: baseProblemShape.difficulty.optional(),
      prompt: baseProblemShape.prompt.optional(),
      options: mcqOptions.nullish(),
      correctAnswer: baseProblemShape.correctAnswer.optional(),
      points: baseProblemShape.points.optional(),
      tags: baseProblemShape.tags.optional(),
    })
    .refine(
      (v) =>
        Object.values(v).some((x) => x !== undefined),
      { message: 'Provide at least one field to update' }
    ),
});

export const listProblemsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    type: z.enum(['MCQ', 'CODE']).optional(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['title', 'difficulty', 'points', 'createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const searchProblemsQuerySchema = z.object({
  query: z.object({
    q: z.string().trim().min(1, 'Search query q is required').max(100),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  }),
});

export type CreateProblemInput = z.infer<typeof createProblemSchema>['body'];
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>['body'];
export type ListProblemsQuery = z.infer<typeof listProblemsQuerySchema>['query'];
