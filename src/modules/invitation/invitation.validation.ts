import { z } from 'zod';

export const sendInvitationSchema = z.object({
  body: z.object({
    assessmentId: z.string().uuid('assessmentId must be a valid UUID'),
    candidateEmail: z.string().email('A valid candidate email is required').toLowerCase(),
    expiresAt: z.coerce
      .date()
      .refine((d) => d.getTime() > Date.now(), { message: 'expiresAt must be in the future' })
      .optional(),
  }),
});

export const listInvitationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED']).optional(),
    sortBy: z.enum(['createdAt', 'respondedAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type SendInvitationInput = z.infer<typeof sendInvitationSchema>['body'];
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>['query'];
