import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { sendSuccess } from '../../shared/ApiResponse';
import { AuthUser } from '../../middlewares/auth';
import { PaymentService } from './payment.service';
import { CreateCheckoutInput, ListMyPaymentsQuery } from './payment.validation';

const create = catchAsync(async (req: Request, res: Response) => {
  const user = (req as unknown as { user: AuthUser }).user;
  const { assessmentId, amountInCents } = req.body as CreateCheckoutInput;
  const result = await PaymentService.createCheckoutSession(user, assessmentId, amountInCents);
  sendSuccess(
    res,
    {
      url: result.session.url,
      sessionId: result.session.id,
      payment: result.payment,
      reused: result.reused,
    },
    result.reused
      ? 'Existing checkout session reused (no duplicate charge)'
      : 'Checkout session created successfully',
    result.reused ? 200 : 201
  );
});

const webhook = catchAsync(async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  // req.body is a Buffer here because app.ts mounts express.raw() on this route
  const result = await PaymentService.handleWebhookEvent(sig ?? '', req.body as unknown as Buffer);
  sendSuccess(res, result, 'Webhook processed successfully');
});

const verify = catchAsync(async (req: Request, res: Response) => {
  const user = (req as unknown as { user: AuthUser }).user;
  const result = await PaymentService.verifySession(user, req.params.sessionId);
  sendSuccess(res, result, 'Payment verified successfully');
});

const getById = catchAsync(async (req: Request, res: Response) => {
  const user = (req as unknown as { user: AuthUser }).user;
  const payment = await PaymentService.getPaymentById(user, req.params.id);
  sendSuccess(res, { payment }, 'Payment fetched successfully');
});

const myPayments = catchAsync(async (req: Request, res: Response) => {
  const user = (req as unknown as { user: AuthUser }).user;
  const result = await PaymentService.getMyPayments(
    user,
    req.query as unknown as ListMyPaymentsQuery
  );
  sendSuccess(res, result, 'Payments fetched successfully');
});

const refund = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as unknown as { user: AuthUser }).user;
  const result = await PaymentService.refundPayment(actor, req.params.id);
  sendSuccess(res, result, 'Payment refunded successfully');
});

export const PaymentController = { create, webhook, verify, getById, myPayments, refund };
