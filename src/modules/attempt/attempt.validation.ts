import { z } from 'zod';

export const createSubmissionSchema = z.object({
  body: z.object({
    problemId: z.string().uuid('problemId must be a valid UUID'),
    answer: z
      .string()
      .trim()
      .min(1, 'Answer is required')
      .max(10000, 'Answer is too long (max 10000 characters)'),
    language: z.string().trim().max(30).optional(),
  }),
});

export const listMyAttemptsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'EXPIRED']).optional(),
    assessmentId: z.string().uuid('assessmentId must be a valid UUID').optional(),
    sortBy: z.enum(['createdAt', 'startedAt', 'submittedAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>['body'];
export type ListMyAttemptsQuery = z.infer<typeof listMyAttemptsQuerySchema>['query'];
