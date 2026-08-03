import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import type { Env } from '../config/env.js';

/**
 * Map the service log level onto Prisma's own log levels.
 *
 * `silent` means silent: Prisma logs expected constraint violations (the 409 and
 * 404 paths we assert on) at `error`, so leaving `error` enabled fills a passing
 * test run with alarming `prisma:error` blocks. Tests set LOG_LEVEL=silent.
 */
export function resolvePrismaLogLevels(level: Env['LOG_LEVEL']): Prisma.LogLevel[] {
  if (level === 'silent') return [];
  if (level === 'debug' || level === 'trace') return ['query', 'warn', 'error'];
  return ['warn', 'error'];
}

/**
 * Single shared Prisma client for the whole process. Never construct a second
 * one — connection pool exhaustion is the failure mode.
 */
export const prisma = new PrismaClient({
  log: resolvePrismaLogLevels(env.LOG_LEVEL),
});
