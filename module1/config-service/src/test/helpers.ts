import { prisma } from '../db/prisma.js';

/**
 * Truncate all tables in FK-safe order so each test starts from a clean state.
 * `configurations` first (child), then `applications` (parent). CASCADE covers
 * the future `flags` table too.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "configurations", "applications" RESTART IDENTITY CASCADE',
  );
}
