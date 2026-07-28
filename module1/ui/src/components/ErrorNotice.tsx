import { ApiError } from '../api/client';

interface ErrorNoticeProps {
  error: Error;
  onRetry?: () => void;
}

/**
 * The one place a failure is rendered. The service always sends
 * `{ error, message }`, so `error.message` is already administrator-readable —
 * it is shown as-is rather than replaced with a generic apology.
 */
export function ErrorNotice({ error, onRetry }: ErrorNoticeProps) {
  const status = error instanceof ApiError && !error.isNetworkError ? error.status : null;

  return (
    <div className="notice notice--error" role="alert">
      <p className="notice__message">{error.message}</p>
      <p className="notice__meta">
        {status !== null && <span className="badge">HTTP {status}</span>}
        {onRetry && (
          <button type="button" className="button button--quiet" onClick={onRetry}>
            Try again
          </button>
        )}
      </p>
    </div>
  );
}
