import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigurationCard } from './ConfigurationCard';
import { ApiError } from '../api/client';
import { aConfiguration } from '../test/factories';

vi.mock('../api/client', async (importOriginal) => {
  // ApiError is a real class the component checks with `instanceof`, so keep it.
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, updateConfigurationValues: vi.fn() };
});

const { updateConfigurationValues } = await import('../api/client');
const updateMock = vi.mocked(updateConfigurationValues);

const configuration = aConfiguration({
  id: 'cfg-1',
  name: 'production',
  comments: 'Live settings',
  config: {
    apiUrl: 'https://api.example.com',
    timeoutMs: 5000,
    debug: false,
    features: { beta: true },
  },
});

beforeEach(() => {
  updateMock.mockReset();
});

describe('ConfigurationCard', () => {
  it('renders every value with a control matching its type', () => {
    render(<ConfigurationCard configuration={configuration} />);

    expect(screen.getByRole('heading', { name: 'production' })).toBeInTheDocument();
    expect(screen.getByText('Live settings')).toBeInTheDocument();
    expect(screen.getByLabelText('apiUrl')).toHaveValue('https://api.example.com');
    expect(screen.getByLabelText('timeoutMs')).toHaveValue('5000');
    expect(screen.getByLabelText('debug')).not.toBeChecked();
    expect(screen.getByLabelText('features')).toHaveValue('{"beta":true}');
  });

  it('keeps Save disabled until something changes', async () => {
    render(<ConfigurationCard configuration={configuration} />);
    const save = screen.getByRole('button', { name: 'Save' });

    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText('apiUrl'), '/v2');

    expect(save).toBeEnabled();
  });

  it('sends the whole config with the edited value and confirms the save', async () => {
    updateMock.mockResolvedValue(
      aConfiguration({
        ...configuration,
        config: {
          ...configuration.config,
          apiUrl: 'https://api.example.com/v2',
        },
      }),
    );

    render(<ConfigurationCard configuration={configuration} />);

    await userEvent.type(screen.getByLabelText('apiUrl'), '/v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('cfg-1', {
        apiUrl: 'https://api.example.com/v2',
        timeoutMs: 5000,
        debug: false,
        features: { beta: true },
      });
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('sends a toggled boolean as a boolean', async () => {
    updateMock.mockResolvedValue(
      aConfiguration({
        ...configuration,
        config: { ...configuration.config, debug: true },
      }),
    );

    render(<ConfigurationCard configuration={configuration} />);

    await userEvent.click(screen.getByLabelText('debug'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        'cfg-1',
        expect.objectContaining({ debug: true }),
      );
    });
  });

  it('refuses to send a value that does not parse and says why', async () => {
    render(<ConfigurationCard configuration={configuration} />);

    await userEvent.clear(screen.getByLabelText('timeoutMs'));
    await userEvent.type(screen.getByLabelText('timeoutMs'), 'soon');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter a number.')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('timeoutMs')).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses to send malformed JSON', async () => {
    render(<ConfigurationCard configuration={configuration} />);

    await userEvent.clear(screen.getByLabelText('features'));
    await userEvent.type(screen.getByLabelText('features'), '{{ beta');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter valid JSON.')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('shows the service’s message when the save is rejected', async () => {
    updateMock.mockRejectedValue(
      new ApiError(409, 'Conflict', 'A configuration named "production" already exists'),
    );

    render(<ConfigurationCard configuration={configuration} />);

    await userEvent.type(screen.getByLabelText('apiUrl'), '/v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('A configuration named "production" already exists'),
    ).toBeInTheDocument();
    // The edit survives the failure so it can be retried rather than retyped.
    expect(screen.getByLabelText('apiUrl')).toHaveValue('https://api.example.com/v2');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('discards edits back to the last saved values', async () => {
    render(<ConfigurationCard configuration={configuration} />);

    await userEvent.type(screen.getByLabelText('apiUrl'), '/v2');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByLabelText('apiUrl')).toHaveValue('https://api.example.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('says so when a configuration has no values', () => {
    render(<ConfigurationCard configuration={aConfiguration({ config: {} })} />);

    expect(screen.getByText('This configuration has no values.')).toBeInTheDocument();
  });
});
