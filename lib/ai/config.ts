// Server-side configuration for the Control Room's AI (AG Studio Agent Framework via the OpenAI
// proxy at app/api/ai/responses). The key is read here only, from AG_STUDIO_OPENAI_API_KEY only:
// no OPENAI_API_KEY fallback, so spend always lands on the budgeted project key.
import 'server-only';

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

/** Bounds one turn's cost whatever the client asks for. Reasoning tokens count towards it. */
export const MAX_OUTPUT_TOKENS = 16_000;

/** Largest request body the proxy forwards (conversation history included). */
export const MAX_BODY_BYTES = 1_500_000;

export function openAiKey(): string | undefined {
  return process.env.AG_STUDIO_OPENAI_API_KEY?.trim() || undefined;
}

/** OPENAI_MODELS, comma-separated; the first is the default. No fallback model: empty means AI off. */
export function allowedModels(): string[] {
  const ids = (process.env.OPENAI_MODELS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

export function aiEnabled(): boolean {
  return Boolean(openAiKey()) && allowedModels().length > 0;
}
