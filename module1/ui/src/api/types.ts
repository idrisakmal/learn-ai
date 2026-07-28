/**
 * Wire types for the Config API Service. These mirror what the service sends —
 * dates arrive as ISO strings, not `Date` objects.
 */

/** An Application, as returned by `GET /applications`. */
export interface Application {
  id: string;
  name: string;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `GET /applications/:id` adds the ids of the related Configurations. The UI
 * reads the full Configurations from `/applications/:id/configurations`
 * instead, so this shape exists for completeness rather than daily use.
 */
export interface ApplicationDetail extends Application {
  configurationIds: string[];
}

/** A Configuration. `config` is opaque jsonb — any JSON object of name/value pairs. */
export interface Configuration {
  id: string;
  applicationId: string;
  name: string;
  comments: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every error response from the service has this shape, with `issues` added on
 * validation failures. See context/IMPLEMENTATION.md — "Errors and HTTP mapping".
 */
export interface ApiErrorBody {
  error: string;
  message: string;
  issues?: unknown[];
}
