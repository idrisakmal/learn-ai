import { describe, it, expect } from 'vitest';
import { envSchema } from './env.js';

describe('envSchema', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  };

  it('parses a valid environment and applies defaults', () => {
    const parsed = envSchema.parse(base);
    expect(parsed.PORT).toBe(3000);
    expect(parsed.LOG_LEVEL).toBe('info');
    expect(parsed.NODE_ENV).toBe('development');
  });

  it('rejects a missing DATABASE_URL', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a non-url DATABASE_URL', () => {
    const result = envSchema.safeParse({ DATABASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('coerces PORT to a number and rejects a non-numeric one', () => {
    expect(envSchema.parse({ ...base, PORT: '8080' }).PORT).toBe(8080);
    expect(envSchema.safeParse({ ...base, PORT: 'abc' }).success).toBe(false);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(envSchema.safeParse({ ...base, LOG_LEVEL: 'loud' }).success).toBe(false);
  });
});
