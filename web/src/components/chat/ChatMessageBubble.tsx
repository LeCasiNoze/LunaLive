// web/src/components/chat/ChatMessageBubble.tsx
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
};

function normalizeTitle(title: any): { code: string; text: string; tier?: string | null } | null {
  if (!title) return null;

  const codeRaw =
    (typeof title === "string" ? title : null) ||
    (typeof title?.code === "string" ? title.code : null) ||
    (typeof title?.id === "string" ? title.id : null) ||
    (typeof title?.text === "string" ? title.text : null) ||
    (typeof title?.label === "string" ? title.label : null);

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

  const text =
    TITLE_LABELS[code] ??
    code
      .replace(/^title_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());

  const tier = typeof title?.tier === "string" ? title.tier : null;

  return { code, text, tier };
}

function badgeLabel(b: any): string {
  const v = b?.label ?? b?.text ?? b?.badgeText ?? b?.meta?.badgeText ?? b?.code ?? "";
  return String(v);
}

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractMentions(body: string): string[] {
  const out: string[] = [];
  const re = /@([^\s@]{1,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const token = String(m[1] ?? "").trim();
    if (token) out.push(token);
  }
  return out;
}

/* =========================================================
   Emotes tokens : :e:name: / :g:name:
   ========================================================= */
type EmoteKind = "emoji" | "gif";
type ResolveEmote = (p: { kind: EmoteKind; name: string }) => { url: string; title?: string } | null;

function safeTokenName(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 32);
}

const MAX_EMOTES_PER_MSG = 20;
const MAX_RICH_PARTS = 220; // safety against pathological bodies

