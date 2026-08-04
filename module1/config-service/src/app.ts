import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { ConflictError, NotFoundError } from './lib/errors.js';
import { applicationRoutes } from './applications/application.routes.js';
import { configurationRoutes } from './configurations/configuration.routes.js';
import { flagRoutes } from './flags/flag.routes.js';

/**
 * Build a fully-configured Fastify instance without starting to listen.
 * Used by both the server entrypoint and the route tests (via app.inject()).
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: env.LOG_LEVEL === 'silent' ? false : { level: env.LOG_LEVEL },
  });

  // Central error handler: translate Zod, domain, and Prisma errors to HTTP codes.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'ValidationError',
        message: 'Request validation failed',
        issues: error.issues,
      });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: 'NotFound', message: error.message });
    }
    if (error instanceof ConflictError) {
      return reply.code(409).send({ error: 'Conflict', message: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply
          .code(409)
          .send({ error: 'Conflict', message: 'Unique constraint violated' });
      }
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'NotFound', message: 'Resource not found' });
      }
    }
    app.log.error(error);
    return reply.code(500).send({
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
    });
  });

  // Resource routes, all under the /api/v1 prefix.
  app.register(
    async (v1) => {
      await v1.register(applicationRoutes);
      await v1.register(configurationRoutes);
      await v1.register(flagRoutes);
    },
    { prefix: '/api/v1' },
  );

  // Release the shared Prisma connection when the server closes.
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
