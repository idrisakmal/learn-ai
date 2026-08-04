import type { FastifyInstance } from 'fastify';
import { createFlagSchema } from './flag.schema.js';
import { createFlag } from './flag.service.js';

/**
 * Routes for /flags (registered under the /api/v1 prefix by the app).
 */
export async function flagRoutes(app: FastifyInstance): Promise<void> {
  app.post('/flags', async (request, reply) => {
    const body = createFlagSchema.parse(request.body);
    const created = await createFlag(body);
    return reply.code(201).send(created);
  });
}
