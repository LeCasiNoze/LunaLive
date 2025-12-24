// web/src/components/chat/ChatMessageBubble.tsx
import * as React from "react";
import type { ChatCosmetics } from "../../lib/cosmetics";
import {
  avatarBorderClass,
  frameClass,
  formatHHMM,
  getInitials,
  titleEffectClass,
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

  // ✅ si tu passes l’URL d’avatar depuis l’API
  avatarUrl?: string | null;

  cosmetics?: ChatCosmetics | null;
};

export function ChatMessageBubble({
  msg,
  streamerAppearance,
}: {
  msg: ChatMsgLike;
  streamerAppearance: StreamerAppearance;
}) {
  const c = msg.cosmetics ?? null;
  const lvl = (streamerAppearance?.chat?.viewerSkinsLevel ?? 1) as 1 | 2 | 3;

  const avatar = c?.avatar ?? {};
  const badges = Array.isArray(c?.badges) ? c!.badges! : [];
  const title = c?.title ?? null;
  const frame = c?.frame ?? null;

  const unameEffect = c?.username?.effect ?? "none";
  const skinUnameColor = c?.username?.color ?? null;

  // ✅ règles streamer:
  // lvl 1: viewers skinnés gardent leur skin, sinon fallback streamer
  // lvl 2: bloque couleurs pseudo (tout le monde = streamer)
  // lvl 3: bloque couleurs pseudo + cadrans
  const allowViewerNameColor = lvl < 2;
  const effectiveUnameColor = allowViewerNameColor ? skinUnameColor : null;

  // ✅ avatar image: on essaie plusieurs champs (tolérant)
  const avatarUrl =
    (msg as any)?.avatarUrl ??
    (c as any)?.avatarUrl ??
    (c as any)?.avatar?.url ??
    (c as any)?.avatar?.imageUrl ??
    null;

  const [imgErr, setImgErr] = React.useState(false);
  React.useEffect(() => setImgErr(false), [avatarUrl]);

  // ✅ hat: supporte "hat_carton_crown" ET "carton_crown"
  const hatIdNorm = avatar?.hatId ? String(avatar.hatId).replace(/^hat_/, "") : null;

  const hatEmoji =
    avatar.hatEmoji ||
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

  return (
    <div className={`chatMsgRow ${frameClass(frame?.frameId)}`}>
      <div className="chatMsgInner">
        {/* Avatar */}
        <div className={`chatAvatarBorder ${avatarBorderClass((avatar as any).borderId)}`}>
          {/* ✅ 1 seul "circle" → soit IMG soit initiales */}
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

          {/* Hat par-dessus */}
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
                  {badges.map((b) => (
                    <span key={b.id} className={`chatBadge badge--${b.tier || "silver"}`}>
                      {b.icon ? <span className="chatBadgeIcon">{b.icon}</span> : null}
                      {b.label}
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
          {title ? (
            <div className={`chatTitle ${titleTierClass((title as any).tier)} ${titleEffectClass((title as any).effect)}`}>
              « {(title as any).text} »
            </div>
          ) : null}

          {/* Body */}
          <div className="chatBodyText">{msg.body}</div>
        </div>
      </div>
    </div>
  );
}
