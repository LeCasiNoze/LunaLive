// web/src/components/chat/ChatMessageBubble.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — ChatMessageBubble
//  Refonte visuelle : bulle structurée, badges clairs, mentions
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import type { ChatCosmetics } from "../../lib/cosmetics";
import {
  avatarBorderClass,
  frameClass,
  formatHHMM,
  getInitials,
  titleTierClass,
  usernameEffectClass,
} from "../../lib/cosmetics";
import type { StreamerAppearance } from "../../lib/appearance";

export type ChatMsgLike = {
  id: number | string;
  userId: number;
  username: string;
  body: string;
  createdAt: string;
  avatarUrl?: string | null;
  cosmetics?: ChatCosmetics | null;
  dlive?: boolean;
  dliveRestreamFrom?: string | null;
};

/* ─── Helpers ────────────────────────────────────────────── */
function normalizeTitle(title: any): { code: string; text: string; tier?: string | null } | null {
  if (!title) return null;
  const codeRaw =
    (typeof title === "string" ? title : null) ||
    title?.code || title?.id || title?.text || title?.label || null;
  if (!codeRaw) return null;
  const code = String(codeRaw).trim();
  if (!code || code === "none") return null;
  const TITLE_LABELS: Record<string, string> = {
    title_ratus: "Ratus",
    title_ca_tourne: "Ça tourne !",
    title_vrai_viewer: "Vrai Viewer",
    title_no_life: "No Life",
    title_batman: "Batman",
    title_bigmoula: "BigMoula",
    title_lunaking: "LunaKing",
    title_allin_man: "All-in Man",
  };
  const text = TITLE_LABELS[code] ?? code.replace(/^title_/, "").replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
  return { code, text, tier: typeof title?.tier === "string" ? title.tier : null };
}

function badgeLabel(b: any): string {
  return String(b?.label ?? b?.text ?? b?.badgeText ?? b?.meta?.badgeText ?? b?.code ?? "");
}

function normKey(s: any) {
  return String(s ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function extractMentions(body: string): string[] {
  const out: string[] = [];
  const re = /@([^\s@]{1,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) { const t = String(m[1] ?? "").trim(); if (t) out.push(t); }
  return out;
}

function isEmotesOnly(body: string): boolean {
  if (!body || !body.trim()) return false;
  
  // Enlever tous les tokens d'emotes, mentions et URLs
  const cleaned = body
    .replace(/:(e|g):[a-z0-9_]{1,32}:/gi, '') // emotes
    .replace(/@[^\s@]{1,32}/g, '') // mentions
    .replace(/https?:\/\/[^\s<]+|www\.[^\s<]+|[a-z0-9.-]+\.[a-z]{2,63}(\/[^\s<]*)?/gi, '') // URLs
    .trim();
  
  // Si après nettoyage il ne reste que des espaces, c'est que c'est seulement des emotes/mentions/URLs
  return cleaned.length === 0;
}

/* ─── Emotes ─────────────────────────────────────────────── */
type EmoteKind = "emoji" | "gif";
type ResolveEmote = (p: { kind: EmoteKind; name: string }) => { url: string; title?: string } | null;

function safeTokenName(s: string) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 32);
}

const MAX_EMOTES_PER_MSG = 20;
const MAX_RICH_PARTS = 220;

function EmoteImg({ src, title, alt, kind }: { src: string; title?: string; alt: string; kind: EmoteKind }) {
  const [err, setErr] = React.useState(false);
  if (err) return <span className="emote-error" title={title || alt}>{alt}</span>;
  return (
    <img
      className={`ll-emote ll-emote--${kind}`}
      src={src} alt={alt} title={title || alt}
      loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
      onError={() => setErr(true)}
    />
  );
}

function renderBodyRich(
  body: string,
  currentUsername: string | null | undefined,
  resolveEmote: ResolveEmote | undefined
) {
  const me = currentUsername ? normKey(currentUsername) : "";
  function splitUrl(raw: string) {
    let url = String(raw || ""), tail = "";
    while (url.length) {
      const last = url[url.length - 1];
      if (/[)\].,!?;:}]/.test(last)) { tail = last + tail; url = url.slice(0, -1); continue; }
      break;
    }
    return { url, tail };
  }
  function toHref(u: string) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (/^www\./i.test(s)) return `https://${s}`;
    if (/[a-z0-9.-]+\.[a-z]{2,63}(\/|$)/i.test(s)) return `https://${s}`;
    return s;
  }
  const re = /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63})(?:\/[^\s<]*)?)|@([^\s@]{1,32})|:(e|g):([a-z0-9_]{1,32}):/gi;
  const parts: React.ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, emotesCount = 0;
  while ((m = re.exec(body))) {
    if (parts.length > MAX_RICH_PARTS) break;
    const start = m.index, end = re.lastIndex;
    if (start > last) parts.push(body.slice(last, start));
    if (m[1]) {
      const raw = String(m[1] ?? "");
      const { url, tail } = splitUrl(raw);
      const href = toHref(url);
      if (/^https?:\/\//i.test(href)) {
        parts.push(
          <a key={`u-${start}`} href={href} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration:"underline", fontWeight:800, wordBreak:"break-word", overflowWrap:"anywhere", color:"rgba(167,139,250,.90)" }}
            onClick={e => e.stopPropagation()}>
            {url}
          </a>
        );
        if (tail) parts.push(tail);
      } else { parts.push(raw); }
      last = end; continue;
    }
    if (m[2]) {
      const token = String(m[2] ?? "");
      const isMe = !!me && normKey(token) === me;
      parts.push(
        <span key={`m-${start}`}
          style={{
            display:"inline-block", padding:"1px 7px", borderRadius:999, margin:"0 1px",
            fontWeight:800,
            border: isMe ? "1px solid rgba(124,92,252,.38)" : "1px solid rgba(255,255,255,.10)",
            background: isMe ? "rgba(124,92,252,.24)" : "rgba(255,255,255,.06)",
            boxShadow: isMe ? "0 0 0 2px rgba(124,92,252,.12)" : "none",
            color: isMe ? "rgba(196,181,253,.95)" : "inherit",
          }}
          title={isMe ? "Tu as été mentionné" : token}>
          @{token}
        </span>
      );
      last = end; continue;
    }
    const kindToken = String(m[3] ?? "").toLowerCase();
    const name = safeTokenName(String(m[4] ?? ""));
    const kind: EmoteKind = kindToken === "g" ? "gif" : "emoji";
    if (emotesCount >= MAX_EMOTES_PER_MSG) { parts.push(`:${kindToken}:${name}:`); last = end; continue; }
    const hit = resolveEmote?.({ kind, name });
    if (hit?.url) {
      emotesCount += 1;
      parts.push(<EmoteImg key={`e-${start}`} src={hit.url} kind={kind} alt={`:${kindToken}:${name}:`} title={hit.title || `:${kindToken}:${name}:`} />);
    } else { parts.push(`:${kindToken}:${name}:`); }
    last = end;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.length ? parts : body;
}

