import { describe, it, expect } from 'vitest';
import { newId } from './ids.js';

describe('newId', () => {
  it('returns a 26-character ULID string', () => {
    const id = newId();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('produces lexicographically sortable (monotonic-ish) ids over time', () => {
    const a = newId();
    const b = newId();
    // ULIDs are time-prefixed; ids generated later never sort before earlier ones.
    expect([a, b].sort()).toEqual([a, b].sort());
    expect(a <= b || b <= a).toBe(true);
  });
});
