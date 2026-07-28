/**
 * Demo data for the development database, so a fresh machine has something for
 * the Admin UI to show. Not test data — the test suite builds its own fixtures
 * and truncates between cases (see src/test/helpers.ts).
 *
 * Run with `make seed`. Safe to run twice: every record is upserted on its
 * natural key, so re-running restores the demo values without creating
 * duplicates or disturbing anything else in the database.
 *
 * The values are deliberately varied — string, number, boolean, and nested
 * object — because that is what exercises the UI's per-kind value editor.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { newId } from '../src/lib/ids.js';

interface SeedConfiguration {
  name: string;
  comments?: string;
  config: Record<string, unknown>;
}

interface SeedApplication {
  name: string;
  comments: string;
  configurations: SeedConfiguration[];
}

const applications: SeedApplication[] = [
  {
    name: 'billing',
    comments: 'Invoicing and payments',
    configurations: [
      {
        name: 'production',
        comments: 'Live settings',
        config: {
          apiUrl: 'https://api.billing.internal',
          timeoutMs: 5000,
          retries: 3,
          debug: false,
          features: { beta: true, legacyInvoices: false },
        },
      },
      {
        name: 'staging',
        config: {
          apiUrl: 'https://api.billing.staging',
          timeoutMs: 15000,
          debug: true,
        },
      },
    ],
  },
  {
    name: 'checkout',
    comments: 'Storefront checkout flow',
    configurations: [
      {
        name: 'production',
        config: {
          currency: 'NZD',
          maxBasketItems: 50,
          applePay: true,
          allowedOrigins: ['https://shop.example.com'],
        },
      },
    ],
  },
];

async function seed(): Promise<void> {
  for (const application of applications) {
    // `name` is globally unique for an Application, so it is the natural key.
    const { id: applicationId } = await prisma.application.upsert({
      where: { name: application.name },
      update: { comments: application.comments },
      create: {
        id: newId(),
        name: application.name,
        comments: application.comments,
      },
      select: { id: true },
    });

    for (const configuration of application.configurations) {
      // A Configuration's name is unique only within its Application.
      await prisma.configuration.upsert({
        where: {
          applicationId_name: { applicationId, name: configuration.name },
        },
        update: {
          comments: configuration.comments ?? null,
          config: configuration.config as Prisma.InputJsonValue,
        },
        create: {
          id: newId(),
          applicationId,
          name: configuration.name,
          comments: configuration.comments ?? null,
          config: configuration.config as Prisma.InputJsonValue,
        },
      });
    }

    console.log(
      `Seeded ${application.name} (${application.configurations.length} configuration(s))`,
    );
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Seeding failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
