import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationList } from './ApplicationList';
import { ApiError } from '../api/client';
import { anApplication } from '../test/factories';

const noop = () => {};

describe('ApplicationList', () => {
  it('shows a loading message while applications are being fetched', () => {
    render(
      <ApplicationList
        state={{ status: 'loading' }}
        selectedId={null}
        onSelect={noop}
        onRetry={noop}
      />,
    );

    expect(screen.getByText('Loading applications…')).toBeInTheDocument();
  });

  it('shows the service’s error message and offers a retry', async () => {
    const onRetry = vi.fn();
    render(
      <ApplicationList
        state={{
          status: 'error',
          error: new ApiError(0, 'NetworkError', 'Could not reach the config service.'),
        }}
        selectedId={null}
        onSelect={noop}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reach the config service.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('distinguishes an empty list from a failure', () => {
    render(
      <ApplicationList
        state={{ status: 'ready', data: [] }}
        selectedId={null}
        onSelect={noop}
        onRetry={noop}
      />,
    );

    expect(screen.getByText('No applications registered yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists applications with their comments and reports the selection', async () => {
    const onSelect = vi.fn();
    render(
      <ApplicationList
        state={{
          status: 'ready',
          data: [
            anApplication({
              id: 'app-1',
              name: 'billing',
              comments: 'Invoicing',
            }),
            anApplication({ id: 'app-2', name: 'checkout' }),
          ],
        }}
        selectedId={null}
        onSelect={onSelect}
        onRetry={noop}
      />,
    );

    expect(screen.getByText('Invoicing')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /checkout/ }));
    expect(onSelect).toHaveBeenCalledWith('app-2');
  });

  it('marks the selected application with aria-current', () => {
    render(
      <ApplicationList
        state={{
          status: 'ready',
          data: [
            anApplication({ id: 'app-1', name: 'billing' }),
            anApplication({ id: 'app-2', name: 'checkout' }),
          ],
        }}
        selectedId="app-2"
        onSelect={noop}
        onRetry={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /checkout/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /billing/ })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
