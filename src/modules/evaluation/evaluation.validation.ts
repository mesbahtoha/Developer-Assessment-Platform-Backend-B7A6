import { z } from 'zod';

export const evaluateSchema = z.object({
  body: z.object({
    score: z.coerce
      .number()
      .int('Score must be an integer')
      .min(0, 'Score cannot be negative'),
    feedback: z.string().trim().max(1000, 'Feedback too long (max 1000)').optional(),
  }),
});

export const pendingQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    assessmentId: z.string().uuid().optional(),
  }),
});

export const listResultsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    isPassed: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    sortBy: z.enum(['score', 'percentage', 'createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type EvaluateInput = z.infer<typeof evaluateSchema>['body'];
export type PendingQuery = z.infer<typeof pendingQuerySchema>['query'];
export type ListResultsQuery = z.infer<typeof listResultsQuerySchema>['query'];
