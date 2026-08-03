import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { ApiError } from './api/client';
import { anApplication, aConfiguration } from './test/factories';

vi.mock('./api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/client')>();
  return {
    ...actual,
    listApplications: vi.fn(),
    listConfigurations: vi.fn(),
    updateConfigurationValues: vi.fn(),
  };
});

const client = await import('./api/client');
const listApplications = vi.mocked(client.listApplications);
const listConfigurations = vi.mocked(client.listConfigurations);

const billing = anApplication({ id: 'app-1', name: 'billing' });
const checkout = anApplication({ id: 'app-2', name: 'checkout' });

beforeEach(() => {
  vi.mocked(client.updateConfigurationValues).mockReset();
  listApplications.mockReset();
  listConfigurations.mockReset();
});

describe('App', () => {
  it('prompts for a selection before anything is chosen', async () => {
    listApplications.mockResolvedValue([billing]);

    render(<App />);

    expect(
      await screen.findByText('Select an application to see its configurations.'),
    ).toBeInTheDocument();
  });

  it('loads the selected application’s configurations', async () => {
    listApplications.mockResolvedValue([billing, checkout]);
    listConfigurations.mockResolvedValue([
      aConfiguration({
        id: 'cfg-1',
        name: 'production',
        config: { debug: false },
      }),
      aConfiguration({ id: 'cfg-2', name: 'staging', config: { debug: true } }),
    ]);

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /billing/ }));

    expect(listConfigurations).toHaveBeenCalledWith('app-1');
    expect(
      await screen.findByRole('heading', { name: 'production' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'staging' })).toBeInTheDocument();
  });

  it('replaces the detail pane when a different application is selected', async () => {
    listApplications.mockResolvedValue([billing, checkout]);
    listConfigurations.mockImplementation(async (applicationId) =>
      applicationId === 'app-1'
        ? [aConfiguration({ id: 'cfg-1', name: 'production' })]
        : [aConfiguration({ id: 'cfg-2', name: 'sandbox' })],
    );

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /billing/ }));
    expect(
      await screen.findByRole('heading', { name: 'production' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /checkout/ }));

    expect(await screen.findByRole('heading', { name: 'sandbox' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'production' })).not.toBeInTheDocument();
  });

  it('says so when an application has no configurations', async () => {
    listApplications.mockResolvedValue([billing]);
    listConfigurations.mockResolvedValue([]);

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /billing/ }));

    expect(
      await screen.findByText('This application has no configurations yet.'),
    ).toBeInTheDocument();
  });

  it('reports a service that cannot be reached', async () => {
    listApplications.mockRejectedValue(
      new ApiError(
        0,
        'NetworkError',
        'Could not reach the config service. Is it running on port 3999?',
      ),
    );

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('port 3999');
  });
});
