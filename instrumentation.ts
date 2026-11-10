// Runs once when a Next.js server instance starts, before it handles any request.
// ALLOWANCE refuses to boot unless it is pointed at PayPal sandbox (see instrumentation-node.ts).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
