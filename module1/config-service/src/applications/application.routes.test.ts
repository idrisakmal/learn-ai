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

describe('application routes', () => {
  it('POST /api/v1/applications creates and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: { name: 'billing', comments: 'prod' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toHaveLength(26);
    expect(body.name).toBe('billing');
  });

  it('POST with an invalid body returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: { comments: 'no name' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST with a duplicate name returns 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: { name: 'billing' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: { name: 'billing' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('GET /api/v1/applications/:id returns 200 with configurationIds', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/applications',
        payload: { name: 'billing' },
      })
    ).json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${created.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().configurationIds).toEqual([]);
  });

  it('GET a missing application returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/applications/does-not-exist',
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT updates and returns 200', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/applications',
        payload: { name: 'billing' },
      })
    ).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${created.id}`,
      payload: { comments: 'changed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().comments).toBe('changed');
  });

  it('GET /api/v1/applications/:id/configurations returns full configurations', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/applications',
        payload: { name: 'billing' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: '/api/v1/configurations',
      payload: {
        applicationId: created.id,
        name: 'production',
        config: { debug: false },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${created.id}/configurations`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('production');
    expect(body[0].config).toEqual({ debug: false });
  });

  it('GET configurations for an application with none returns 200 and []', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/applications',
        payload: { name: 'billing' },
      })
    ).json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${created.id}/configurations`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('GET configurations for a missing application returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/applications/does-not-exist/configurations',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/applications lists applications (bare, no config ids)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: { name: 'a' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: { name: 'b' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/applications',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).not.toHaveProperty('configurationIds');
  });
});
