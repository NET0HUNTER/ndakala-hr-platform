export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function unauthenticated(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHENTICATED', message);
}

export function forbidden(message = 'Access denied: insufficient permissions'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(entity = 'Resource', id?: string): AppError {
  const detail = id ? ` with identifier '${id}'` : '';
  return new AppError(404, 'NOT_FOUND', `${entity}${detail} was not found`);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, 'CONFLICT', message, details);
}

export function validation(message: string, details?: unknown): AppError {
  return new AppError(400, 'VALIDATION_FAILED', message, details);
}
