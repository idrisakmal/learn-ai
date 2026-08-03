import { describe, expect, it } from 'vitest';
import {
  configFromRows,
  rowsEqual,
  rowsFromConfig,
  type ConfigRow,
} from './configValues';

describe('rowsFromConfig', () => {
  it('infers a kind per value and keeps the key order', () => {
    const rows = rowsFromConfig({
      apiUrl: 'https://api.example.com',
      timeoutMs: 5000,
      debug: true,
      features: { beta: true },
    });

    expect(rows.map((row) => [row.key, row.kind])).toEqual([
      ['apiUrl', 'string'],
      ['timeoutMs', 'number'],
      ['debug', 'boolean'],
      ['features', 'json'],
    ]);
  });

  it('puts strings, numbers, and json in text and booleans in checked', () => {
    const [str, num, bool, json] = rowsFromConfig({
      a: 'plain',
      b: 42,
      c: false,
      d: [1, 2],
    });

    expect(str.text).toBe('plain');
    expect(num.text).toBe('42');
    expect(bool.checked).toBe(false);
    expect(json.text).toBe('[1,2]');
  });

  it('treats null as json rather than an empty string', () => {
    const [row] = rowsFromConfig({ maybe: null });

    expect(row.kind).toBe('json');
    expect(row.text).toBe('null');
  });

  it('returns nothing for an empty config', () => {
    expect(rowsFromConfig({})).toEqual([]);
  });
});

describe('configFromRows', () => {
  it('round-trips a config unchanged when nothing is edited', () => {
    const config = {
      apiUrl: 'https://api.example.com',
      timeoutMs: 5000,
      debug: true,
      features: { beta: true },
    };

    const result = configFromRows(rowsFromConfig(config));

    expect(result).toEqual({ ok: true, config });
  });

  it('keeps an edited number a number, not a string', () => {
    const rows = rowsFromConfig({ timeoutMs: 5000 });
    rows[0].text = '250';

    const result = configFromRows(rows);

    expect(result).toEqual({ ok: true, config: { timeoutMs: 250 } });
  });

  it('reports a number that does not parse', () => {
    const rows = rowsFromConfig({ timeoutMs: 5000 });
    rows[0].text = 'soon';

    const result = configFromRows(rows);

    expect(result).toEqual({
      ok: false,
      errors: { timeoutMs: 'Enter a number.' },
    });
  });

  it('rejects an empty number rather than sending 0', () => {
    const rows = rowsFromConfig({ timeoutMs: 5000 });
    rows[0].text = '';

    expect(configFromRows(rows)).toEqual({
      ok: false,
      errors: { timeoutMs: 'Enter a number.' },
    });
  });

  it('reports json that does not parse', () => {
    const rows = rowsFromConfig({ features: { beta: true } });
    rows[0].text = '{ beta: true';

    expect(configFromRows(rows)).toEqual({
      ok: false,
      errors: { features: 'Enter valid JSON.' },
    });
  });

  it('collects every invalid row, not just the first', () => {
    const rows = rowsFromConfig({ a: 1, b: { x: 1 } });
    rows[0].text = 'nope';
    rows[1].text = '{';

    const result = configFromRows(rows);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(['a', 'b']);
  });

  it('allows an empty string as a value', () => {
    const rows = rowsFromConfig({ apiUrl: 'https://api.example.com' });
    rows[0].text = '';

    expect(configFromRows(rows)).toEqual({ ok: true, config: { apiUrl: '' } });
  });
});

describe('rowsEqual', () => {
  const base: ConfigRow[] = rowsFromConfig({ a: 'one', b: true });

  it('is true for identical rows', () => {
    expect(rowsEqual(base, rowsFromConfig({ a: 'one', b: true }))).toBe(true);
  });

  it('is false when a value changed', () => {
    expect(rowsEqual(base, rowsFromConfig({ a: 'two', b: true }))).toBe(false);
  });

  it('is false when a checkbox changed', () => {
    expect(rowsEqual(base, rowsFromConfig({ a: 'one', b: false }))).toBe(false);
  });

  it('is false when the row count differs', () => {
    expect(rowsEqual(base, rowsFromConfig({ a: 'one' }))).toBe(false);
  });
});
