import { Prisma, type Flag } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { newId } from '../lib/ids.js';
import { ConflictError } from '../lib/errors.js';
import { assertApplicationExists } from '../applications/application.service.js';
import type { CreateFlagInput } from './flag.schema.js';

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
