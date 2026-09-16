import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { AttemptService } from './attempt.service';
import { CreateSubmissionInput } from './attempt.validation';

const start = catchAsync(async (req: Request, res: Response) => {
  const attempt = await AttemptService.start(req.user!, req.params.assessmentId);
  sendSuccess(res, { attempt }, 'Attempt started successfully', 201);
});

const getById = catchAsync(async (req: Request, res: Response) => {
  const attempt = await AttemptService.getById(req.user!, req.params.id);
  sendSuccess(res, { attempt }, 'Attempt fetched successfully');
});

const submit = catchAsync(async (req: Request, res: Response) => {
  const result = await AttemptService.submit(req.user!, req.params.id);
  sendSuccess(res, result, 'Attempt submitted successfully');
});

const createSubmission = catchAsync(async (req: Request, res: Response) => {
  const submission = await AttemptService.createSubmission(
    req.user!,
    req.params.attemptId,
    req.body as CreateSubmissionInput
  );
  sendSuccess(res, { submission }, 'Submission recorded successfully', 201);
});

const listSubmissions = catchAsync(async (req: Request, res: Response) => {
  const submissions = await AttemptService.listSubmissions(req.user!, req.params.attemptId);
  sendSuccess(res, { submissions }, 'Submissions fetched successfully');
});

const getSubmissionById = catchAsync(async (req: Request, res: Response) => {
  const submission = await AttemptService.getSubmissionById(req.user!, req.params.id);
  sendSuccess(res, { submission }, 'Submission fetched successfully');
});

export const AttemptController = {
  start,
  getById,
  submit,
  createSubmission,
  listSubmissions,
  getSubmissionById,
};
