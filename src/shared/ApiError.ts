export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: unknown[];

  constructor(statusCode: number, message: string, errors: unknown[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors: unknown[] = []) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = 'You are not authorized', errors: unknown[] = []) {
    return new ApiError(401, message, errors);
  }
  static forbidden(message = 'Forbidden', errors: unknown[] = []) {
    return new ApiError(403, message, errors);
  }
  static notFound(message = 'Resource not found', errors: unknown[] = []) {
    return new ApiError(404, message, errors);
  }
  static conflict(message = 'Conflict', errors: unknown[] = []) {
    return new ApiError(409, message, errors);
  }
}
