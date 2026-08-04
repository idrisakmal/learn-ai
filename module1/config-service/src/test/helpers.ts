import { prisma } from '../db/prisma.js';

/**
 * Truncate all tables in FK-safe order so each test starts from a clean state.
 * Children (`configurations`, `flags`) first, then `applications`. CASCADE would
 * reach the children anyway, but naming every table keeps the list honest — a
 * new table that nobody adds here is a table nobody notices is uncleaned.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "configurations", "flags", "applications" RESTART IDENTITY CASCADE',
  );
}
