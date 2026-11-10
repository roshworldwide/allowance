// Reads a text/event-stream Response body (EventSource can't POST). Calls onEvent(name, data) per event.
export async function readSse(res: Response, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  signal?.addEventListener('abort', () => void reader.cancel().catch(() => {}));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      try {
        onEvent(event, JSON.parse(data));
      } catch {
        /* ignore a malformed event */
      }
    }
  }
}
