export function eventDeadline(data: any, durationSeconds: number, now = Date.now()): number {
  const explicit = Number(data?.endsAtMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const created = Date.parse(String(data?.createdAt || ""));
  return (Number.isFinite(created) ? created : now) + durationSeconds * 1000;
}
export function secondsRemaining(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
export function eventIdentity(kind: string, data: any): string | null {
  const key = kind === "wheel" ? data?.messageId ?? data?.round : data?.round ?? data?.messageId;
  return key == null ? null : `${kind}:${String(key)}`;
}
