// api/src/calls/normalize.ts
export function normText(s) {
    return String(s ?? "")
        .normalize("NFKC")
        .replace(/’/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}
export function keyText(s) {
    return normText(s).toLowerCase();
}
