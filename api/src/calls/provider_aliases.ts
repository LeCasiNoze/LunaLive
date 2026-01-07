// api/src/calls/provider_aliases.ts
const MAP: Record<string, string> = {
  "prag": "Pragmatic",
  "pp": "Pragmatic",
  "pragmatic": "Pragmatic",
  "pragmatic play": "Pragmatic",

  "hacksaw": "Hacksaw",
  "hacksaw gaming": "Hacksaw",
  "hs": "Hacksaw",

  "nlc": "Nolimit City",
  "nolimit": "Nolimit City",
  "nolimit city": "Nolimit City",

  "relax": "Relax",
  "relax gaming": "Relax",

  "playngo": "Play'n GO",
  "play n go": "Play'n GO",
  "png": "Play'n GO",
  "play'ngo": "Play'n GO",

  "btg": "Big Time Gaming",
  "big time gaming": "Big Time Gaming",

  "push": "Push Gaming",
  "push gaming": "Push Gaming",

  "quickspin": "Quickspin",
  "qs": "Quickspin",

  "elk": "ELK",
  "elk studios": "ELK",

  "redtiger": "Red Tiger",
  "red tiger": "Red Tiger",
};

function norm(s: string): string {
  return String(s || "")
    .normalize("NFKC")
    .replace(/’/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeProvider(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const key = norm(raw);
  return MAP[key] || raw.trim();
}
