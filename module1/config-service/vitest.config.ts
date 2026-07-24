import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Route/service tests hit a real PostgreSQL test database and share tables,
    // so run test files serially to avoid cross-file interference.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://config:config@localhost:5435/config_service_test?schema=public',
    },
  },
});
