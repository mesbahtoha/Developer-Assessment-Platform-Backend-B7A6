import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { ResultsService } from './results.service';
import {
  AssessmentIdParam,
  AssessmentResultsQuery,
  LeaderboardQuery,
  MyResultsQuery,
  ResultIdParam,
} from './results.validation';

// ---------- Candidate ----------

const myResults = catchAsync(async (req, res) => {
  const data = await ResultsService.myResults(
    req.user!,
    (req.query as unknown) as MyResultsQuery
  );
  sendSuccess(res, data, 'Results fetched successfully', 200);
});

const mySummary = catchAsync(async (req, res) => {
  const data = await ResultsService.mySummary(req.user!);
  sendSuccess(res, data, 'Results summary fetched successfully', 200);
});

// ---------- Result detail & lifecycle ----------

const getById = catchAsync(async (req, res) => {
  const { id } = (req.params as unknown) as ResultIdParam;
  const data = await ResultsService.getById(req.user!, id);
  sendSuccess(res, data, 'Result detail fetched successfully', 200);
});

// ---------- Publish / unpublish lifecycle ----------

const publish = catchAsync(async (req, res) => {
  const { id } = (req.params as unknown) as ResultIdParam;
  const data = await ResultsService.publish(req.user!, id);
  sendSuccess(res, data, 'Result published successfully', 200);
});

const unpublish = catchAsync(async (req, res) => {
  const { id } = (req.params as unknown) as ResultIdParam;
  const data = await ResultsService.unpublish(req.user!, id);
  sendSuccess(res, data, 'Result unpublished successfully', 200);
});

// ---------- Recruiter / Admin ----------

const assessmentResults = catchAsync(async (req, res) => {
  const { assessmentId } = (req.params as unknown) as AssessmentIdParam;
  const data = await ResultsService.assessmentResults(
    req.user!,
    assessmentId,
    (req.query as unknown) as AssessmentResultsQuery
  );
  sendSuccess(res, data, 'Assessment results fetched successfully', 200);
});

const leaderboard = catchAsync(async (req, res) => {
  const { assessmentId } = (req.params as unknown) as AssessmentIdParam;
  const data = await ResultsService.leaderboard(
    req.user!,
    assessmentId,
    (req.query as unknown) as LeaderboardQuery
  );
  sendSuccess(res, data, 'Leaderboard fetched successfully', 200);
});

export const ResultsController = {
  myResults,
  mySummary,
  getById,
  publish,
  unpublish,
  assessmentResults,
  leaderboard,
};

