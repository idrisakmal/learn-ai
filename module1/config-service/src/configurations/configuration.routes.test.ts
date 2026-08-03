import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../db/prisma.js';
import { resetDb } from '../test/helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createApp(name = 'billing'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/applications',
    payload: { name },
  });
  return res.json().id;
}

describe('configuration routes', () => {
  it('POST /api/v1/configurations creates and returns 201', async () => {
    const applicationId = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/configurations',
      payload: {
        applicationId,
        name: 'db',
        config: { host: 'db.internal', port: 5432, ssl: true },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().config).toEqual({
      host: 'db.internal',
      port: 5432,
      ssl: true,
    });
  });

  it('POST with an invalid body returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/configurations',
      payload: { name: 'db' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST under a missing application returns 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/configurations',
      payload: { applicationId: 'nope', name: 'db', config: {} },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST a duplicate name for the same application returns 409', async () => {
    const applicationId = await createApp();
    const payload = { applicationId, name: 'db', config: {} };
    await app.inject({
      method: 'POST',
      url: '/api/v1/configurations',
      payload,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/configurations',
      payload,
    });
    expect(res.statusCode).toBe(409);
  });

  it('GET /api/v1/configurations/:id returns 200, missing returns 404', async () => {
    const applicationId = await createApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/configurations',
        payload: { applicationId, name: 'db', config: { a: 1 } },
      })
    ).json();

    const ok = await app.inject({
      method: 'GET',
      url: `/api/v1/configurations/${created.id}`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().config).toEqual({ a: 1 });

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/configurations/missing',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('PUT updates a configuration and returns 200', async () => {
    const applicationId = await createApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/configurations',
        payload: { applicationId, name: 'db', config: { a: 1 } },
      })
    ).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/configurations/${created.id}`,
      payload: { config: { a: 2 } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config).toEqual({ a: 2 });
  });
});
