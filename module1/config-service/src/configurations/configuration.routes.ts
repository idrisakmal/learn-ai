import type { FastifyInstance } from 'fastify';
import {
  createConfigurationSchema,
  updateConfigurationSchema,
  idParamSchema,
} from './configuration.schema.js';
import {
  createConfiguration,
  updateConfiguration,
  getConfiguration,
} from './configuration.service.js';

/**
 * Routes for /configurations (registered under the /api/v1 prefix by the app).
 */
export async function configurationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/configurations', async (request, reply) => {
    const body = createConfigurationSchema.parse(request.body);
    const created = await createConfiguration(body);
    return reply.code(201).send(created);
  });

  app.put('/configurations/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateConfigurationSchema.parse(request.body);
    const updated = await updateConfiguration(id, body);
    return reply.code(200).send(updated);
  });

  app.get('/configurations/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const configuration = await getConfiguration(id);
    return reply.code(200).send(configuration);
  });
}
