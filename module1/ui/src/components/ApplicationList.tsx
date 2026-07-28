import type { Application } from '../api/types';
import type { AsyncState } from '../lib/useAsync';
import { ErrorNotice } from './ErrorNotice';

interface ApplicationListProps {
  state: AsyncState<Application[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

/** The master pane: every registered Application, one selectable at a time. */
export function ApplicationList({
  state,
  selectedId,
  onSelect,
  onRetry,
}: ApplicationListProps) {
  return (
    <nav className="applications" aria-label="Applications">
      <h2 className="applications__heading">Applications</h2>

      {state.status === 'loading' && <p className="muted">Loading applications…</p>}

      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={onRetry} />}

      {state.status === 'ready' && state.data.length === 0 && (
        <p className="muted">No applications registered yet.</p>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="applications__list">
          {state.data.map((application) => (
            <li key={application.id}>
              <button
                type="button"
                className="applications__item"
                // aria-current is what tells a screen reader which one is open;
                // the highlight is only the visual half of that.
                aria-current={application.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(application.id)}
              >
                <span className="applications__name">{application.name}</span>
                {application.comments && (
                  <span className="applications__comments">{application.comments}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
