// Landing page skeleton. The full judge-mode landing (live numbers, replay, run live) lands in M3/M6.

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="inline-flex w-fit items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">
        <span aria-hidden className="h-2 w-2 rounded-full bg-stepup" />
        PayPal sandbox only · simulated merchants
      </p>
      <h1 className="wordmark text-4xl text-text">ALLOWANCE</h1>
      <p className="text-2xl leading-snug text-text">Give your AI agent an allowance, not your wallet.</p>
      <p className="max-w-xl text-muted">
        A spending firewall for AI agents on PayPal. Every money-moving tool call passes 12 deterministic rules and
        comes back <strong className="text-allow">ALLOW</strong>, <strong className="text-stepup">STEP-UP</strong> or{' '}
        <strong className="text-block">BLOCK</strong>, with the exact rule that fired.
      </p>
    </main>
  );
}
