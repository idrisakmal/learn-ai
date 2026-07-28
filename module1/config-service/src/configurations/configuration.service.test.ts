import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDb } from '../test/helpers.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { createApplication } from '../applications/application.service.js';
import {
  createConfiguration,
  updateConfiguration,
  getConfiguration,
  listConfigurationsByApplication,
} from './configuration.service.js';

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedApp(name = 'billing') {
  return createApplication({ name });
}

describe('configuration.service', () => {
  it('creates a configuration under an application', async () => {
    const app = await seedApp();
    const cfg = await createConfiguration({
      applicationId: app.id,
      name: 'db',
      config: { host: 'db.internal', port: 5432 },
    });
    expect(cfg.id).toHaveLength(26);
    expect(cfg.applicationId).toBe(app.id);
    expect(cfg.config).toEqual({ host: 'db.internal', port: 5432 });
  });

  it('throws NotFoundError when the application does not exist', async () => {
    await expect(
      createConfiguration({ applicationId: 'nope', name: 'db', config: {} }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a duplicate name within the same application (409)', async () => {
    const app = await seedApp();
    await createConfiguration({ applicationId: app.id, name: 'db', config: {} });
    await expect(
      createConfiguration({ applicationId: app.id, name: 'db', config: {} }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows the same configuration name under different applications', async () => {
    const a = await seedApp('a');
    const b = await seedApp('b');
    await createConfiguration({ applicationId: a.id, name: 'db', config: {} });
    const second = await createConfiguration({
      applicationId: b.id,
      name: 'db',
      config: {},
    });
    expect(second.name).toBe('db');
  });

  it('updates a configuration, round-tripping the jsonb config', async () => {
    const app = await seedApp();
    const cfg = await createConfiguration({
      applicationId: app.id,
      name: 'db',
      config: { a: 1 },
    });
    const updated = await updateConfiguration(cfg.id, {
      config: { a: 2, nested: { b: true } },
    });
    expect(updated.config).toEqual({ a: 2, nested: { b: true } });
  });

  it('throws NotFoundError when updating a missing configuration', async () => {
    await expect(
      updateConfiguration('missing', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('gets a configuration by id and 404s when absent', async () => {
    const app = await seedApp();
    const cfg = await createConfiguration({
      applicationId: app.id,
      name: 'db',
      config: {},
    });
    expect((await getConfiguration(cfg.id)).id).toBe(cfg.id);
    await expect(getConfiguration('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  describe('listConfigurationsByApplication', () => {
    it('returns full configurations, oldest first', async () => {
      const app = await seedApp();
      await createConfiguration({
        applicationId: app.id,
        name: 'production',
        config: { debug: false },
      });
      await createConfiguration({
        applicationId: app.id,
        name: 'staging',
        config: { debug: true },
      });

      const found = await listConfigurationsByApplication(app.id);
      expect(found.map((c) => c.name)).toEqual(['production', 'staging']);
      // Full records, not just ids — this is the point of the endpoint.
      expect(found[0].config).toEqual({ debug: false });
    });

    it('excludes configurations belonging to other applications', async () => {
      const a = await seedApp('a');
      const b = await seedApp('b');
      await createConfiguration({ applicationId: a.id, name: 'db', config: {} });
      await createConfiguration({ applicationId: b.id, name: 'db', config: {} });

      const found = await listConfigurationsByApplication(a.id);
      expect(found).toHaveLength(1);
      expect(found[0].applicationId).toBe(a.id);
    });

    it('returns an empty array for an application with no configurations', async () => {
      const app = await seedApp();
      expect(await listConfigurationsByApplication(app.id)).toEqual([]);
    });

    it('throws NotFoundError when the application does not exist', async () => {
      await expect(
        listConfigurationsByApplication('missing'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
