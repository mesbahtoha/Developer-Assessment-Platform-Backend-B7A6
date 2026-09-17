import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { requireRecruiterOrAdmin } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { ResultsController } from './results.controller';
import {
  assessmentIdParamSchema,
  assessmentResultsQuerySchema,
  leaderboardQuerySchema,
  myResultsQuerySchema,
  resultIdParamSchema,
} from './results.validation';

const router = Router();

router.use(verifyAuth);

// ---------- Candidate: own results & career stats ----------
router.get('/me', validate(myResultsQuerySchema, ['query']), ResultsController.myResults);
router.get('/me/summary', ResultsController.mySummary);

// ---------- Result detail + publish lifecycle (recruiter/admin) ----------
router.patch(
  '/:id/publish',
  requireRecruiterOrAdmin,
  validate(resultIdParamSchema, ['params']),
  ResultsController.publish
);
router.patch(
  '/:id/unpublish',
  requireRecruiterOrAdmin,
  validate(resultIdParamSchema, ['params']),
  ResultsController.unpublish
);

// ---------- Result detail (any role, ownership enforced in service) ----------
router.get(
  '/:id',
  validate(resultIdParamSchema, ['params']),
  ResultsController.getById
);

// ---------- Assessment results & leaderboard (recruiter/admin) ----------
router.get(
  '/assessment/:assessmentId',
  requireRecruiterOrAdmin,
  validate(assessmentIdParamSchema, ['params']),
  validate(assessmentResultsQuerySchema, ['query']),
  ResultsController.assessmentResults
);
router.get(
  '/assessment/:assessmentId/leaderboard',
  requireRecruiterOrAdmin,
  validate(assessmentIdParamSchema, ['params']),
  validate(leaderboardQuerySchema, ['query']),
  ResultsController.leaderboard
);

export const resultRoutes = router;
