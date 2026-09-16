import { Router } from 'express';
import { verifyAuth } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { InvitationController } from './invitation.controller';
import {
  listInvitationsQuerySchema,
  sendInvitationSchema,
} from './invitation.validation';

const router = Router();
router.use(verifyAuth);

router.post('/', authorize('RECRUITER', 'ADMIN'), validate(sendInvitationSchema), InvitationController.send);
router.get('/', validate(listInvitationsQuerySchema, ['query']), InvitationController.list);
router.patch('/:id/accept', authorize('CANDIDATE'), InvitationController.accept);
router.patch('/:id/reject', authorize('CANDIDATE'), InvitationController.reject);

export const invitationRoutes = router;
