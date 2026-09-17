import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { AdminService } from './admin.service';
import {
  ListAdminAssessmentsQuery,
  ListAdminPaymentsQuery,
  ListAuditLogsQuery,
  ListUsersQuery,
  SearchUsersQuery,
} from './admin.validation';
import { AuthUser } from '../../middlewares/auth';

const listUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listUsers(req.query as unknown as ListUsersQuery);
  sendSuccess(res, result, 'Users fetched successfully');
});

const searchUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.searchUsers(req.query as unknown as SearchUsersQuery);
  sendSuccess(res, result, 'Users searched successfully');
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as { isActive: boolean };
  const actor = (req as unknown as { user: AuthUser }).user;
  const result = await AdminService.updateUserStatus(req.params.id, body.isActive, actor);
  sendSuccess(res, result, 'User status updated successfully');
});

const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as { role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN' };
  const actor = (req as unknown as { user: AuthUser }).user;
  const result = await AdminService.updateUserRole(req.params.id, body.role, actor);
  sendSuccess(res, result, 'User role updated successfully');
});

const dashboardStats = catchAsync(async (_req: Request, res: Response) => {
  const result = await AdminService.dashboardStats();
  sendSuccess(res, result, 'Dashboard statistics fetched successfully');
});

const listPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listPayments(
    req.query as unknown as ListAdminPaymentsQuery
  );
  sendSuccess(res, result, 'Payments fetched successfully');
});

const listAssessments = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listAssessments(
    req.query as unknown as ListAdminAssessmentsQuery
  );
  sendSuccess(res, result, 'Assessments fetched successfully');
});

const listAuditLogs = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listAuditLogs(req.query as unknown as ListAuditLogsQuery);
  sendSuccess(res, result, 'Audit logs fetched successfully');
});

export const AdminController = {
  listUsers,
  searchUsers,
  updateUserStatus,
  updateUserRole,
  dashboardStats,
  listPayments,
  listAssessments,
  listAuditLogs,
};