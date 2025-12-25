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

  // ✅ si tu passes l’URL d’avatar depuis l’API
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
  const titleInfo = normalizeTitle(c?.title ?? null);
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

          {/* ✅ Title UNDER username (no username animation, no titleEffectClass) */}
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

                // ✅ coupe net toute anim héritée / appliquée par erreur
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
          <div className="chatBodyText">{msg.body}</div>
        </div>
      </div>
    </div>
  );
}
