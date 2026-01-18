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
  // capture @token jusqu'au prochain espace
  // (on ignore @ seul)
  const out: string[] = [];
  const re = /@([^\s@]{1,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const token = String(m[1] ?? "").trim();
    if (token) out.push(token);
  }
  return out;
}

function renderBodyWithMentions(body: string, currentUsername?: string | null) {
  const me = currentUsername ? normKey(currentUsername) : "";
  const re = /@([^\s@]{1,32})/g;

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(body))) {
    const start = m.index;
    const end = re.lastIndex;
    const token = String(m[1] ?? "");
    const tokenKey = normKey(token);

    if (start > last) parts.push(body.slice(last, start));

    const isMe = !!me && tokenKey === me;

    parts.push(
      <span
        key={`${start}-${end}`}
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
  }

  if (last < body.length) parts.push(body.slice(last));

  return parts.length ? parts : body;
}

export function ChatMessageBubble({
  msg,
  streamerAppearance,
  currentUsername,
}: {
  msg: ChatMsgLike;
  streamerAppearance: StreamerAppearance;
  currentUsername?: string | null;
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
    (msg as any)?.avatarUrl ?? (c as any)?.avatarUrl ?? (c as any)?.avatar?.url ?? (c as any)?.avatar?.imageUrl ?? null;

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
          <div className="chatBodyText">{renderBodyWithMentions(String(msg.body ?? ""), currentUsername)}</div>
        </div>
      </div>
    </div>
  );
}
