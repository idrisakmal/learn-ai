import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDb } from '../test/helpers.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { createApplication } from '../applications/application.service.js';
import { createFlag } from './flag.service.js';

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
});
