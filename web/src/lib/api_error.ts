export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isSessionRejected(error: unknown): boolean {
  return error instanceof ApiError
    && (error.status === 401 || (error.status === 403 && error.code === 'banned'));
}
