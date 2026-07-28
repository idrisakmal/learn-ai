import { z } from 'zod';

/**
 * Environment schema. Parsed once at import time; on failure the process prints
 * the validation issues and exits (fail-fast), so the service never starts with
 * a bad configuration.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  // Deliberately not 3000 — it collides with nearly every other local dev server.
  PORT: z.coerce.number().int().positive().default(3999),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

export const env = loadEnv();
