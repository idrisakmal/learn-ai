import { Prisma, type Application } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { newId } from '../lib/ids.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
} from './application.schema.js';

/** Application with the ids of its related configurations (for single GET). */
export type ApplicationWithConfigIds = Application & {
  configurationIds: string[];
};

export async function createApplication(
  input: CreateApplicationInput,
): Promise<Application> {
  try {
    return await prisma.application.create({
      data: {
        id: newId(),
        name: input.name,
        comments: input.comments ?? null,
      },
    });
  } catch (err) {
    throw mapUniqueNameError(err, input.name);
  }
}

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput,
): Promise<Application> {
  try {
    return await prisma.application.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError(`Application ${id} not found`);
    }
    throw mapUniqueNameError(err, input.name);
  }
}

export async function getApplication(id: string): Promise<ApplicationWithConfigIds> {
  const application = await prisma.application.findUnique({
    where: { id },
    include: { configurations: { select: { id: true } } },
  });
  if (!application) {
    throw new NotFoundError(`Application ${id} not found`);
  }
  const { configurations, ...rest } = application;
  return { ...rest, configurationIds: configurations.map((c) => c.id) };
}

export async function listApplications(): Promise<Application[]> {
  return prisma.application.findMany({ orderBy: { createdAt: 'asc' } });
}

/** Map a Prisma unique-constraint violation on `name` to a domain conflict. */
function mapUniqueNameError(err: unknown, name?: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictError(`An application with name "${name ?? ''}" already exists`);
  }
  return err;
}
