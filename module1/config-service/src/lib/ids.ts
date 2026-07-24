import { ulid } from 'ulid';

/**
 * Generate a new ULID string id in application code. IDs are always created here
 * and passed to Prisma; the database never generates them.
 */
export function newId(): string {
  return ulid();
}
