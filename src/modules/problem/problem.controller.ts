import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { ProblemService } from './problem.service';
import {
  CreateProblemInput,
  ListProblemsQuery,
  UpdateProblemInput,
} from './problem.validation';

const create = catchAsync(async (req: Request, res: Response) => {
  const problem = await ProblemService.create(req.user!, req.body as CreateProblemInput);
  sendSuccess(res, { problem }, 'Problem created successfully', 201);
});

const list = catchAsync(async (req: Request, res: Response) => {
  const result = await ProblemService.list(req.user!, req.query as unknown as ListProblemsQuery);
  sendSuccess(res, result, 'Problems fetched successfully');
});

const getById = catchAsync(async (req: Request, res: Response) => {
  const problem = await ProblemService.getById(req.user!, req.params.id);
  sendSuccess(res, { problem }, 'Problem fetched successfully');
});

const update = catchAsync(async (req: Request, res: Response) => {
  const problem = await ProblemService.update(
    req.user!,
    req.params.id,
    req.body as UpdateProblemInput
  );
  sendSuccess(res, { problem }, 'Problem updated successfully');
});

const softDelete = catchAsync(async (req: Request, res: Response) => {
  const result = await ProblemService.softDelete(req.user!, req.params.id);
  sendSuccess(res, result, 'Problem deleted successfully');
});

const search = catchAsync(async (req: Request, res: Response) => {
  const { q, limit } = (req as unknown as { query: { q: string; limit: number } }).query;
  const result = await ProblemService.search(req.user!, q, limit);
  sendSuccess(res, result, 'Problem search completed');
});

export const ProblemController = { create, list, getById, update, softDelete, search };
