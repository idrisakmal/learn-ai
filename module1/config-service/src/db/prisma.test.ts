import { describe, it, expect } from 'vitest';
import { resolvePrismaLogLevels } from './prisma.js';

describe('resolvePrismaLogLevels', () => {
  it('logs nothing at all when the service is silent', () => {
    // The point of the fix: expected constraint violations in tests must not
    // print prisma:error blocks on an otherwise green run.
    expect(resolvePrismaLogLevels('silent')).toEqual([]);
  });

  it('adds query logging at debug and trace', () => {
    expect(resolvePrismaLogLevels('debug')).toEqual(['query', 'warn', 'error']);
    expect(resolvePrismaLogLevels('trace')).toEqual(['query', 'warn', 'error']);
  });

  it('logs warnings and errors at ordinary levels', () => {
    for (const level of ['fatal', 'error', 'warn', 'info'] as const) {
      expect(resolvePrismaLogLevels(level)).toEqual(['warn', 'error']);
    }
  });
});
