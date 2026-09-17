import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { AttemptController } from './attempt.controller';
import { createSubmissionSchema, listMyAttemptsQuerySchema } from './attempt.validation';

const router = Router();
router.use(verifyAuth);

// Static route first so "my-attempts" is never parsed as an attempt id
router.get(
  '/my-attempts',
  authorize('CANDIDATE'),
  validate(listMyAttemptsQuerySchema, ['query']),
  AttemptController.myAttempts
);

router.get('/:id', AttemptController.getById);
router.patch('/:id/submit', authorize('CANDIDATE'), AttemptController.submit);
router.post(
  '/:attemptId/submissions',
  authorize('CANDIDATE'),
  validate(createSubmissionSchema),
  AttemptController.createSubmission
);
router.get('/:attemptId/submissions', AttemptController.listSubmissions);

export const attemptRoutes = router;
