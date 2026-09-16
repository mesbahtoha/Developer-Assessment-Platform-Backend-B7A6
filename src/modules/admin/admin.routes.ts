import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { requireAdmin } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { AdminController } from './admin.controller';
import {
  listUsersQuerySchema,
  updateUserStatusSchema,
  updateUserRoleSchema,
  searchUsersQuerySchema,
  listAuditLogsQuerySchema,
} from './admin.validation';

const router = Router();

// ADMIN-only: user management (strict RBAC)
router.use(verifyAuth, requireAdmin);

// ---------- User listing ----------
router.get(
  '/users',
  validate(listUsersQuerySchema, ['query']),
  AdminController.listUsers
);

// ---------- User search (must be BEFORE '/users/:id/...' style routes) ----------
router.get(
  '/users/search',
  validate(searchUsersQuerySchema, ['query']),
  AdminController.searchUsers
);

// ---------- User status update ----------
router.patch(
  '/users/:id/status',
  validate(updateUserStatusSchema, ['params', 'body']),
  AdminController.updateUserStatus
);

// ---------- User role update ----------
router.patch(
  '/users/:id/role',
  validate(updateUserRoleSchema, ['params', 'body']),
  AdminController.updateUserRole
);

// ---------- Dashboard statistics ----------
router.get('/dashboard-stats', AdminController.dashboardStats);

// ---------- Payments ----------
router.get('/payments', AdminController.listPayments);

// ---------- Assessments ----------
router.get('/assessments', AdminController.listAssessments);

// ---------- Audit logs ----------
router.get(
  '/audit-logs',
  validate(listAuditLogsQuerySchema, ['query']),
  AdminController.listAuditLogs
);

export const adminRoutes = router;