/* ─── Main component ─────────────────────────────────────── */
export function ChatMessageBubble({
  msg, streamerAppearance, currentUsername, resolveEmote, isGrouped,
}: {
  msg: ChatMsgLike;
  streamerAppearance: StreamerAppearance;
  currentUsername?: string | null;
  resolveEmote?: ResolveEmote;
  isGrouped?: boolean;
}) {
  const isDlive = !!(msg as any)?.dlive;
  const dliveFrom = ((msg as any)?.dliveRestreamFrom ?? null) as string | null;
  const isBot = !!(msg as any)?.isBot || msg.username === "LunaBot" ||
    msg.userId === Number((import.meta as any)?.env?.VITE_BOT_USER_ID || 0);

  const c = msg.cosmetics ?? null;
  const lvl = (streamerAppearance?.chat?.viewerSkinsLevel ?? 1) as 1 | 2 | 3;

  const avatar    = c?.avatar ?? {};
  const badges    = Array.isArray(c?.badges) ? c!.badges! : [];
  const titleInfo = normalizeTitle(c?.title ?? null);
  const frame     = c?.frame ?? null;

  const unameEffect        = c?.username?.effect ?? "none";
  const skinUnameColor     = c?.username?.color ?? null;
  const allowViewerNameColor = lvl < 2;
  const effectiveUnameColor = allowViewerNameColor ? skinUnameColor : null;

  const avatarUrl =
    (msg as any)?.avatarUrl ?? (c as any)?.avatarUrl ??
    (c as any)?.avatar?.url ?? (c as any)?.avatar?.imageUrl ?? null;

  const [imgErr, setImgErr] = React.useState(false);
  React.useEffect(() => setImgErr(false), [avatarUrl]);

  const hatIdNorm = (avatar as any)?.hatId ? String((avatar as any).hatId).replace(/^hat_/, "") : null;
  const hatEmoji = (avatar as any)?.hatEmoji || (hatIdNorm ? ({
    luna_cap: "🧢", carton_crown: "👑", demon_horn: "😈",
    eclipse_halo: "⭕", astral_helmet: "🪖", lotus_aureole: "🪷",
  } as Record<string, string>)[hatIdNorm] || null : null);

  const meKey   = currentUsername ? normKey(currentUsername) : "";
  const mentions = extractMentions(String(msg.body ?? ""));
  const isPinged = !!meKey && mentions.some(t => normKey(t) === meKey);

  /* ── Styles contextuels ── */
  const rowStyle: React.CSSProperties = isPinged
    ? { borderRadius:16, outline:"1px solid rgba(124,92,252,.28)", boxShadow:"0 0 0 2px rgba(124,92,252,.10)", background:"rgba(124,92,252,.07)" }
    : isBot
    ? { borderRadius:16, outline:"1px solid rgba(239,68,68,.20)", background:"linear-gradient(135deg,rgba(239,68,68,.09),rgba(252,165,165,.04))" }
    : isDlive
    ? { borderRadius:14, outline:"1px solid rgba(255,255,255,.06)", background:"rgba(255,255,255,.025)" }
    : {};

  return (
    <div
      className={[
        "chatMsgRow",
        frameClass(frame?.frameId),
        isPinged     ? "chatPinged"       : "",
        isDlive      ? "chatMsgRow--dlive" : "",
        isBot        ? "chatMsgRow--bot"   : "",
        isGrouped    ? "chatMsgRow--grouped" : "",
      ].filter(Boolean).join(" ")}
      style={rowStyle}>
      <div className="chatMsgInner">

        {/* ── Avatar : toujours affiché sur le 1er message, slot invisible sur les groupés ── */}
        <div className={`chatAvatarBorder chatAvatarSlot ${avatarBorderClass((avatar as any).borderId)}`}>
          {!isGrouped ? (
            <>
              <div className="chatAvatarCircle">
                {avatarUrl && !imgErr ? (
                  <img className="chatAvatarImg" src={avatarUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImgErr(true)} />
                ) : getInitials(msg.username)}
              </div>
              {hatEmoji ? <div className="chatHatEmoji" aria-hidden="true">{hatEmoji}</div> : null}
            </>
          ) : null}
        </div>

        {/* ── Contenu ── */}
        <div className="chatMsgContent" style={{ minWidth:0 }}>

          {/* Header : caché pour les messages groupés */}
          {!isGrouped ? (
            <>
              <div className="chatMsgTop">
                <div className="chatMsgTopLeft" style={{ minWidth:0, display:"flex", flexWrap:"wrap", alignItems:"center", gap:5 }}>

                  {/* Badge BOT */}
                  {isBot ? (
                    <span className="chatBadge badge--bot"
                      style={{ fontWeight:950, border:"1px solid rgba(239,68,68,.28)", background:"rgba(239,68,68,.12)", color:"rgba(252,165,165,.95)" }}
                      title="Bot">BOT</span>
                  ) : null}

                  {/* Badges cosmétiques */}
                  {badges.length ? (
                    <div className="chatBadges">
                      {badges.map((b: any) => (
                        <span key={b.id}
                          className={`chatBadge badge--${b.tier || "silver"}`}
                          style={{
                            ...(b.borderColor     ? { borderColor:b.borderColor }           : null),
                            ...(b.textColor       ? { color:b.textColor }                   : null),
                            ...(b.backgroundColor ? { backgroundColor:b.backgroundColor }   : null),
                          }}>
                          {b.icon ? <span className="chatBadgeIcon">{b.icon}</span> : null}
                          {badgeLabel(b)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Username */}
                  <div
                    className={`chatUsername ${usernameEffectClass(unameEffect as any)}`}
                    style={{
                      ["--uname-color" as any]: isBot
                        ? "rgba(252,165,165,.95)"
                        : (effectiveUnameColor ?? "var(--chat-name-color)"),
                      ...(isBot ? { fontWeight:950, letterSpacing:".5px", textTransform:"uppercase" } : null),
                      opacity: isDlive ? .92 : undefined,
                    } as React.CSSProperties}
                    title={msg.username}>
                    {msg.username}

                    {/* Pill DLive */}
                    {isDlive ? (
                      <span style={{
                        display:"inline-block", marginLeft:7, padding:"1px 7px",
                        borderRadius:999, fontSize:11, fontWeight:800,
                        border:"1px solid rgba(255,255,255,.10)",
                        background:"rgba(255,255,255,.06)",
                        opacity:.88, verticalAlign:"middle",
                      }} title="Retransmis depuis DLive">
                        {dliveFrom ? `DLive · ${dliveFrom}` : "DLive"}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Timestamp supprimé */}
              </div>

              {/* Titre sous username */}
              {titleInfo ? (
                <div
                  className={`chatTitle ${titleTierClass(titleInfo.tier as any)}`}
                  data-title-code={titleInfo.code}
                  style={{ marginTop:2, fontSize:".90em", fontStyle:"italic", textDecoration:"underline", opacity:.95 }}
                  title={titleInfo.code}>
                  {titleInfo.text}
                </div>
              ) : null}
            </>
          ) : null}

          {/* Corps du message */}
          <div
            className={`chatBodyText ${isEmotesOnly(String(msg.body ?? "")) ? "emotes-only" : ""}`}
            style={{
              minWidth:0, whiteSpace:"pre-wrap", overflowWrap:"anywhere",
              wordBreak:"break-word", lineHeight:1.3,
              marginTop: isGrouped ? 0 : undefined,
              opacity: isDlive ? .92 : undefined,
              color:"var(--chat-msg-color,rgba(235,232,255,.88))",
            }}>
            {renderBodyRich(String(msg.body ?? ""), currentUsername, resolveEmote)}
          </div>
        </div>
      </div>
    </div>
  );
}