import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { requireAdmin } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { AdminController } from './admin.controller';
import { listUsersQuerySchema } from './admin.validation';

const router = Router();

// ADMIN-only: user management (strict RBAC)
router.use(verifyAuth, requireAdmin);

router.get('/users', validate(listUsersQuerySchema, ['query']), AdminController.listUsers);

export const adminRoutes = router;
