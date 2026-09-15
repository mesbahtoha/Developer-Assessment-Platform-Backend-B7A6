import { Response } from 'express';

export const sendSuccess = (
  res: Response,
  data: unknown = {},
  message = 'Operation successful',
  statusCode = 200
): Response => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (
  res: Response,
  message = 'Something went wrong',
  errors: unknown[] = [],
  statusCode = 400
): Response => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

/**
 * Standard query helpers shared by all list endpoints.
 */
export interface QueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  searchTerm?: string;
}

export const getPagination = (query: QueryParams) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  return { page, limit, skip: (page - 1) * limit, take: limit };
};
