import { z } from 'zod';

export const createCheckoutSchema = z.object({
  body: z.object({
    assessmentId: z.string().uuid('assessmentId must be a valid UUID'),
    amountInCents: z.coerce.number().int().min(50, 'Minimum amount is 50 cents').max(100000000),
  }),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>['body'];
