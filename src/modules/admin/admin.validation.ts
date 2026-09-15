import { z } from 'zod';

const sortableFields = ['name', 'email', 'role', 'createdAt'] as const;

export const listUsersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    role: z.enum(['CANDIDATE', 'RECRUITER', 'ADMIN']).optional(),
    isDeleted: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(sortableFields).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>['query'];
