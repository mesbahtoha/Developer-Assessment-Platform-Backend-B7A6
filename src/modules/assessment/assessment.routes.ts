import { Router } from 'express';
import { AttemptController } from '../attempt/attempt.controller';
import { verifyAuth } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { AssessmentController } from './assessment.controller';
import {
  attachProblemsSchema,
  createAssessmentSchema,
  listAssessmentsQuerySchema,
  updateAssessmentSchema,
} from './assessment.validation';

const router = Router();

// All assessment routes require authentication; role rules live in the service
// (candidates see only PUBLISHED, recruiters see their own, admins see all)
router.use(verifyAuth);

router.post('/', authorize('RECRUITER', 'ADMIN'), validate(createAssessmentSchema), AssessmentController.create);
router.get('/', validate(listAssessmentsQuerySchema, ['query']), AssessmentController.list);
router.get('/:id', AssessmentController.getById);
// Candidate workflow: start an attempt (invitation + payment + duplicate guards inside)
router.post('/:assessmentId/start', authorize('CANDIDATE'), AttemptController.start);

// Recruiter/admin-only mutations
router.patch(
  '/:id',
  authorize('RECRUITER', 'ADMIN'),
  validate(updateAssessmentSchema),
  AssessmentController.update
);
router.delete('/:id', authorize('RECRUITER', 'ADMIN'), AssessmentController.softDelete);
router.post(
  '/:id/problems',
  authorize('RECRUITER', 'ADMIN'),
  validate(attachProblemsSchema),
  AssessmentController.attachProblems
);
router.delete(
  '/:id/problems/:problemId',
  authorize('RECRUITER', 'ADMIN'),
  AssessmentController.detachProblem
);

export const assessmentRoutes = router;
