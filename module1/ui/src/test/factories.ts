import type { Application, Configuration } from '../api/types';

/** Build an Application, overriding only what a test cares about. */
export function anApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: '01JHQ0000000000000000BILL',
    name: 'billing',
    comments: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Build a Configuration, overriding only what a test cares about. */
export function aConfiguration(overrides: Partial<Configuration> = {}): Configuration {
  return {
    id: '01JHQ00000000000000000PROD',
    applicationId: '01JHQ0000000000000000BILL',
    name: 'production',
    comments: null,
    config: { apiUrl: 'https://api.example.com' },
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}
