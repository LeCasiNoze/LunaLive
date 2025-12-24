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

  // optionnel (quand on branchera la DB)
  cosmetics?: ChatCosmetics | null;
};

export function ChatMessageBubble({ msg, streamerAppearance }: { msg: ChatMsgLike; streamerAppearance: StreamerAppearance }) {
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

  const hatEmoji = avatar.hatId === "luna_cap" ? (avatar.hatEmoji || "🧢") : null;

  return (
    <div className={`chatMsgRow ${frameClass(frame?.frameId)}`}>
      <div className="chatMsgInner">
        {/* Avatar */}
        <div className={`chatAvatarBorder ${avatarBorderClass(avatar.borderId)}`}>
          <div className="chatAvatarCircle">{getInitials(msg.username)}</div>
          {hatEmoji ? <div className="chatHatEmoji" aria-hidden="true">{hatEmoji}</div> : null}
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
            className={`chatUsername ${usernameEffectClass(unameEffect)}`}
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
            <div className={`chatTitle ${titleTierClass(title.tier)} ${titleEffectClass(title.effect)}`}>
              « {title.text} »
            </div>
          ) : null}

          {/* Body */}
          <div className="chatBodyText">{msg.body}</div>
        </div>
      </div>
    </div>
  );
}
