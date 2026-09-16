import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { AdminService } from './admin.service';
import {
  ListUsersQuery,
  UpdateUserStatusInput,
  UpdateUserRoleInput,
  SearchUsersQuery,
} from './admin.validation';

const listUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listUsers(req.query as unknown as ListUsersQuery);
  sendSuccess(res, result, 'Users fetched successfully');
});

const searchUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.searchUsers(req.query as unknown as SearchUsersQuery);
  sendSuccess(res, result, 'Users searched successfully');
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const { status } = req.body as UpdateUserStatusInput;
  await AdminService.updateUserStatus(status.status);
  sendSuccess(res, { status: status.status }, 'User status updated successfully');
});

const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const { role } = req.body as UpdateUserRoleInput;
  const userId = req.params.id;
  await AdminService.updateUserRole(userId, role.role);
  sendSuccess(res, { role: role.role }, 'User role updated successfully');
});

const dashboardStats = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.dashboardStats();
  sendSuccess(res, result, 'Dashboard statistics fetched successfully');
});

const listPayments = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await AdminService.listPayments(user as AuthUser, req.query as any);
  sendSuccess(res, result, 'Payments fetched successfully');
});

const listAssessments = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listAssessments();
  sendSuccess(res, result, 'Assessments fetched successfully');
});

const listAuditLogs = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listAuditLogs(req.query as any);
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