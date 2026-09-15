import { z } from 'zod';

export const createAssessmentSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
    description: z
      .string()
      .trim()
      .min(5, 'Description must be at least 5 characters')
      .max(5000),
    durationMin: z.coerce.number().int().min(5, 'Minimum duration is 5 minutes').max(600).default(60),
    price: z.coerce.number().int().min(0, 'Price cannot be negative').max(100000000).default(0),
    passScorePercent: z.coerce
      .number()
      .int()
      .min(1, 'passScorePercent must be between 1 and 100')
      .max(100)
      .default(50),
  }),
});

export const updateAssessmentSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(150).optional(),
      description: z.string().trim().min(5).max(5000).optional(),
      durationMin: z.coerce.number().int().min(5).max(600).optional(),
      price: z.coerce.number().int().min(0).max(100000000).optional(),
      passScorePercent: z.coerce.number().int().min(1).max(100).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']).optional(),
    })
    .refine((v) => Object.values(v).some((x) => x !== undefined), {
      message: 'Provide at least one field to update',
    }),
});

export const listAssessmentsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    recruiterId: z.string().uuid().optional(), // ADMIN-only filter, enforced in service
    sortBy: z.enum(['title', 'price', 'durationMin', 'createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const attachProblemsSchema = z.object({
  body: z.object({
    problemIds: z
      .array(z.string().uuid('Each problemId must be a valid UUID'))
      .min(1, 'Provide at least one problemId')
      .max(50),
  }),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>['body'];
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>['body'];
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>['query'];
