// api/src/dev_unlock.ts
export function devUnlockAllFor(username: string | undefined | null): boolean {
  if (!username) return false;

  // sécurité : active uniquement hors prod (tu peux enlever si tu veux)
  if (process.env.NODE_ENV === "production") return false;

  const raw = process.env.DEV_UNLOCK_ALL_FOR ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return list.includes(String(username).trim().toLowerCase());
}
