import { z } from 'zod';

const sortableFields = ['name', 'email', 'role', 'createdAt'] as const;

export const listUsersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    role: z.enum(['CANDIDATE', 'RECRUITER', 'ADMIN']).optional(),
    isDeleted: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(sortableFields).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const updateUserStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('User id must be a valid UUID') }),
  body: z.object({ isActive: z.boolean({ required_error: 'isActive is required' }) }),
});

export const updateUserRoleSchema = z.object({
  params: z.object({ id: z.string().uuid('User id must be a valid UUID') }),
  body: z.object({ role: z.enum(['CANDIDATE', 'RECRUITER', 'ADMIN']) }),
});

export const searchUsersQuerySchema = z.object({
  query: z.object({
    q: z.string().trim().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});

export const listAuditLogsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    action: z.string().trim().min(1).max(100).optional(),
    actorId: z.string().uuid('actorId must be a valid UUID').optional(),
    targetType: z.string().trim().min(1).max(50).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const listAdminPaymentsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
    assessmentId: z.string().uuid('assessmentId must be a valid UUID').optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'amount', 'status']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const listAdminAssessmentsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']).optional(),
    recruiterId: z.string().uuid('recruiterId must be a valid UUID').optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'title', 'price']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>['query'];
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>['query'];
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>['query'];
export type ListAdminPaymentsQuery = z.infer<typeof listAdminPaymentsQuerySchema>['query'];
export type ListAdminAssessmentsQuery = z.infer<typeof listAdminAssessmentsQuerySchema>['query'];
