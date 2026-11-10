import { defineConfig } from '@playwright/test';

// E2E runs against a production build with NO keys: replay mode, the passcode gate, allowance setup,
// the Control Room and accessibility. Live PayPal paths are covered by tests/integration (fake sandbox)
// and by `npm run smoke:sandbox` with real keys.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3300', viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'npx next start -p 3300',
    url: 'http://localhost:3300/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PAYPAL_ENV: 'sandbox', E2E: '1', DEMO_PASSCODE: 'e2e-passcode', OWNER_MODE: 'false', RECORD_REPLAYS: 'false', ALLOWANCE_DB_PATH: '.e2e/allowance.db', AG_STUDIO_OPENAI_API_KEY: '', OPENAI_MODELS: '' },
  },
});
