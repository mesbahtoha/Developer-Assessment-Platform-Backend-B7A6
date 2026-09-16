import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { EvaluationService } from './evaluation.service';
import { EvaluateInput, ListResultsQuery, PendingQuery } from './evaluation.validation';

const listPending = catchAsync(async (req: Request, res: Response) => {
  const result = await EvaluationService.listPending(
    req.user!,
    req.query as unknown as PendingQuery
  );
  sendSuccess(res, result, 'Pending submissions fetched successfully');
});

const evaluateSubmission = catchAsync(async (req: Request, res: Response) => {
  const result = await EvaluationService.evaluateSubmission(
    req.user!,
    req.params.id,
    req.body as EvaluateInput
  );
  sendSuccess(res, result, 'Submission evaluated successfully');
});

const myResults = catchAsync(async (req: Request, res: Response) => {
  const result = await EvaluationService.myResults(
    req.user!,
    req.query as unknown as ListResultsQuery
  );
  sendSuccess(res, result, 'Results fetched successfully');
});

const assessmentResults = catchAsync(async (req: Request, res: Response) => {
  const result = await EvaluationService.assessmentResults(
    req.user!,
    req.params.id,
    req.query as unknown as ListResultsQuery
  );
  sendSuccess(res, result, 'Assessment results fetched successfully');
});

const assessmentReport = catchAsync(async (req: Request, res: Response) => {
  const report = await EvaluationService.assessmentReport(req.user!, req.params.id);
  sendSuccess(res, { report }, 'Assessment report generated successfully');
});

export const EvaluationController = {
  listPending,
  evaluateSubmission,
  myResults,
  assessmentResults,
  assessmentReport,
};
