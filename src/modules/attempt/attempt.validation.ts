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

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>['body'];
