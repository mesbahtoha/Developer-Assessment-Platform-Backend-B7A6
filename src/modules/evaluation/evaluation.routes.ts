import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { requireCandidate, requireRecruiter, requireRecruiterOrAdmin } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { EvaluationController } from './evaluation.controller';
import {
  evaluateSchema,
  pendingQuerySchema,
  listResultsQuerySchema,
} from './evaluation.validation';

const router = Router();

router.use(verifyAuth);

// ---------- Candidate: view own results ----------
router.get(
  '/results/me',
  requireCandidate,
  validate(listResultsQuerySchema, ['query']),
  EvaluationController.myResults
);

// ---------- Evaluator/Recruiter: pending submissions list ----------
router.get(
  '/submissions/pending',
  requireRecruiter,
  validate(pendingQuerySchema, ['query']),
  EvaluationController.listPending
);

// ---------- Evaluator/Recruiter: evaluate a submission ----------
router.patch(
  '/submissions/:id/evaluate',
  requireRecruiter,
  validate(evaluateSchema),
  EvaluationController.evaluateSubmission
);

// ---------- Recruiter: assessment results ----------
router.get(
  '/assessments/:id/results',
  requireRecruiter,
  validate(listResultsQuerySchema, ['query']),
  EvaluationController.assessmentResults
);

// ---------- Recruiter/Admin: assessment report ----------
router.get(
  '/assessments/:id/report',
  requireRecruiterOrAdmin,
  EvaluationController.assessmentReport
);

export const evaluationRoutes = router;