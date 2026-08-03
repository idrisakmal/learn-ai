import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  listApplications,
  listConfigurations,
  updateConfigurationValues,
} from './client';
import { anApplication, aConfiguration } from '../test/factories';

const fetchMock = vi.fn();

/** A Response stand-in with just the surface the client touches. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listApplications', () => {
  it('requests the versioned path and returns the body', async () => {
    const applications = [anApplication()];
    fetchMock.mockResolvedValue(jsonResponse(applications));

    await expect(listApplications()).resolves.toEqual(applications);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/applications', undefined);
  });
});

describe('listConfigurations', () => {
  it('reads an application’s configurations in one request', async () => {
    const configurations = [aConfiguration()];
    fetchMock.mockResolvedValue(jsonResponse(configurations));

    await expect(listConfigurations('app-1')).resolves.toEqual(configurations);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/applications/app-1/configurations',
      undefined,
    );
  });
});

describe('updateConfigurationValues', () => {
  it('PUTs only the config, relying on the partial update', async () => {
    const updated = aConfiguration({
      config: { apiUrl: 'https://new.example.com' },
    });
    fetchMock.mockResolvedValue(jsonResponse(updated));

    await expect(
      updateConfigurationValues('cfg-1', { apiUrl: 'https://new.example.com' }),
    ).resolves.toEqual(updated);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/configurations/cfg-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { apiUrl: 'https://new.example.com' } }),
    });
  });
});

describe('error handling', () => {
  it('uses the service’s own message from an { error, message } body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'NotFound', message: 'Configuration cfg-1 not found' }, 404),
    );

    const error = await listConfigurations('app-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NotFound',
      message: 'Configuration cfg-1 not found',
    });
  });

  it('surfaces a validation message from a 400', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'ValidationError',
          message: 'Request validation failed',
          issues: [{ path: ['config'] }],
        },
        400,
      ),
    );

    const error = await updateConfigurationValues('cfg-1', {}).catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 400,
      message: 'Request validation failed',
    });
  });

  it('falls back to the status when the body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);

    const error = await listApplications().catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 502,
      message: 'Request failed with status 502',
    });
  });

  it('reports an unreachable service distinctly from an HTTP error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await listApplications().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
    expect((error as ApiError).message).toMatch(/port 3999/);
  });
});
