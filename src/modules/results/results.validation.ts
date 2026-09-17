import { z } from 'zod';

// ---------- Shared field schemas ----------

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
};

const isPassedFilter = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const resultSortField = z.enum(['score', 'percentage', 'createdAt']);

// ---------- Params ----------

export const resultIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Result id must be a valid UUID') }),
});

export const assessmentIdParamSchema = z.object({
  params: z.object({ assessmentId: z.string().uuid('Assessment id must be a valid UUID') }),
});

// ---------- Queries ----------

export const myResultsQuerySchema = z.object({
  query: z.object({
    ...pagination,
    assessmentId: z.string().uuid().optional(),
    isPassed: isPassedFilter,
    sortBy: resultSortField.default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const assessmentResultsQuerySchema = z.object({
  query: z.object({
    ...pagination,
    isPassed: isPassedFilter,
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: resultSortField.default('percentage'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const leaderboardQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});

// ---------- Inferred types ----------

export type ResultIdParam = z.infer<typeof resultIdParamSchema>['params'];
export type AssessmentIdParam = z.infer<typeof assessmentIdParamSchema>['params'];
export type MyResultsQuery = z.infer<typeof myResultsQuerySchema>['query'];
export type AssessmentResultsQuery = z.infer<typeof assessmentResultsQuerySchema>['query'];
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>['query'];
