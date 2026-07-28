/**
 * The bridge between an opaque `config` object and the editable rows the UI
 * shows. The service does not describe a config's shape, so the kind of each
 * value is inferred from the value itself and drives which control is rendered.
 */

export type ConfigValueKind = 'string' | 'number' | 'boolean' | 'json';

/**
 * One editable row. `text` backs the string, number, and json kinds; `checked`
 * backs boolean. Keeping both on every row makes editing a plain field update
 * rather than a union narrowing at each call site.
 */
export interface ConfigRow {
  key: string;
  kind: ConfigValueKind;
  text: string;
  checked: boolean;
}

/** Values the editor cannot render as a simple control fall back to `json`. */
function kindOf(value: unknown): ConfigValueKind {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'json';
}

/**
 * Rows for one config object, in the order the keys arrive. PostgreSQL jsonb
 * does not preserve insertion order, so this is whatever order the service
 * returned — stable between reads, which is all the UI needs.
 */
export function rowsFromConfig(config: Record<string, unknown>): ConfigRow[] {
  return Object.entries(config).map(([key, value]) => {
    const kind = kindOf(value);
    return {
      key,
      kind,
      text: kind === 'boolean' ? '' : textFor(kind, value),
      checked: kind === 'boolean' ? (value as boolean) : false,
    };
  });
}

function textFor(kind: ConfigValueKind, value: unknown): string {
  if (kind === 'string') return value as string;
  if (kind === 'number') return String(value);
  return JSON.stringify(value);
}

/** The result of turning edited rows back into a config payload. */
export type ConfigFromRowsResult =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

/**
 * Rebuild the config object from rows, collecting a message per key that does
 * not parse. Nothing is sent to the service until every row is valid.
 */
export function configFromRows(rows: ConfigRow[]): ConfigFromRowsResult {
  const config: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const row of rows) {
    if (row.kind === 'boolean') {
      config[row.key] = row.checked;
      continue;
    }
    if (row.kind === 'string') {
      config[row.key] = row.text;
      continue;
    }
    if (row.kind === 'number') {
      const parsed = Number(row.text.trim());
      if (row.text.trim() === '' || !Number.isFinite(parsed)) {
        errors[row.key] = 'Enter a number.';
        continue;
      }
      config[row.key] = parsed;
      continue;
    }
    try {
      config[row.key] = JSON.parse(row.text) as unknown;
    } catch {
      errors[row.key] = 'Enter valid JSON.';
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, config };
}

/** Whether two row sets carry the same values — drives the dirty indicator. */
export function rowsEqual(a: ConfigRow[], b: ConfigRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return (
      row.key === other.key &&
      row.kind === other.kind &&
      row.text === other.text &&
      row.checked === other.checked
    );
  });
}
