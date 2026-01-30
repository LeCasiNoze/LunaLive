// web/src/lib/unread_seen.ts
export function djb2Hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  // unsigned + base36 => compact
  return (h >>> 0).toString(36);
}

export function contentVersionFromItem(item: any): string {
  // Si ton API renvoie un updated_at/updatedAt => on préfère
  const upd =
    item?.updated_at ??
    item?.updatedAt ??
    item?.updatedAtIso ??
    item?.updated_at_iso ??
    null;

  if (upd) return `u:${String(upd)}`;

  // fallback: hash du contenu
  const title = String(item?.title ?? "");
  const html = String(item?.html ?? "");
  return `h:${djb2Hash(`${title}||${html}`)}`;
}

const LS_PREFIX = "ll_seen_v1:";

export function getSeenVersion(key: string): string | null {
  try {
    return localStorage.getItem(LS_PREFIX + key);
  } catch {
    return null;
  }
}

export function setSeenVersion(key: string, version: string) {
  try {
    localStorage.setItem(LS_PREFIX + key, version);
  } catch {
    // ignore
  }
}

export function isUnread(key: string, version: string): boolean {
  const seen = getSeenVersion(key);
  return !seen || seen !== version;
}
