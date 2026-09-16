import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { AdminService } from './admin.service';
import {
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
  const result = await AdminService.updateUserStatus(req.params.id, body.isActive);
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
  const user = (req as unknown as { user: AuthUser }).user;
  const result = await AdminService.listPayments(
    user,
    req.query as unknown as { page?: number; limit?: number }
  );
  sendSuccess(res, result, 'Payments fetched successfully');
});

const listAssessments = catchAsync(async (_req: Request, res: Response) => {
  const result = await AdminService.listAssessments();
  sendSuccess(res, result, 'Assessments fetched successfully');
});

const listAuditLogs = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listAuditLogs(
    req.query as unknown as { page?: number; limit?: number; action?: string }
  );
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