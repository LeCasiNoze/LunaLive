export type ChatEmote = {
  id?: number;
  kind: "emoji" | "gif";
  scope: "native" | "global" | "channel";
  name: string;
  label?: string | null;
  url?: string | null;
  status?: "active" | "disabled" | "banned" | "deleted";
};
export type ResolveChatEmote = (token: {kind: "emoji" | "gif"; name: string}) => {url: string; title?: string} | null;

export function safeEmoteTokenName(name: string) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 32);
}

function svgGif(label: string, glyph: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs><radialGradient id="g" cx="30%" cy="30%"><stop offset="0%" stop-color="rgba(255,255,255,0.85)"/><stop offset="60%" stop-color="rgba(124,77,255,0.25)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>
    <rect width="96" height="96" rx="22" fill="rgba(255,255,255,0.06)"/>
    <circle cx="48" cy="48" r="34" fill="url(#g)"><animate attributeName="r" values="28;36;28" dur="1.1s" repeatCount="indefinite"/></circle>
    <text x="48" y="58" text-anchor="middle" font-size="40">${glyph}</text>
    <text x="48" y="86" text-anchor="middle" font-size="12" opacity="0.75">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
export const NATIVE_GIFS: ChatEmote[] = [
  {kind:"gif",scope:"native",name:"party",label:"party",url:svgGif("party","🎉")},
  {kind:"gif",scope:"native",name:"gg",label:"gg",url:svgGif("gg","🏆")},
  {kind:"gif",scope:"native",name:"rage",label:"rage",url:svgGif("rage","😤")},
];

export function emotesFromPayload(payload: any): ChatEmote[] {
  const rows = Array.isArray(payload?.emotes) ? payload.emotes : [
    ...(Array.isArray(payload?.native) ? payload.native : []),
    ...(Array.isArray(payload?.global) ? payload.global : []),
    ...(Array.isArray(payload?.channel) ? payload.channel : []),
  ];
  return rows.filter((e: any) => e && (e.kind === "emoji" || e.kind === "gif") &&
    typeof e.name === "string" && (!e.status || e.status === "active"));
}

export function createEmoteResolver(emotes: ChatEmote[], apiBase: string): ResolveChatEmote {
  const map = new Map<string, {url: string; title?: string}>();
  // A channel's identically named image takes precedence over the global one.
  for (const e of [...NATIVE_GIFS, ...emotes.filter(e => e.scope !== "channel"), ...emotes.filter(e => e.scope === "channel")]) {
    if (!e.url || (e.status && e.status !== "active")) continue;
    try {
      const url = e.url.startsWith("data:image/") ? e.url : new URL(e.url, `${apiBase.replace(/\/$/, "")}/`).href;
      if (!/^(https?:\/\/|data:image\/)/i.test(url)) continue;
      map.set(`${e.kind}:${safeEmoteTokenName(e.name)}`, {url, title:e.label || e.name});
    } catch { /* Keep unknown or invalid tokens readable as text. */ }
  }
  return token => map.get(`${token.kind}:${safeEmoteTokenName(token.name)}`) || null;
}

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, {granularity:"grapheme"}) : null;
const emojiPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u;
export function emojiTextParts(text: string) {
  // Older embedded browsers can still render readable text and custom images.
  if (!segmenter) return [{text,emoji:false}];
  const parts: {text:string;emoji:boolean}[] = [];
  for (const {segment} of segmenter.segment(text)) {
    const emoji = emojiPattern.test(segment) && !segment.includes("\uFE0E");
    const previous = parts[parts.length - 1];
    if (!emoji && previous && !previous.emoji) previous.text += segment;
    else parts.push({text:segment,emoji});
  }
  return parts;
}
export function isEmotesOnly(text: string) {
  if (!text.trim()) return false;
  const remainder = text.replace(/:(e|g):[a-z0-9_]{1,32}:/gi, "");
  return emojiTextParts(remainder).every(part => !part.text.trim() || part.emoji);
}
