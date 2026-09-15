import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';
import { ApiError } from '../shared/catchAsync';

type Sources = 'body' | 'query' | 'params';

export const validate =
  (schema: AnyZodObject, sources: Sources[] = ['body']) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const input: Record<string, unknown> = {};
    if (sources.includes('body')) input.body = req.body ?? {};
    if (sources.includes('query')) input.query = req.query ?? {};
    if (sources.includes('params')) input.params = req.params ?? {};

    const parsed = schema.safeParse(input);

    if (!parsed.success) {
      next(
        ApiError.badRequest(
          'Validation failed',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
        )
      );
      return;
    }

    const data = parsed.data as Record<string, unknown>;
    if (sources.includes('body')) req.body = data.body;
    if (sources.includes('params')) req.params = data.params as typeof req.params;
    next();
  };

