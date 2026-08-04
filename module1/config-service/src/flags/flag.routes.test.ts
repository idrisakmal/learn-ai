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

async function createFlag(
  applicationId: string,
  name = 'new-checkout',
  enabled = true,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/flags',
    payload: { applicationId, name, enabled },
  });
  return res.json().id;
}

describe('flag routes', () => {
  it('POST /api/v1/flags creates and returns 201', async () => {
    const applicationId = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flags',
      payload: { applicationId, name: 'new-checkout', enabled: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toHaveLength(26);
    expect(res.json().name).toBe('new-checkout');
    expect(res.json().enabled).toBe(true);
  });

  it('POST with enabled: false returns a disabled flag', async () => {
    const applicationId = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flags',
      payload: { applicationId, name: 'new-checkout', enabled: false },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().enabled).toBe(false);
  });

  it('POST without enabled returns 400', async () => {
    const applicationId = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flags',
      payload: { applicationId, name: 'new-checkout' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST with a non-boolean enabled returns 400', async () => {
    const applicationId = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flags',
      payload: { applicationId, name: 'new-checkout', enabled: 'yes' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST under a missing application returns 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flags',
      payload: { applicationId: 'nope', name: 'new-checkout', enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST a duplicate name for the same application returns 409', async () => {
    const applicationId = await createApp();
    const payload = { applicationId, name: 'new-checkout', enabled: true };
    await app.inject({ method: 'POST', url: '/api/v1/flags', payload });

    const res = await app.inject({ method: 'POST', url: '/api/v1/flags', payload });
    expect(res.statusCode).toBe(409);
    // The message names the flag, so it comes from the service rather than the
    // central P2002 net.
    expect(res.json().message).toContain('new-checkout');
  });

  it('POST the same name under a different application returns 201', async () => {
    const a = await createApp('a');
    const b = await createApp('b');
    await app.inject({
      method: 'POST',
      url: '/api/v1/flags',
      payload: { applicationId: a, name: 'new-checkout', enabled: true },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flags',
      payload: { applicationId: b, name: 'new-checkout', enabled: true },
    });
    expect(res.statusCode).toBe(201);
  });

  describe('PUT /api/v1/flags/:id', () => {
    it('toggles enabled and leaves name alone', async () => {
      const applicationId = await createApp();
      const id = await createFlag(applicationId);

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/flags/${id}`,
        payload: { enabled: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().enabled).toBe(false);
      expect(res.json().name).toBe('new-checkout');
      expect(res.json().applicationId).toBe(applicationId);
    });

    it('returns 404 for an unknown flag id', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/flags/missing',
        payload: { enabled: false },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for an empty body', async () => {
      const applicationId = await createApp();
      const id = await createFlag(applicationId);

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/flags/${id}`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for a non-boolean enabled', async () => {
      const applicationId = await createApp();
      const id = await createFlag(applicationId);

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/flags/${id}`,
        payload: { enabled: 'yes' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 when renaming onto a name already taken', async () => {
      const applicationId = await createApp();
      await createFlag(applicationId, 'dark-mode');
      const id = await createFlag(applicationId, 'new-checkout');

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/flags/${id}`,
        payload: { name: 'dark-mode' },
      });
      expect(res.statusCode).toBe(409);
      // The message names the flag, so it comes from the service rather than the
      // central P2002 net.
      expect(res.json().message).toContain('dark-mode');
    });
  });
});
