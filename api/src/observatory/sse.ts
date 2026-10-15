// Public read-only SSE transport, shared with the existing bridge. Never logs payloads.
export class SseDecoder {
  private decoder = new TextDecoder();
  private buffer = "";
  push(bytes: Uint8Array): unknown[] {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    if (this.buffer.length > 262144) throw new Error("sse_frame_limit");
    const events: unknown[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) {
        try {
          events.push(JSON.parse(data));
        } catch {
          throw new Error("sse_invalid_json");
        }
      }
    }
    return events;
  }
}
export const publicChatHeaders = {
  accept: "text/event-stream",
  origin: "https://rumble.com",
  referer: "https://rumble.com/",
  "cache-control": "no-cache",
  "user-agent": "Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36",
};
export class ChatReadError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number,
  ) {
    super("chat_http_" + status);
  }
}
export async function readPublicChat(
  video: string,
  signal: AbortSignal,
  onEnvelope: (e: any) => void,
  onBytes: (n: number) => void,
  onOpen: () => void = () => {},
) {
  if (!/^\d{1,20}$/.test(video)) throw new Error("invalid_chat_video");
  const handshake = new AbortController(),
    timeout = setTimeout(() => handshake.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(
      "https://web7.rumble.com/chat/api/chat/" + video + "/stream",
      {
        method: "GET",
        signal: AbortSignal.any([signal, handshake.signal]),
        headers: publicChatHeaders,
        redirect: "error",
      },
    );
  } finally {
    clearTimeout(timeout);
  }
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  ) {
    const raw = response.headers.get("retry-after") ?? "",
      seconds = Number(raw);
    const retry = raw
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Math.max(0, Date.parse(raw) - Date.now())
      : 0;
    await response.body?.cancel().catch(() => {});
    throw new ChatReadError(
      response.status,
      Math.max(
        Number.isFinite(retry) ? retry : 0,
        [204, 403, 404].includes(response.status) ? 1800000 : 0,
      ),
    );
  }
  const decoder = new SseDecoder(),
    reader = response.body.getReader();
  let abortRead: () => void = () => {};
  const aborted = new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve) => {
      abortRead = () => resolve({ done: true, value: undefined });
    },
  );
  signal.addEventListener("abort", abortRead, { once: true });
  if (signal.aborted) abortRead();
  else onOpen();
  try {
    while (!signal.aborted) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      onBytes(value.length);
      for (const env of decoder.push(value)) onEnvelope(env);
    }
  } finally {
    signal.removeEventListener("abort", abortRead);
    // Cancel without waiting indefinitely for an upstream peer to acknowledge.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
