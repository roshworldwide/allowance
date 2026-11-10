// ALLOWANCE is sandbox-only by construction. This guard runs at server boot (instrumentation.ts),
// inside the PayPal client, and at the start of every script. There is no live mode to switch on.

export const PAYPAL_SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com' as const;

export class SandboxGuardError extends Error {
  override name = 'SandboxGuardError';
}

type Env = Record<string, string | undefined>;

/** Throws unless the environment is unambiguously PayPal sandbox. */
export function assertSandbox(env: Env = process.env): typeof PAYPAL_SANDBOX_API_BASE {
  const mode = env.PAYPAL_ENV?.trim();
  if (mode !== 'sandbox') {
    throw new SandboxGuardError(
      `ALLOWANCE refuses to start: PAYPAL_ENV must be "sandbox" (got ${mode ? `"${mode}"` : 'nothing'}). Live PayPal is not supported.`,
    );
  }
  const base = env.PAYPAL_API_BASE?.trim().replace(/\/+$/, '');
  if (base && base !== PAYPAL_SANDBOX_API_BASE) {
    throw new SandboxGuardError(`ALLOWANCE refuses to start: the PayPal API base must be ${PAYPAL_SANDBOX_API_BASE}.`);
  }
  return PAYPAL_SANDBOX_API_BASE;
}

/** Same check, as a boolean, for health/doctor output. */
export function isSandbox(env: Env = process.env): boolean {
  try {
    assertSandbox(env);
    return true;
  } catch {
    return false;
  }
}
