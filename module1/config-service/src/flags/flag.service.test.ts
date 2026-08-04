import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDb } from '../test/helpers.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { createApplication } from '../applications/application.service.js';
import { createFlag, listFlagsByApplication, updateFlag } from './flag.service.js';

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedApp(name = 'billing') {
  return createApplication({ name });
}

describe('flag.service', () => {
  it('creates a flag under an application', async () => {
    const app = await seedApp();
    const flag = await createFlag({
      applicationId: app.id,
      name: 'new-checkout',
      enabled: true,
    });
    expect(flag.id).toHaveLength(26);
    expect(flag.applicationId).toBe(app.id);
    expect(flag.name).toBe('new-checkout');
    expect(flag.enabled).toBe(true);
  });

  // The case a default value would silently break: `enabled ?? true` or any
  // truthiness check turns a disabled flag on, and every other test still passes.
  it('stores enabled: false as false', async () => {
    const app = await seedApp();
    const flag = await createFlag({
      applicationId: app.id,
      name: 'new-checkout',
      enabled: false,
    });
    expect(flag.enabled).toBe(false);
  });

  it('throws NotFoundError when the application does not exist', async () => {
    await expect(
      createFlag({ applicationId: 'nope', name: 'new-checkout', enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a duplicate name within the same application', async () => {
    const app = await seedApp();
    await createFlag({ applicationId: app.id, name: 'new-checkout', enabled: true });
    await expect(
      createFlag({ applicationId: app.id, name: 'new-checkout', enabled: false }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  // Proves the constraint is the compound (applicationId, name) rather than a
  // global unique on name, which would only show up once a second app existed.
  it('allows the same flag name under different applications', async () => {
    const a = await seedApp('a');
    const b = await seedApp('b');
    await createFlag({ applicationId: a.id, name: 'new-checkout', enabled: true });
    const second = await createFlag({
      applicationId: b.id,
      name: 'new-checkout',
      enabled: true,
    });
    expect(second.name).toBe('new-checkout');
    expect(second.applicationId).toBe(b.id);
  });

  describe('updateFlag', () => {
    // The criterion itself: enabled changes, nothing else moves. It is also the
    // case a truthiness spread breaks — `input.enabled ? ... : {}` drops the
    // write and the flag stays on, while every other test here still passes.
    it('turns an enabled flag off without disturbing name or applicationId', async () => {
      const app = await seedApp();
      const flag = await createFlag({
        applicationId: app.id,
        name: 'new-checkout',
        enabled: true,
      });

      const updated = await updateFlag(flag.id, { enabled: false });
      expect(updated.enabled).toBe(false);
      expect(updated.name).toBe('new-checkout');
      expect(updated.applicationId).toBe(app.id);
    });

    // The absence rule in the other direction: a field nobody sent is not written.
    it('renames without disturbing enabled', async () => {
      const app = await seedApp();
      const flag = await createFlag({
        applicationId: app.id,
        name: 'new-checkout',
        enabled: true,
      });

      const updated = await updateFlag(flag.id, { name: 'checkout-v2' });
      expect(updated.name).toBe('checkout-v2');
      expect(updated.enabled).toBe(true);
    });

    it('throws NotFoundError when the flag does not exist', async () => {
      await expect(updateFlag('missing', { enabled: false })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('rejects a rename onto a sibling flag name', async () => {
      const app = await seedApp();
      await createFlag({ applicationId: app.id, name: 'dark-mode', enabled: true });
      const flag = await createFlag({
        applicationId: app.id,
        name: 'new-checkout',
        enabled: true,
      });

      await expect(updateFlag(flag.id, { name: 'dark-mode' })).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    // The compound (applicationId, name) constraint holds on update too, not
    // just on create — a global unique on name would fail this.
    it('allows a rename onto a name used under a different application', async () => {
      const a = await seedApp('a');
      const b = await seedApp('b');
      await createFlag({ applicationId: b.id, name: 'dark-mode', enabled: true });
      const flag = await createFlag({
        applicationId: a.id,
        name: 'new-checkout',
        enabled: true,
      });

      const updated = await updateFlag(flag.id, { name: 'dark-mode' });
      expect(updated.name).toBe('dark-mode');
      expect(updated.applicationId).toBe(a.id);
    });
  });

  describe('listFlagsByApplication', () => {
    it('returns full flags, oldest first', async () => {
      const app = await seedApp();
      await createFlag({ applicationId: app.id, name: 'new-checkout', enabled: true });
      await createFlag({ applicationId: app.id, name: 'dark-mode', enabled: false });

      const found = await listFlagsByApplication(app.id);
      expect(found.map((f) => f.name)).toEqual(['new-checkout', 'dark-mode']);
      // Full records, not just ids — this is the point of the endpoint.
      expect(found[1].enabled).toBe(false);
    });

    it('excludes flags belonging to other applications', async () => {
      const a = await seedApp('a');
      const b = await seedApp('b');
      await createFlag({ applicationId: a.id, name: 'new-checkout', enabled: true });
      await createFlag({ applicationId: b.id, name: 'new-checkout', enabled: true });

      const found = await listFlagsByApplication(a.id);
      expect(found).toHaveLength(1);
      expect(found[0].applicationId).toBe(a.id);
    });

    it('returns an empty array for an application with no flags', async () => {
      const app = await seedApp();
      expect(await listFlagsByApplication(app.id)).toEqual([]);
    });

    it('throws NotFoundError when the application does not exist', async () => {
      await expect(listFlagsByApplication('missing')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
