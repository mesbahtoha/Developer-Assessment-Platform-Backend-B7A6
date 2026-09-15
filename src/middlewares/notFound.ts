import { Request, Response } from 'express';
import { sendError } from '../shared/ApiResponse';

export const notFound = (req: Request, res: Response): void => {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, [], 404);
};
