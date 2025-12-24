export function cosmeticsUnlockAllFor(username: string | null | undefined): boolean {
  const u = String(username ?? "").trim().toLowerCase();
  if (!u) return false;

  const raw = process.env.COSMETICS_UNLOCK_ALL_FOR ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return list.includes(u);
}
