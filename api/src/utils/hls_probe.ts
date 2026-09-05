export async function hasReadableHlsSegment(base: string, segments: string[], fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    // One readable segment is sufficient. Keep a single six-second budget,
    // not six seconds per segment, so offline detection cannot stall the poller.
    for (const segment of segments) {
      if (controller.signal.aborted) break;
      try {
        const response = await fetcher(new URL(segment, base), {
          signal: controller.signal,
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            accept: "video/mp2t,video/*,*/*",
            referer: "https://rumble.com/",
            range: "bytes=0-0",
          },
        });
        await response.body?.cancel().catch(() => {});
        if (response.ok) return true;
      } catch { /* Try another advertised segment within the same budget. */ }
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}
