import { useCallback, useEffect, useState } from 'react';

/** Loading, failed, or loaded — the three states every screen here renders. */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; data: T };

/**
 * Run `load` on mount and whenever it changes, exposing the result as an
 * AsyncState plus a `reload` for retry buttons.
 *
 * `load` must be stable — wrap it in `useCallback` at the call site, or the
 * effect re-runs on every render.
 */
export function useAsync<T>(load: () => Promise<T>): {
  state: AsyncState<T>;
  reload: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // A stale response must not overwrite a newer one when the caller switches
    // between applications quickly.
    let cancelled = false;
    setState({ status: 'loading' });

    load().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: asError(error) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, reload };
}

/** Narrow an unknown rejection value to an Error without losing its message. */
export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
