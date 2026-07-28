import type { FastifyInstance } from 'fastify';
import {
  createApplicationSchema,
  updateApplicationSchema,
  idParamSchema,
} from './application.schema.js';
import {
  createApplication,
  updateApplication,
  getApplication,
  listApplications,
} from './application.service.js';
import { listConfigurationsByApplication } from '../configurations/configuration.service.js';

/**
 * Routes for /applications (registered under the /api/v1 prefix by the app).
 * Handlers validate with Zod, delegate to the service, and set status codes.
 * Zod and domain errors are translated centrally by the app's error handler.
 */
export async function applicationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/applications', async (request, reply) => {
    const body = createApplicationSchema.parse(request.body);
    const created = await createApplication(body);
    return reply.code(201).send(created);
  });

  app.put('/applications/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateApplicationSchema.parse(request.body);
    const updated = await updateApplication(id, body);
    return reply.code(200).send(updated);
  });

  app.get('/applications/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const application = await getApplication(id);
    return reply.code(200).send(application);
  });

  app.get('/applications', async (_request, reply) => {
    const applications = await listApplications();
    return reply.code(200).send(applications);
  });

  // Full configurations for one application, so clients don't have to follow
  // configurationIds with a request per id.
  app.get('/applications/:id/configurations', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const configurations = await listConfigurationsByApplication(id);
    return reply.code(200).send(configurations);
  });
}
