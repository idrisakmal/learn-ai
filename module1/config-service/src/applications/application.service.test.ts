import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDb } from '../test/helpers.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  createApplication,
  updateApplication,
  getApplication,
  listApplications,
} from './application.service.js';
import { createConfiguration } from '../configurations/configuration.service.js';

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('application.service', () => {
  it('creates an application', async () => {
    const app = await createApplication({ name: 'billing', comments: 'prod' });
    expect(app.id).toHaveLength(26);
    expect(app.name).toBe('billing');
    expect(app.comments).toBe('prod');
  });

  it('rejects a duplicate name with a ConflictError', async () => {
    await createApplication({ name: 'billing' });
    await expect(createApplication({ name: 'billing' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('updates an existing application', async () => {
    const app = await createApplication({ name: 'billing' });
    const updated = await updateApplication(app.id, { comments: 'updated' });
    expect(updated.comments).toBe('updated');
    expect(updated.name).toBe('billing');
  });

  it('throws NotFoundError when updating a missing application', async () => {
    await expect(
      updateApplication('01ABCABCABCABCABCABCABCABC', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns an application with the ids of its configurations', async () => {
    const app = await createApplication({ name: 'billing' });
    const c1 = await createConfiguration({
      applicationId: app.id,
      name: 'db',
      config: { host: 'x' },
    });
    const c2 = await createConfiguration({
      applicationId: app.id,
      name: 'cache',
      config: { ttl: 60 },
    });
    const fetched = await getApplication(app.id);
    expect(fetched.configurationIds.sort()).toEqual([c1.id, c2.id].sort());
  });

  it('throws NotFoundError for a missing application', async () => {
    await expect(getApplication('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists all applications', async () => {
    await createApplication({ name: 'a' });
    await createApplication({ name: 'b' });
    const all = await listApplications();
    expect(all.map((a) => a.name).sort()).toEqual(['a', 'b']);
  });
});