function EmoteImg({
  src,
  title,
  alt,
  kind,
}: {
  src: string;
  title?: string;
  alt: string;
  kind: EmoteKind;
}) {
  const [err, setErr] = React.useState(false);

  if (err) {
    return (
      <span style={{ opacity: 0.9, fontWeight: 800 }} title={title || alt}>
        {alt}
      </span>
    );
  }

  const isGif = kind === "gif";
  const size = isGif ? 34 : 22;

  return (
    <img
      src={src}
      alt={alt}
      title={title || alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        verticalAlign: "middle",
        margin: isGif ? "0 3px" : "0 2px",
        borderRadius: isGif ? 10 : 6,
        border: isGif ? "1px solid rgba(255,255,255,0.10)" : "none",
        background: isGif ? "rgba(255,255,255,0.04)" : "transparent",
        boxShadow: isGif ? "0 8px 18px rgba(0,0,0,0.22)" : "none",
      }}
      onError={() => setErr(true)}
    />
  );
}
// parsing inline (links + mentions + emotes)
function renderBodyRich(
  body: string,
  currentUsername: string | null | undefined,
  resolveEmote: ResolveEmote | undefined
) {
  const me = currentUsername ? normKey(currentUsername) : "";

  // coupe la ponctuation finale typique qui "colle" aux URLs dans le chat
  function splitUrl(raw: string): { url: string; tail: string } {
    let url = String(raw || "");
    let tail = "";
    // retire les ponctuations finales fréquentes, et les parenthèses fermantes
    // (ex: https://x.com). => lien = https://x.com, tail = ")."
    while (url.length) {
      const last = url[url.length - 1];
      if (/[)\].,!?;:}]/.test(last)) {
        tail = last + tail;
        url = url.slice(0, -1);
        continue;
      }
      break;
    }
    return { url, tail };
  }

  // captures: URL OR @mention OR :e:name: / :g:name:
  // groups:
  //  m[1] = url
  //  m[2] = mention name
  //  m[3] = e|g
  //  m[4] = emote name
  const re = /(https?:\/\/[^\s<]+)|@([^\s@]{1,32})|:(e|g):([a-z0-9_]{1,32}):/gi;

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  let emotesCount = 0;

  while ((m = re.exec(body))) {
    if (parts.length > MAX_RICH_PARTS) break;

    const start = m.index;
    const end = re.lastIndex;

    if (start > last) parts.push(body.slice(last, start));

    // URL
    if (m[1]) {
      const raw = String(m[1] ?? "");
      const { url, tail } = splitUrl(raw);

      // double sécurité : on ne rend cliquable que http(s)
      if (/^https?:\/\//i.test(url)) {
        parts.push(
          <a
            key={`u-${start}-${end}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="chatLink"
            style={{
              textDecoration: "underline",
              fontWeight: 800,
              wordBreak: "break-word",
              WebkitTapHighlightColor: "transparent",
            }}
            onClick={(e) => {
              // évite que des handlers parent “capturent” le tap/click sur mobile
              e.stopPropagation();
            }}
          >
            {url}
          </a>
        );
        if (tail) parts.push(tail);
      } else {
        parts.push(raw);
      }

      last = end;
      continue;
    }

    // mention
    if (m[2]) {
      const token = String(m[2] ?? "");
      const tokenKey = normKey(token);
      const isMe = !!me && tokenKey === me;

      parts.push(
        <span
          key={`m-${start}-${end}`}
          className="chatMention"
          style={{
            display: "inline-block",
            padding: "0 6px",
            borderRadius: 999,
            margin: "0 1px",
            fontWeight: 900,
            border: "1px solid rgba(255,255,255,0.10)",
            background: isMe ? "rgba(124,77,255,0.28)" : "rgba(255,255,255,0.06)",
            boxShadow: isMe ? "0 0 0 2px rgba(124,77,255,0.12)" : "none",
          }}
          title={isMe ? "Tu as été mentionné" : token}
        >
          @{token}
        </span>
      );

      last = end;
      continue;
    }

    // emote token
    const kindToken = String(m[3] ?? "").toLowerCase(); // e|g
    const nameRaw = String(m[4] ?? "");
    const name = safeTokenName(nameRaw);

    const kind: EmoteKind = kindToken === "g" ? "gif" : "emoji";

    // anti-spam
    if (emotesCount >= MAX_EMOTES_PER_MSG) {
      parts.push(`:${kindToken}:${name}:`);
      last = end;
      continue;
    }

    const hit = resolveEmote?.({ kind, name });

    if (hit?.url) {
      emotesCount += 1;
      parts.push(
        <EmoteImg
          key={`e-${start}-${end}`}
          src={hit.url}
          kind={kind}
          alt={`:${kindToken}:${name}:`}
          title={hit.title || `:${kindToken}:${name}:`}
        />
      );
    } else {
      parts.push(`:${kindToken}:${name}:`);
    }

    last = end;
  }

  if (last < body.length) parts.push(body.slice(last));

  return parts.length ? parts : body;
}


export function ChatMessageBubble({
  msg,
  streamerAppearance,
  currentUsername,
  resolveEmote,
}: {
  msg: ChatMsgLike;
  streamerAppearance: StreamerAppearance;
  currentUsername?: string | null;
  resolveEmote?: ResolveEmote;
}) {
  const c = msg.cosmetics ?? null;
  const lvl = (streamerAppearance?.chat?.viewerSkinsLevel ?? 1) as 1 | 2 | 3;

  const avatar = c?.avatar ?? {};
  const badges = Array.isArray(c?.badges) ? c!.badges! : [];
  const titleInfo = normalizeTitle(c?.title ?? null);
  const frame = c?.frame ?? null;

  const unameEffect = c?.username?.effect ?? "none";
  const skinUnameColor = c?.username?.color ?? null;

  const allowViewerNameColor = lvl < 2;
  const effectiveUnameColor = allowViewerNameColor ? skinUnameColor : null;

  const avatarUrl =
    (msg as any)?.avatarUrl ??
    (c as any)?.avatarUrl ??
    (c as any)?.avatar?.url ??
    (c as any)?.avatar?.imageUrl ??
    null;

  const [imgErr, setImgErr] = React.useState(false);
  React.useEffect(() => setImgErr(false), [avatarUrl]);

  const hatIdNorm = avatar?.hatId ? String(avatar.hatId).replace(/^hat_/, "") : null;

  const hatEmoji =
    (avatar as any)?.hatEmoji ||
    (hatIdNorm
      ? ({
          luna_cap: "🧢",
          carton_crown: "👑",
          demon_horn: "😈",
          eclipse_halo: "⭕",
          astral_helmet: "🪖",
          lotus_aureole: "🪷",
        } as Record<string, string>)[hatIdNorm] || null
      : null);

  const meKey = currentUsername ? normKey(currentUsername) : "";
  const mentions = extractMentions(String(msg.body ?? ""));
  const isPinged = !!meKey && mentions.some((t) => normKey(t) === meKey);

  return (
    <div
      className={`chatMsgRow ${frameClass(frame?.frameId)} ${isPinged ? "chatPinged" : ""}`}
      style={
        isPinged
          ? {
              borderRadius: 16,
              outline: "1px solid rgba(124,77,255,0.28)",
              boxShadow: "0 0 0 2px rgba(124,77,255,0.10), 0 12px 30px rgba(0,0,0,0.25)",
              background: "rgba(124,77,255,0.06)",
            }
          : undefined
      }
    >
      <div className="chatMsgInner">
        {/* Avatar */}
        <div className={`chatAvatarBorder ${avatarBorderClass((avatar as any).borderId)}`}>
          <div className="chatAvatarCircle">
            {avatarUrl && !imgErr ? (
              <img
                className="chatAvatarImg"
                src={avatarUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImgErr(true)}
              />
            ) : (
              getInitials(msg.username)
            )}
          </div>

          {hatEmoji ? (
            <div className="chatHatEmoji" aria-hidden="true">
              {hatEmoji}
            </div>
          ) : null}
        </div>

        {/* Content */}
        <div className="chatMsgContent">
          <div className="chatMsgTop">
            <div className="chatMsgTopLeft">
              {/* Badges */}
              {badges.length ? (
                <div className="chatBadges">
                  {badges.map((b: any) => (
                    <span
                      key={b.id}
                      className={`chatBadge badge--${b.tier || "silver"}`}
                      style={{
                        ...(b.borderColor ? { borderColor: b.borderColor } : null),
                        ...(b.textColor ? { color: b.textColor } : null),
                        ...(b.backgroundColor ? { backgroundColor: b.backgroundColor } : null),
                      }}
                    >
                      {b.icon ? <span className="chatBadgeIcon">{b.icon}</span> : null}
                      {badgeLabel(b)}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Username */}
              <div
                className={`chatUsername ${usernameEffectClass(unameEffect as any)}`}
                style={
                  ({
                    ["--uname-color" as any]: effectiveUnameColor ?? "var(--chat-name-color)",
                  } as React.CSSProperties)
                }
                title={msg.username}
              >
                {msg.username}
              </div>
            </div>

            <div className="chatTimestamp">{formatHHMM(msg.createdAt)}</div>
          </div>

          {/* Title UNDER username */}
          {titleInfo ? (
            <div
              className={`chatTitle ${titleTierClass(titleInfo.tier as any)}`}
              data-title-code={titleInfo.code}
              style={{
                marginTop: 2,
                fontSize: "0.92em",
                fontStyle: "italic",
                textDecoration: "underline",
                opacity: 0.95,
                animation: "none",
                textShadow: "none",
                filter: "none",
              }}
              title={titleInfo.code}
            >
              {titleInfo.text}
            </div>
          ) : null}

          {/* Body */}
          <div className="chatBodyText">
            {renderBodyRich(String(msg.body ?? ""), currentUsername, resolveEmote)}
          </div>
        </div>
      </div>
    </div>
  );
}
