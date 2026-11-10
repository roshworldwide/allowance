import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` throws outside React Server Components; tests run server code directly.
      'server-only': path.resolve(__dirname, 'tests/stubs/empty.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['lib/guard/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
