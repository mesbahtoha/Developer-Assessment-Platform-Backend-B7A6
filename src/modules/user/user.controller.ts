import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { UserService } from './user.service';
import { UpdateMeInput } from './user.validation';

const getMe = catchAsync(async (req: Request, res: Response) => {
  const user = await UserService.getMe(req.user!.id);
  sendSuccess(res, { user }, 'Profile fetched successfully');
});

const updateMe = catchAsync(async (req: Request, res: Response) => {
  const user = await UserService.updateMe(req.user!.id, req.body as UpdateMeInput);
  sendSuccess(res, { user }, 'Profile updated successfully');
});

export const UserController = { getMe, updateMe };
