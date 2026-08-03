import { useCallback } from 'react';
import { listConfigurations } from '../api/client';
import type { Application } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { ConfigurationCard } from './ConfigurationCard';
import { ErrorNotice } from './ErrorNotice';

interface ConfigurationPanelProps {
  application: Application;
}

/**
 * The detail pane: every Configuration belonging to the selected Application.
 * One request gets them all, so no per-id follow-up is needed.
 */
export function ConfigurationPanel({ application }: ConfigurationPanelProps) {
  const load = useCallback(() => listConfigurations(application.id), [application.id]);
  const { state, reload } = useAsync(load);

  return (
    <section className="panel" aria-label={`Configurations for ${application.name}`}>
      <header className="panel__header">
        <h2 className="panel__title">{application.name}</h2>
        {application.comments && (
          <p className="panel__subtitle">{application.comments}</p>
        )}
      </header>

      {state.status === 'loading' && <p className="muted">Loading configurations…</p>}

      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}

      {state.status === 'ready' && state.data.length === 0 && (
        <p className="muted">This application has no configurations yet.</p>
      )}

      {state.status === 'ready' &&
        state.data.map((configuration) => (
          <ConfigurationCard key={configuration.id} configuration={configuration} />
        ))}
    </section>
  );
}
