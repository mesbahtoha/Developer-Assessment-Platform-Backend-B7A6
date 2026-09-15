import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { AdminService } from './admin.service';
import { ListUsersQuery } from './admin.validation';

const listUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.listUsers(req.query as unknown as ListUsersQuery);
  sendSuccess(res, result, 'Users fetched successfully');
});

export const AdminController = { listUsers };
