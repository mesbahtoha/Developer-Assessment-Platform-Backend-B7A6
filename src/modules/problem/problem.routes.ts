import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { ProblemController } from './problem.controller';
import {
  createProblemSchema,
  listProblemsQuerySchema,
  searchProblemsQuerySchema,
  updateProblemSchema,
} from './problem.validation';

const router = Router();

// Problem bank is recruiter/admin only. Candidates never touch it directly.
router.use(verifyAuth, authorize('RECRUITER', 'ADMIN'));

router.post('/', validate(createProblemSchema), ProblemController.create);
router.get('/', validate(listProblemsQuerySchema, ['query']), ProblemController.list);
router.get('/search', validate(searchProblemsQuerySchema, ['query']), ProblemController.search);
router.get('/:id', ProblemController.getById);
router.patch('/:id', validate(updateProblemSchema), ProblemController.update);
router.delete('/:id', ProblemController.softDelete);

export const problemRoutes = router;
