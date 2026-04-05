// src/slots/normalize.ts
// Fonctions de normalisation du texte

export function normText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[ç]/g, "c")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[ñ]/g, "n")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ýÿ]/g, "y")
    .replace(/[^a-z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function keyText(s: string): string {
  return normText(s).replace(/\s+/g, "_");
}
