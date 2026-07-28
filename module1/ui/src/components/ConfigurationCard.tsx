import { useMemo, useState, type SubmitEvent } from 'react';
import { updateConfigurationValues } from '../api/client';
import type { Configuration } from '../api/types';
import {
  configFromRows,
  rowsEqual,
  rowsFromConfig,
  type ConfigRow,
} from '../lib/configValues';
import { asError } from '../lib/useAsync';
import { ErrorNotice } from './ErrorNotice';

interface ConfigurationCardProps {
  configuration: Configuration;
}

/**
 * One Configuration, with its values editable in place.
 *
 * `baseline` is the last state the service confirmed; `rows` is what the
 * administrator is editing. Comparing the two is what makes Save and Discard
 * appear only when there is something to save or discard.
 */
export function ConfigurationCard({ configuration }: ConfigurationCardProps) {
  const initialRows = useMemo(
    () => rowsFromConfig(configuration.config),
    [configuration.config],
  );

  const [baseline, setBaseline] = useState<ConfigRow[]>(initialRows);
  const [rows, setRows] = useState<ConfigRow[]>(initialRows);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);

  const dirty = !rowsEqual(rows, baseline);

  function updateRow(index: number, patch: Partial<ConfigRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    // Any edit invalidates the previous verdict on this row and clears the
    // "Saved" flag, so the card never claims a stale success.
    setFieldErrors((current) => {
      const key = rows[index].key;
      if (!(key in current)) return current;
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
    setSavedAt(null);
    setSaveError(null);
  }

  function discard() {
    setRows(baseline);
    setFieldErrors({});
    setSavedAt(null);
    setSaveError(null);
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = configFromRows(rows);
    if (!result.ok) {
      setFieldErrors(result.errors);
      setSaveError(null);
      return;
    }

    setFieldErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      // PUT is a partial update, so sending only `config` leaves name and
      // comments alone. The response is the source of truth for the new state.
      const updated = await updateConfigurationValues(
        configuration.id,
        result.config,
      );
      const confirmed = rowsFromConfig(updated.config);
      setBaseline(confirmed);
      setRows(confirmed);
      setSavedAt(updated.updatedAt);
    } catch (error) {
      setSaveError(asError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="config" onSubmit={save}>
      <header className="config__header">
        <div>
          <h3 className="config__name">{configuration.name}</h3>
          {configuration.comments && (
            <p className="config__comments">{configuration.comments}</p>
          )}
        </div>
        <div className="config__actions">
          {savedAt && !dirty && (
            <span className="config__saved" role="status">
              Saved
            </span>
          )}
          {dirty && (
            <button
              type="button"
              className="button button--quiet"
              onClick={discard}
              disabled={saving}
            >
              Discard
            </button>
          )}
          <button
            type="submit"
            className="button button--primary"
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {saveError && <ErrorNotice error={saveError} />}

      {rows.length === 0 ? (
        <p className="muted">This configuration has no values.</p>
      ) : (
        <ul className="values">
          {rows.map((row, index) => (
            <ConfigValueRow
              key={row.key}
              row={row}
              inputId={`${configuration.id}--${row.key}`}
              error={fieldErrors[row.key]}
              disabled={saving}
              onChange={(patch) => updateRow(index, patch)}
            />
          ))}
        </ul>
      )}
    </form>
  );
}

interface ConfigValueRowProps {
  row: ConfigRow;
  inputId: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (patch: Partial<ConfigRow>) => void;
}

/**
 * One key and its value. The control follows the value's kind: a checkbox for
 * booleans, a text field otherwise, with anything that is not a string, number,
 * or boolean edited as raw JSON.
 */
function ConfigValueRow({
  row,
  inputId,
  error,
  disabled,
  onChange,
}: ConfigValueRowProps) {
  const errorId = error ? `${inputId}--error` : undefined;

  return (
    <li className={`values__row${error ? ' values__row--invalid' : ''}`}>
      <label className="values__key" htmlFor={inputId}>
        {row.key}
      </label>

      <div className="values__control">
        {row.kind === 'boolean' ? (
          <input
            id={inputId}
            type="checkbox"
            className="values__checkbox"
            checked={row.checked}
            disabled={disabled}
            onChange={(event) => onChange({ checked: event.target.checked })}
          />
        ) : (
          <input
            id={inputId}
            type="text"
            className={`values__input${row.kind === 'json' ? ' values__input--code' : ''}`}
            value={row.text}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            // Numbers use a text input rather than type="number" so a bad entry
            // stays visible and can be corrected, instead of silently becoming "".
            inputMode={row.kind === 'number' ? 'decimal' : undefined}
            spellCheck={false}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        )}

        {row.kind !== 'string' && <span className="badge">{row.kind}</span>}
      </div>

      {error && (
        <p className="values__error" id={errorId}>
          {error}
        </p>
      )}
    </li>
  );
}
