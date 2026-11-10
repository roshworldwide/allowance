// PayPal REST client (sandbox only). Every PayPal call ALLOWANCE makes goes through here.
//
// Behaviour modelled on the official hackathon boilerplate's lib/paypal.ts (OAuth client-credentials
// with token caching, paging, retries on 401/429/5xx), plus:
//   - a PayPal-Request-Id on every POST (idempotency; retries reuse it, so a retry can't double-charge)
//   - typed errors that carry PayPal's debug_id
//   - a request log (method, path, status, debug_id, duration) that never stores headers or bodies
//   - a sandbox guard: the base URL is fixed to api-m.sandbox.paypal.com and checked at construction
import 'server-only';
import { assertSandbox } from './sandbox-guard';
import { maskId } from './redact';

const MAX_ATTEMPTS = 4;
const LOG_LIMIT = 300;

export class PayPalApiError extends Error {
  override name = 'PayPalApiError';
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly debugId: string | undefined,
    readonly errorName: string | undefined,
    readonly issues: string[],
  ) {
    super(
      `PayPal ${method} ${path} → ${status}` +
        (errorName ? ` ${errorName}` : '') +
        (issues.length ? ` (${issues.join(', ')})` : '') +
        (debugId ? ` [debug_id ${debugId}]` : ''),
    );
  }
}

export type PayPalRequestLog = {
  at: string;
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  path: string; // vault/customer ids masked
  status: number; // 0 = network error
  debugId?: string;
  requestId?: string;
  durationMs: number;
  attempt: number;
};

export type PostOptions = { requestId: string; headers?: Record<string, string> };

export interface PayPalClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown, options: PostOptions): Promise<T>;
  delete(path: string): Promise<void>;
  listAll<T>(path: string, key: string, pageSize?: number): Promise<T[]>;
  /** True if client credentials mint a token (used by /api/health and doctor; never exposes it). */
  checkCredentials(): Promise<boolean>;
  log(): readonly PayPalRequestLog[];
}

type Options = {
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  onLog?: (entry: PayPalRequestLog) => void;
  env?: Record<string, string | undefined>;
  sleep?: (ms: number) => Promise<void>;
};

export function createPayPalClient(options: Options = {}): PayPalClient {
  const env = options.env ?? process.env;
  const base = assertSandbox(env);
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log: PayPalRequestLog[] = [];
  let cached: { value: string; expiresAt: number } | undefined;

  const record = (entry: PayPalRequestLog) => {
    log.push(entry);
    if (log.length > LOG_LIMIT) log.shift();
    options.onLog?.(entry);
  };

  async function token(): Promise<string> {
    if (cached && Date.now() < cached.expiresAt) return cached.value;
    const id = options.clientId ?? env.PAYPAL_CLIENT_ID;
    const secret = options.clientSecret ?? env.PAYPAL_CLIENT_SECRET;
    if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set (see .env.local).');
    const started = Date.now();
    const res = await doFetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });
    record({
      at: new Date().toISOString(),
      method: 'POST',
      path: '/v1/oauth2/token',
      status: res.status,
      debugId: res.headers.get('paypal-debug-id') ?? undefined,
      durationMs: Date.now() - started,
      attempt: 1,
    });
    if (!res.ok) throw await toError(res, 'POST', '/v1/oauth2/token');
    const body = (await res.json()) as { access_token: string; expires_in: number };
    // Refresh a minute early so an in-flight request never carries an expired token.
    cached = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return body.access_token;
  }

  async function request<T>(
    method: PayPalRequestLog['method'],
    path: string,
    body?: unknown,
    post?: PostOptions,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      let res: Response;
      try {
        res = await doFetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${await token()}`,
            'Content-Type': 'application/json',
            ...(post ? { 'PayPal-Request-Id': post.requestId, Prefer: 'return=representation', ...post.headers } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: 'no-store',
        });
      } catch (networkError) {
        record({ at: new Date().toISOString(), method, path: maskPath(path), status: 0, requestId: post?.requestId, durationMs: Date.now() - started, attempt });
        // GETs are safe to retry; POSTs only because they always carry a PayPal-Request-Id.
        if (attempt < MAX_ATTEMPTS && (method === 'GET' || post)) {
          await sleep(2 ** attempt * 250);
          continue;
        }
        throw networkError;
      }
      const debugId = res.headers.get('paypal-debug-id') ?? undefined;
      record({ at: new Date().toISOString(), method, path: maskPath(path), status: res.status, debugId, requestId: post?.requestId, durationMs: Date.now() - started, attempt });

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      // An expired or revoked token: mint a new one once.
      if (res.status === 401 && attempt === 1) {
        cached = undefined;
        continue;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS && (method === 'GET' || post)) {
        await sleep(2 ** attempt * 250);
        continue;
      }
      throw await toError(res, method, path);
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown, opts: PostOptions) => {
      if (!opts?.requestId) throw new Error(`PayPal POST ${path} needs a PayPal-Request-Id (idempotency).`);
      return request<T>('POST', path, body, opts);
    },
    delete: (path: string) => request<void>('DELETE', path),
    async listAll<T>(path: string, key: string, pageSize = 20): Promise<T[]> {
      const items: T[] = [];
      const sep = path.includes('?') ? '&' : '?';
      for (let page = 1; ; page++) {
        const res = await request<{ total_pages?: number } & Record<string, unknown>>('GET', `${path}${sep}page_size=${pageSize}&page=${page}`);
        items.push(...((res[key] as T[] | undefined) ?? []));
        if (page >= (res.total_pages ?? 1)) return items;
      }
    },
    async checkCredentials() {
      try {
        await token();
        return true;
      } catch {
        return false;
      }
    },
    log: () => log,
  };
}

async function toError(res: Response, method: string, path: string): Promise<PayPalApiError> {
  let name: string | undefined;
  let debugId = res.headers.get('paypal-debug-id') ?? undefined;
  const issues: string[] = [];
  try {
    const body = (await res.json()) as {
      name?: string;
      error?: string;
      debug_id?: string;
      details?: { issue?: string }[];
    };
    name = body.name ?? body.error;
    debugId = body.debug_id ?? debugId;
    for (const d of body.details ?? []) if (d.issue) issues.push(d.issue);
  } catch {
    /* non-JSON error body: keep status only */
  }
  return new PayPalApiError(res.status, method, maskPath(path), debugId, name, issues);
}

/** Vault payment-token and setup-token ids are masked in logs and errors. */
export function maskPath(path: string): string {
  return path.replace(/(\/v3\/vault\/(?:payment|setup)-tokens\/)([^/?]+)/, (_, p: string, id: string) => `${p}${maskId(id)}`);
}

let shared: PayPalClient | undefined;
/** Process-wide client for the app (lazy, so importing this module never throws at build time). */
export function paypal(): PayPalClient {
  shared ??= createPayPalClient();
  return shared;
}
