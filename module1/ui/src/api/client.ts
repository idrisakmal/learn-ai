import type { Application, ApplicationDetail, Configuration } from './types';

/**
 * Requests go to a same-origin path. The Vite dev proxy forwards `/api` to the
 * service on port 3999, which is why no CORS middleware exists on the service.
 */
const BASE_URL = '/api/v1';

/**
 * A failed request. `status` is 0 when the request never reached the service —
 * that case is worth telling the administrator apart from a real HTTP error.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** True when the service could not be reached at all. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(
      0,
      'NetworkError',
      'Could not reach the config service. Is it running on port 3999?',
    );
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}

/**
 * Turn a non-2xx response into an ApiError, preferring the service's own
 * `{ error, message }` body over a generic status line.
 */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
    ) {
      const { error, message } = body as { error?: unknown; message: string };
      return new ApiError(
        response.status,
        typeof error === 'string' ? error : 'Error',
        message,
      );
    }
  } catch {
    // Body was missing or not JSON — fall through to the generic message.
  }
  return new ApiError(
    response.status,
    'Error',
    `Request failed with status ${response.status}`,
  );
}

/** `GET /applications` — every registered Application, oldest first. */
export function listApplications(): Promise<Application[]> {
  return request<Application[]>('/applications');
}

/** `GET /applications/:id` — one Application plus the ids of its Configurations. */
export function getApplication(id: string): Promise<ApplicationDetail> {
  return request<ApplicationDetail>(`/applications/${encodeURIComponent(id)}`);
}

/**
 * `GET /applications/:id/configurations` — the Application's full
 * Configurations in one request. 404s when the Application does not exist;
 * returns `[]` when it simply has none.
 */
export function listConfigurations(
  applicationId: string,
): Promise<Configuration[]> {
  return request<Configuration[]>(
    `/applications/${encodeURIComponent(applicationId)}/configurations`,
  );
}

/**
 * `PUT /configurations/:id` — a partial update, so sending only `config`
 * leaves `name` and `comments` untouched.
 */
export function updateConfigurationValues(
  id: string,
  config: Record<string, unknown>,
): Promise<Configuration> {
  return request<Configuration>(`/configurations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}
