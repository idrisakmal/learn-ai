/**
 * Domain error types thrown by services and mapped to HTTP status codes by the
 * Fastify error handler. Services stay HTTP-agnostic; routes stay thin.
 */

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}
