import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { AssessmentService } from './assessment.service';
import {
  CreateAssessmentInput,
  ListAssessmentsQuery,
  UpdateAssessmentInput,
} from './assessment.validation';

const create = catchAsync(async (req: Request, res: Response) => {
  const assessment = await AssessmentService.create(
    req.user!,
    req.body as CreateAssessmentInput
  );
  sendSuccess(res, { assessment }, 'Assessment created successfully', 201);
});

const list = catchAsync(async (req: Request, res: Response) => {
  const result = await AssessmentService.list(
    req.user!,
    req.query as unknown as ListAssessmentsQuery
  );
  sendSuccess(res, result, 'Assessments fetched successfully');
});

const getById = catchAsync(async (req: Request, res: Response) => {
  const assessment = await AssessmentService.getForUser(req.user!, req.params.id);
  sendSuccess(res, { assessment }, 'Assessment fetched successfully');
});

const update = catchAsync(async (req: Request, res: Response) => {
  const assessment = await AssessmentService.update(
    req.user!,
    req.params.id,
    req.body as UpdateAssessmentInput
  );
  sendSuccess(res, { assessment }, 'Assessment updated successfully');
});

const softDelete = catchAsync(async (req: Request, res: Response) => {
  const result = await AssessmentService.softDelete(req.user!, req.params.id);
  sendSuccess(res, result, 'Assessment deleted successfully');
});

const attachProblems = catchAsync(async (req: Request, res: Response) => {
  const { problemIds } = req.body as { problemIds: string[] };
  const result = await AssessmentService.attachProblems(req.user!, req.params.id, problemIds);
  sendSuccess(res, result, 'Problems attached to assessment');
});

const detachProblem = catchAsync(async (req: Request, res: Response) => {
  const result = await AssessmentService.detachProblem(req.user!, req.params.id, req.params.problemId);
  sendSuccess(res, result, 'Problem detached from assessment');
});

export const AssessmentController = {
  create,
  list,
  getById,
  update,
  softDelete,
  attachProblems,
  detachProblem,
};
