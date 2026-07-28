import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `globals: false` matches the service, so Testing Library's automatic cleanup
// never registers itself — it looks for a global afterEach. Register it here.
afterEach(() => {
  cleanup();
});
