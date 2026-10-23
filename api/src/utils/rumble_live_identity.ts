type LiveIdentity = { videoId: string | null; videoIdNumeric: string | null };

/** Rumble's public permalink and legacy video slug can identify the same live. */
export function sameRumbleLive(cached: LiveIdentity, current: LiveIdentity): boolean {
  if (cached.videoIdNumeric && current.videoIdNumeric) {
    return cached.videoIdNumeric === current.videoIdNumeric;
  }
  return !!cached.videoId && !!current.videoId
    && cached.videoId.toLowerCase() === current.videoId.toLowerCase();
}
