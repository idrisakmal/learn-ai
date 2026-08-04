import { Prisma, type Flag } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { newId } from '../lib/ids.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { assertApplicationExists } from '../applications/application.service.js';
import type { CreateFlagInput, UpdateFlagInput } from './flag.schema.js';

export async function createFlag(input: CreateFlagInput): Promise<Flag> {
  await assertApplicationExists(input.applicationId);

  try {
    return await prisma.flag.create({
      data: {
        id: newId(),
        applicationId: input.applicationId,
        name: input.name,
        enabled: input.enabled,
      },
    });
  } catch (err) {
    throw mapUniqueNameError(err, input.name);
  }
}

/**
 * Partial update. Only fields the caller sent are written — `enabled` is
 * compared against `undefined` rather than tested for truth, or sending
 * `enabled: false` would leave the flag on.
 */
export async function updateFlag(id: string, input: UpdateFlagInput): Promise<Flag> {
  try {
    return await prisma.flag.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError(`Flag ${id} not found`);
    }
    throw mapUniqueNameError(err, input.name);
  }
}

/**
 * All flags belonging to one application, oldest first. Throws NotFoundError if
 * the application itself does not exist, so callers can tell "no such
 * application" apart from "application with no flags".
 */
export async function listFlagsByApplication(applicationId: string): Promise<Flag[]> {
  await assertApplicationExists(applicationId);

  return prisma.flag.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Map a Prisma unique-constraint violation (name-per-application) to a conflict. */
function mapUniqueNameError(err: unknown, name?: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictError(
      `A flag named "${name ?? ''}" already exists for this application`,
    );
  }
  return err;
}
