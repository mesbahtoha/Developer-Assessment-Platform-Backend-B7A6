import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { InvitationService } from './invitation.service';
import { ListInvitationsQuery, SendInvitationInput } from './invitation.validation';

const send = catchAsync(async (req: Request, res: Response) => {
  const invitation = await InvitationService.send(req.user!, req.body as SendInvitationInput);
  sendSuccess(res, { invitation }, 'Invitation sent successfully', 201);
});

const list = catchAsync(async (req: Request, res: Response) => {
  const result = await InvitationService.list(
    req.user!,
    req.query as unknown as ListInvitationsQuery
  );
  sendSuccess(res, result, 'Invitations fetched successfully');
});

const accept = catchAsync(async (req: Request, res: Response) => {
  const invitation = await InvitationService.accept(req.user!, req.params.id);
  sendSuccess(res, { invitation }, 'Invitation accepted');
});

const reject = catchAsync(async (req: Request, res: Response) => {
  const invitation = await InvitationService.reject(req.user!, req.params.id);
  sendSuccess(res, { invitation }, 'Invitation rejected');
});

export const InvitationController = { send, list, accept, reject };
