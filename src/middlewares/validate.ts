import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';
import { ApiError } from '../shared/catchAsync';

type Sources = 'body' | 'query' | 'params';

export const validate =
  (schema: AnyZodObject, sources: Sources[] = ['body']) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse({
      ...('body' in sources && req.body ? req.body : {}),
      ...('query' in sources && req.query ? req.query : {}),
      ...('params' in sources && req.params ? req.params : {}),
    });

    if (!parsed.success) {
      next(
        ApiError.badRequest('Validation failed', parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })))
      );
      return;
    }

    if (sources.includes('body')) req.body = parsed.data;
    next();
  };
