import { useCallback, useState } from 'react';
import { listApplications } from './api/client';
import { ApplicationList } from './components/ApplicationList';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { useAsync } from './lib/useAsync';

/**
 * Master–detail: pick an Application on the left, edit its Configurations on
 * the right. That is the whole UI — see the scope in context/ABOUT.md.
 */
export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(() => listApplications(), []);
  const { state, reload } = useAsync(load);

  const applications = state.status === 'ready' ? state.data : [];
  const selected = applications.find((app) => app.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Config Service</h1>
        <p className="app__tagline">Administration</p>
      </header>

      <main className="app__body">
        <ApplicationList
          state={state}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRetry={reload}
        />

        <div className="app__detail">
          {selected === null ? (
            <p className="muted app__placeholder">
              Select an application to see its configurations.
            </p>
          ) : (
            // Keyed by id so switching applications resets every card's
            // in-progress edits rather than carrying them across.
            <ConfigurationPanel key={selected.id} application={selected} />
          )}
        </div>
      </main>
    </div>
  );
}
