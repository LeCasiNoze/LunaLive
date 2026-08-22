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
  getInitials,
  titleTierClass,
  usernameEffectClass,
} from "../../lib/cosmetics";
import type { StreamerAppearance } from "../../lib/appearance";
import { TitleSecondLine } from "./TitlePill";
// Effets moteur (canvas) : modules LÉGERS — pixi/gsap ne chargent que via
// AnimatedUsername/FrameFxOverlay (import() interne, chunk séparé)
import AnimatedUsername from "../../fx/username/AnimatedUsername";
import FrameFxOverlay from "../../fx/username/FrameFxOverlay";
import { FRAME_FX_CODES } from "../../fx/username/frameFxCodes";
import { resolveEngineUsernameFx } from "../../fx/username/engineCodes";

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
  rumble?: boolean;
  rumbleLinked?: boolean;
  /** Rôle de l'auteur (attaché par l'API) : viewer | mod | streamer | admin | bot */
  role?: string | null;
};

// Chapeaux cosmétiques : vrais props graphiques (web/public/Hats, planche
// générée par Lucas + détourage) — largeur/offset calibrés par chapeau,
// ancrés sur l'avatar 48px. L'emoji reste le fallback si l'asset manque.
const HAT_ASSETS: Record<string, { w: number; top: number; dx?: number }> = {
  luna_cap: { w: 46, top: -17 },
  carton_crown: { w: 44, top: -19 },
  demon_horn: { w: 48, top: -15 },
  eclipse_halo: { w: 46, top: -19 },
  astral_helmet: { w: 48, top: -15 },
  lotus_aureole: { w: 42, top: -17 },
  top_hat: { w: 44, top: -23 },
  santa: { w: 46, top: -19 },
  witch: { w: 48, top: -23 },
  pirate: { w: 50, top: -19 },
  viking: { w: 48, top: -15 },
  propeller: { w: 44, top: -19 },
};

