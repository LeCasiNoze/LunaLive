export const BOT_TEXT_MAX = 500;

// Convertit CRLF -> LF, garde les retours à la ligne, retire juste les espaces finaux.
export function normalizeMultiline(v: any) {
  return String(v ?? "").replace(/\r\n/g, "\n").trimEnd();
}
