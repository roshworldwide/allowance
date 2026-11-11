// Reads a request body up to a byte limit without ever holding more than that in memory. A declared
// Content-Length over the limit is refused before reading; a streamed body is cut off as soon as it
// passes the limit. (Route handlers have no body-size limit of their own.)
export type BodyText = { ok: true; text: string } | { ok: false };

export async function readBodyText(req: Request, maxBytes: number): Promise<BodyText> {
  const declared = Number(req.headers.get('content-length'));
  if (declared > maxBytes) return { ok: false };
  if (!req.body) return { ok: true, text: '' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

/** The body as a JSON object, or null when it is too large, not JSON, or not an object (e.g. `null`). */
export async function readJsonObject(req: Request, maxBytes: number): Promise<{ tooLarge: true } | { tooLarge: false; value: Record<string, unknown> | null }> {
  const body = await readBodyText(req, maxBytes);
  if (!body.ok) return { tooLarge: true };
  try {
    const v: unknown = JSON.parse(body.text);
    return { tooLarge: false, value: typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null };
  } catch {
    return { tooLarge: false, value: null };
  }
}
