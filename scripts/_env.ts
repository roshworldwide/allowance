// Loads .env.local exactly like Next.js does, so scripts see the same configuration as the app.
// Import this first in every script. It never prints values.
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
  info: () => {},
  error: (...args: unknown[]) => console.error(...args),
});
