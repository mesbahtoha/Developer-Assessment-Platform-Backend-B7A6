import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { AttemptController } from './attempt.controller';

const router = Router();
router.use(verifyAuth);

router.get('/:id', AttemptController.getSubmissionById);

export const submissionRoutes = router;
