import { Prisma, type Configuration } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { newId } from '../lib/ids.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type {
  CreateConfigurationInput,
  UpdateConfigurationInput,
} from './configuration.schema.js';

export async function createConfiguration(
  input: CreateConfigurationInput,
): Promise<Configuration> {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { id: true },
  });
  if (!application) {
    throw new NotFoundError(`Application ${input.applicationId} not found`);
  }

  try {
    return await prisma.configuration.create({
      data: {
        id: newId(),
        applicationId: input.applicationId,
        name: input.name,
        comments: input.comments ?? null,
        config: input.config as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    throw mapUniqueNameError(err, input.name);
  }
}

export async function updateConfiguration(
  id: string,
  input: UpdateConfigurationInput,
): Promise<Configuration> {
  try {
    return await prisma.configuration.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
        ...(input.config !== undefined
          ? { config: input.config as Prisma.InputJsonValue }
          : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError(`Configuration ${id} not found`);
    }
    throw mapUniqueNameError(err, input.name);
  }
}

export async function getConfiguration(id: string): Promise<Configuration> {
  const configuration = await prisma.configuration.findUnique({ where: { id } });
  if (!configuration) {
    throw new NotFoundError(`Configuration ${id} not found`);
  }
  return configuration;
}

/**
 * All configurations belonging to one application, oldest first. Throws
 * NotFoundError if the application itself does not exist, so callers can tell
 * "no such application" apart from "application with no configurations".
 */
export async function listConfigurationsByApplication(
  applicationId: string,
): Promise<Configuration[]> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true },
  });
  if (!application) {
    throw new NotFoundError(`Application ${applicationId} not found`);
  }

  return prisma.configuration.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Map a Prisma unique-constraint violation (name-per-application) to a conflict. */
function mapUniqueNameError(err: unknown, name?: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return new ConflictError(
      `A configuration named "${name ?? ''}" already exists for this application`,
    );
  }
  return err;
}
