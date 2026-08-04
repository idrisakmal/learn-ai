import type { FastifyInstance } from 'fastify';
import { createFlagSchema, updateFlagSchema, idParamSchema } from './flag.schema.js';
import { createFlag, updateFlag } from './flag.service.js';

/**
 * Routes for /flags (registered under the /api/v1 prefix by the app).
 */
export async function flagRoutes(app: FastifyInstance): Promise<void> {
  app.post('/flags', async (request, reply) => {
    const body = createFlagSchema.parse(request.body);
    const created = await createFlag(body);
    return reply.code(201).send(created);
  });

  app.put('/flags/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateFlagSchema.parse(request.body);
    const updated = await updateFlag(id, body);
    return reply.code(200).send(updated);
  });
}
