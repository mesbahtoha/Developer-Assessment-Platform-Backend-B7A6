import { z } from 'zod';

export const paymentStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'REFUNDED',
]);

export const createCheckoutSchema = z.object({
  body: z.object({
    assessmentId: z.string().uuid('assessmentId must be a valid UUID'),
    /**
     * Optional. The assessment price stored in the database is the source of truth;
     * when supplied, this value must match it exactly (anti-tampering guard).
     */
    amountInCents: z.coerce
      .number()
      .int()
      .min(50, 'Minimum amount is 50 cents')
      .max(100000000)
      .optional(),
  }),
});

export const listMyPaymentsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: paymentStatusEnum.optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const paymentIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Payment id must be a valid UUID') }),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>['body'];
export type ListMyPaymentsQuery = z.infer<typeof listMyPaymentsQuerySchema>['query'];
