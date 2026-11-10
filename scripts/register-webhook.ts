// After the first deploy (G3): registers the sandbox webhook for <PUBLIC_BASE_URL>/api/webhooks/paypal
// and prints its id. Put that id into Render's PAYPAL_WEBHOOK_ID yourself.
//   PUBLIC_BASE_URL=https://<service>.onrender.com npm run webhook:register
import './_env';
import { createPayPalClient } from '../lib/paypal/client';
import { createWebhook, listWebhooks, WEBHOOK_EVENTS } from '../lib/paypal/webhooks';

async function main() {
  const base = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base.startsWith('https://')) throw new Error('PUBLIC_BASE_URL must be the deployed https URL');
  const url = `${base}/api/webhooks/paypal`;
  const pp = createPayPalClient();
  const existing = (await listWebhooks(pp)).find((w) => w.url === url);
  const hook = existing ?? (await createWebhook(pp, url));
  console.log(`${existing ? 'Already registered' : 'Registered'}: ${hook.url}`);
  console.log(`Events: ${WEBHOOK_EVENTS.join(', ')}`);
  console.log(`PAYPAL_WEBHOOK_ID=${hook.id}   ← paste into Render's environment yourself`);
}

main().catch((e) => {
  console.error(`webhook registration failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
