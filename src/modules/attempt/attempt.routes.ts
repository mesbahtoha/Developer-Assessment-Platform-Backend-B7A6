import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { AttemptController } from './attempt.controller';
import { createSubmissionSchema } from './attempt.validation';

const router = Router();
router.use(verifyAuth);

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
