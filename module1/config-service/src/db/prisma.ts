import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Single shared Prisma client for the whole process. Log level follows the
 * service log level so query noise stays out of tests.
 */
export const prisma = new PrismaClient({
  log: env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