// Signe distinctif de rôle, à gauche du pseudo (maquette Stitch "Densité
// Verticale") — l'icône change selon qui parle.
const ROLE_META: Record<string, { icon: string; label: string }> = {
  viewer: { icon: "⚡", label: "Viewer" },
  mod: { icon: "🛡️", label: "Modérateur" },
  streamer: { icon: "🎙️", label: "Streamer" },
  admin: { icon: "👑", label: "Admin LunaLive" },
  bot: { icon: "🤖", label: "Bot" },
  rumble: { icon: "▶", label: "Viewer Rumble" },
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
function ChatMessageBubbleImpl({
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
  const isRumble = !!(msg as any)?.rumble;
  const rumbleLinked = !!(msg as any)?.rumbleLinked;
  const configuredBotUserId = Number((import.meta as any)?.env?.VITE_BOT_USER_ID || 0);
  const isBot = !!(msg as any)?.isBot || msg.username === "LunaBot" ||
    (configuredBotUserId > 0 && msg.userId === configuredBotUserId);

  const c = msg.cosmetics ?? null;
  const multiTitles = (c as any)?.titles as
    | { shop?: any; achievement?: any; level?: any }
    | null
    | undefined;
  const lvl = (streamerAppearance?.chat?.viewerSkinsLevel ?? 1) as 1 | 2 | 3;

  const avatar    = c?.avatar ?? {};
  const badges    = Array.isArray(c?.badges) ? c!.badges! : [];
  const titleInfo = normalizeTitle(c?.title ?? null);
  const frame     = c?.frame ?? null;

  const unameEffect        = c?.username?.effect ?? "none";
  // Effet pseudo MOTEUR (canvas) ? — inclut le mapping legacy uanim_*→ufx-*
  const engineFx           = isBot ? null : resolveEngineUsernameFx(unameEffect);
  const skinUnameColor     = c?.username?.color ?? null;
  const allowViewerNameColor = lvl < 2;
  const effectiveUnameColor = allowViewerNameColor ? skinUnameColor : null;

  const avatarUrl =
    (msg as any)?.avatarUrl ?? (c as any)?.avatarUrl ??
    (c as any)?.avatar?.url ?? (c as any)?.avatar?.imageUrl ?? null;

  const [imgErr, setImgErr] = React.useState(false);
  React.useEffect(() => setImgErr(false), [avatarUrl]);
  // asset chapeau manquant → retombe sur l'emoji
  const [hatImgErr, setHatImgErr] = React.useState(false);

  const hatIdNorm = (avatar as any)?.hatId ? String((avatar as any).hatId).replace(/^hat_/, "") : null;
  const hatEmoji = (avatar as any)?.hatEmoji || (hatIdNorm ? ({
    luna_cap: "🧢", carton_crown: "👑", demon_horn: "😈",
    eclipse_halo: "⭕", astral_helmet: "🪖", lotus_aureole: "🪷",
  } as Record<string, string>)[hatIdNorm] || null : null);

  const meKey   = currentUsername ? normKey(currentUsername) : "";
  const mentions = extractMentions(String(msg.body ?? ""));
  const isPinged = !!meKey && mentions.some(t => normKey(t) === meKey);

  // Variante "slim" (aucun badge) : avatar réduit sur la ligne du pseudo,
  // contenu pleine largeur — économise la colonne et de la hauteur.
  const slim = badges.length === 0;
  const roleKey = isBot ? "bot" : isRumble ? "rumble" : String((msg as any)?.role || "viewer");
  const roleMeta = ROLE_META[roleKey] ?? ROLE_META.viewer;

  const hatAsset = hatIdNorm && !hatImgErr ? HAT_ASSETS[hatIdNorm] : null;
  const avatarCore = (
    <div className={`chatAvatarBorder ${avatarBorderClass((avatar as any).borderId)}`}>
      <div className="chatAvatarCircle">
        {avatarUrl && !imgErr ? (
          <img className="chatAvatarImg" src={avatarUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImgErr(true)} />
        ) : getInitials(msg.username)}
      </div>
      {hatAsset ? (
        <img
          className="chatHatImg"
          src={`/Hats/hat_${hatIdNorm}.png`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{ width: hatAsset.w, top: hatAsset.top, marginLeft: hatAsset.dx ?? 0 }}
          onError={() => setHatImgErr(true)}
        />
      ) : hatEmoji ? (
        <div className="chatHatEmoji" aria-hidden="true">{hatEmoji}</div>
      ) : null}
    </div>
  );

  /* ── Styles contextuels ── */
  const rowStyle: React.CSSProperties = isPinged
    ? { borderRadius:16, outline:"1px solid rgba(124,92,252,.28)", boxShadow:"0 0 0 2px rgba(124,92,252,.10)", background:"rgba(124,92,252,.07)" }
    : isBot
    ? {
        borderRadius:16,
        outline:"1px solid rgba(239,68,68,.30)",
        // Le background inline remplace celui, opaque, de .chatMsgRow.
        // Il doit donc contenir sa propre base sombre : avec seulement .09/.04
        // les messages LunaBot devenaient presque transparents dans OBS.
        background:"linear-gradient(135deg,rgba(48,12,25,.96),rgba(27,10,22,.94))",
        boxShadow:"0 10px 40px rgba(0,0,0,.32),0 0 18px rgba(239,68,68,.10)",
      }
    : isDlive
    ? { borderRadius:14, outline:"1px solid rgba(255,255,255,.06)", background:"rgba(255,255,255,.025)" }
    : isRumble
    ? {
        borderRadius:16,
        borderLeft:"3px solid rgba(133,224,80,.82)",
        outline:"1px solid rgba(133,224,80,.24)",
        background:"linear-gradient(135deg,rgba(18,30,20,.97),rgba(16,11,24,.97))",
        boxShadow:"0 12px 34px rgba(0,0,0,.28),inset 0 1px 0 rgba(196,255,157,.035)",
      }
    : {};

  return (
    <div
      className={[
        "chatMsgRow",
        // Frame cosmétique appliquée sur la row entière (avatar inclus)
        // pour ne pas créer un encadrement interne uniquement autour du texte.
        !isGrouped ? frameClass(frame?.frameId) : "",
        isPinged     ? "chatPinged"       : "",
        isDlive      ? "chatMsgRow--dlive" : "",
        isRumble     ? "chatMsgRow--rumble" : "",
        isBot        ? "chatMsgRow--bot"   : "",
        isGrouped    ? "chatMsgRow--grouped" : "",
      ].filter(Boolean).join(" ")}
      style={{ position: "relative", ...rowStyle }}>
      {/* Particules canvas des cadrans premium (pièces, braises, cœurs…) —
          par-dessus le cadre CSS, pointer-events none */}
      {!isGrouped && frame?.frameId && FRAME_FX_CODES.includes(String(frame.frameId)) ? (
        <FrameFxOverlay effectId={String(frame.frameId)} />
      ) : null}
      <div className={`chatMsgInner${slim ? " chatMsgInner--slim" : ""}`}>

        {/* ── Colonne gauche : avatar imposant + badges empilés dessous ──
            (maquette Stitch "Densité Verticale" ; slot invisible si groupé ;
            absente en variante slim = compte sans badge) */}
        {!slim ? (
          <div className="chatColLeft chatAvatarSlot">
            {!isGrouped ? (
              <>
                {avatarCore}
                <div className="chatColBadges">
                  {badges.slice(0, 2).map((b: any) => {
                    const label = badgeLabel(b);
                    // police adaptative : le badge doit TOUJOURS tenir dans
                    // la largeur de la colonne, quel que soit le texte
                    const fontSize = label.length <= 4 ? 9 : label.length <= 6 ? 8 : 7;
                    return (
                      <span key={b.id}
                        className={`chatBadge chatBadge--col badge--${b.tier || "silver"} bfx--${String(b.id || "").replace(/[^a-z0-9_-]/gi, "")}`}
                        style={{
                          fontSize,
                          ...(b.borderColor     ? { borderColor:b.borderColor }           : null),
                          ...(b.textColor       ? { color:b.textColor }                   : null),
                          ...(b.backgroundColor ? { backgroundColor:b.backgroundColor }   : null),
                        }}>
                        {b.icon ? <span className="chatBadgeIcon">{b.icon}</span> : null}
                        {label}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* ── Contenu ── */}
        <div className="chatMsgContent" style={{ minWidth:0 }}>

          {/* Header : caché pour les messages groupés */}
          {!isGrouped ? (
            <>
              <div className="chatMsgTop">
                {/* nowrap : le pseudo se tronque (ellipsis) plutôt que de
                    passer à la ligne sous l'avatar/l'icône de rôle */}
                <div className="chatMsgTopLeft" style={{ minWidth:0, display:"flex", flexWrap:"nowrap", alignItems:"center", gap:6 }}>

                  {/* Variante slim : l'avatar (réduit) vit sur la ligne du pseudo */}
                  {slim ? <span className="chatAvatarSm">{avatarCore}</span> : null}

                  {/* Signe distinctif de rôle (viewer/modo/streamer/admin/bot) */}
                  <span className={`chatRoleChip chatRoleChip--${roleKey}`} title={roleMeta.label}>
                    {roleMeta.icon}
                  </span>

                  {/* Username — moteur canvas si l'effet est au registre,
                      sinon span CSS classique */}
                  <div
                    className={`chatUsername ${engineFx ? "" : usernameEffectClass(unameEffect as any)}`}
                    data-text={msg.username}
                    style={{
                      minWidth: 0,
                      ["--uname-color" as any]: isBot
                        ? "rgba(252,165,165,.95)"
                        : isRumble && !rumbleLinked
                          ? "rgba(214,246,194,.97)"
                          : (effectiveUnameColor ?? "var(--chat-name-color)"),
                      ...(isBot ? { fontWeight:950, letterSpacing:".5px", textTransform:"uppercase" } : null),
                      // moteur : le canvas déborde volontairement du texte
                      // (particules) — l'overflow:hidden du CSS le clipperait
                      ...(engineFx ? { overflow: "visible" } : null),
                      opacity: isDlive ? .92 : undefined,
                    } as React.CSSProperties}
                    title={msg.username}>
                    {engineFx ? (
                      <AnimatedUsername
                        username={msg.username}
                        effectId={engineFx.id}
                        rarity={engineFx.rarity}
                        context="chat"
                        intensity={1}
                        size={14.5}
                        inline
                      />
                    ) : (
                      msg.username
                    )}

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

                    {/* Pill Rumble */}
                    {isRumble ? (
                      <span style={{
                        display:"inline-flex", alignItems:"center", gap:5,
                        marginLeft:7, padding:"1px 7px",
                        borderRadius:999, fontSize:11, fontWeight:800,
                        border:"1px solid rgba(133,224,80,.38)",
                        background:"rgba(133,224,80,.13)",
                        color:"rgba(205,246,176,.98)",
                        verticalAlign:"middle",
                      }} title="Message envoyé depuis le chat Rumble">
                        <svg width="9" height="10" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
                          <path d="M1 1.4a1 1 0 0 1 1.5-.86l8.7 5.6a1 1 0 0 1 0 1.72l-8.7 5.6A1 1 0 0 1 1 12.6V1.4Z"/>
                        </svg>
                        Rumble
                      </span>
                    ) : null}

                  </div>
                </div>

                {/* Timestamp supprimé */}
              </div>

              {/* ✅ NEW: 2e ligne — Achievement + Level (Sprint 3.5) */}
              {multiTitles && (multiTitles.achievement || multiTitles.level) ? (
                <TitleSecondLine titles={multiTitles as any} />
              ) : titleInfo ? (
                /* Fallback legacy: si pas de multi-slots, on affiche l'ancien titre */
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

          {/* Corps du message : dans sa propre bulle (séparation stricte
              meta/message, maquette Stitch) */}
          <div className="chatBodyBubble" style={{
            marginTop: isGrouped ? 0 : undefined,
            ...(isRumble ? {
              borderColor:"rgba(133,224,80,.10)",
              background:"linear-gradient(135deg,rgba(133,224,80,.075),rgba(255,255,255,.028))",
            } : null),
          }}>
            <div
              className={`chatBodyText ${isEmotesOnly(String(msg.body ?? "")) ? "emotes-only" : ""}`}
              style={{
                minWidth:0, whiteSpace:"pre-wrap", overflowWrap:"anywhere",
                wordBreak:"break-word", lineHeight:1.35,
                opacity: isDlive ? .92 : undefined,
                color:"var(--chat-msg-color,rgba(235,232,255,.88))",
              }}>
              {renderBodyRich(String(msg.body ?? ""), currentUsername, resolveEmote)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// Mémoïsation : SANS ça, chaque nouveau message re-rend les ~50 bulles du
// chat (cosmétiques, cadrans, emotes compris). Le parent recrée l'objet
// msg à chaque render (spread + cosmetics dérivés) → comparateur manuel :
// id/body/deleted + identité des props stables + cosmetics par valeur
// (petits objets, stringify ~µs, négligeable devant un re-render de bulle).
function bubblePropsEqual(
  prev: React.ComponentProps<typeof ChatMessageBubbleImpl>,
  next: React.ComponentProps<typeof ChatMessageBubbleImpl>,
) {
  const a = prev.msg as any;
  const b = next.msg as any;
  if (a.id !== b.id || a.body !== b.body || a.deleted !== b.deleted) return false;
  if (a.rumble !== b.rumble || a.rumbleLinked !== b.rumbleLinked) return false;
  if (prev.isGrouped !== next.isGrouped) return false;
  if (prev.currentUsername !== next.currentUsername) return false;
  if (prev.streamerAppearance !== next.streamerAppearance) return false;
  if (prev.resolveEmote !== next.resolveEmote) return false;
  if (a.cosmetics === b.cosmetics) return true;
  try {
    return JSON.stringify(a.cosmetics ?? null) === JSON.stringify(b.cosmetics ?? null);
  } catch {
    return false;
  }
}

export const ChatMessageBubble = React.memo(ChatMessageBubbleImpl, bubblePropsEqual);
