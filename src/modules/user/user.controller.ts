import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { UserService } from './user.service';
import { UpdateMeInput, UpdateProfileInput } from './user.validation';

const getMe = catchAsync(async (req: Request, res: Response) => {
  const user = await UserService.getMe(req.user!.id);
  sendSuccess(res, { user }, 'Profile fetched successfully');
});

const updateMe = catchAsync(async (req: Request, res: Response) => {
  const user = await UserService.updateMe(req.user!.id, req.body as UpdateMeInput);
  sendSuccess(res, { user }, 'Profile updated successfully');
});

/** Candidate developer profile / recruiter company profile. */
const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getMyProfile(req.user!.id, req.user!.role);
  sendSuccess(res, result, 'Profile fetched successfully');
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
  const profile = await UserService.updateMyProfile(
    req.user!.id,
    req.user!.role,
    req.body as UpdateProfileInput
  );
  sendSuccess(res, { profile }, 'Profile updated successfully');
});

export const UserController = { getMe, updateMe, getMyProfile, updateMyProfile };
