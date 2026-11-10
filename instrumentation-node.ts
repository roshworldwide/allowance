// Node-only boot checks, imported by instrumentation.ts in the nodejs runtime.
import { assertSandbox } from './lib/paypal/sandbox-guard';

try {
  assertSandbox();
} catch (error) {
  console.error(`\n[ALLOWANCE] ${(error as Error).message}\n`);
  process.exit(1);
}
