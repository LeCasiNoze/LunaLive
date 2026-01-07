// api/src/calls/normalize.ts
export function normText(s: any): string {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/’/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function keyText(s: any): string {
  return normText(s).toLowerCase();
}
