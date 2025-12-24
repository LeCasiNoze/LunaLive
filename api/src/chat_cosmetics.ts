// api/src/chat_cosmetics.ts
import { pool } from "./db.js";

// Shape attendu par web/src/components/chat/ChatMessageBubble.tsx
export type ChatCosmetics = {
  username?: { color?: string | null; effect?: string | null };
  frame?: { frameId?: string | null } | null;
  avatar?: { hatId?: string | null; hatEmoji?: string | null; borderId?: string | null };
  badges?: Array<{ id: string; label: string; tier?: string; icon?: string | null }>;
  title?: { text: string; tier?: string; effect?: string } | null;
};

function isUsernameEffectCode(code: string) {
  // adapte si tu as d’autres patterns
  return (
    code.startsWith("uanim_") ||
    code.includes("neon") ||
    code.includes("rainbow") ||
    code.includes("chroma") ||
    code.includes("underline") ||
    code.includes("toggle")
  );
}

export async function getChatCosmeticsForUsers(userIds: number[]) {
  const ids = Array.from(new Set((userIds || []).map((x) => Number(x)).filter((x) => x > 0)));
  const out = new Map<number, ChatCosmetics>();
  if (!ids.length) return out;

  const r = await pool.query(
    `SELECT user_id,
            username_code,
            badge_code,
            title_code,
            frame_code,
            hat_code
     FROM user_equipped_cosmetics
     WHERE user_id = ANY($1::int[])`,
    [ids]
  );

  for (const row of r.rows || []) {
    const userId = Number(row.user_id);
    const usernameCode = row.username_code ? String(row.username_code) : null;
    const badgeCode = row.badge_code ? String(row.badge_code) : null;
    const titleCode = row.title_code ? String(row.title_code) : null;
    const frameCode = row.frame_code ? String(row.frame_code) : null;
    const hatCode = row.hat_code ? String(row.hat_code) : null;

    const cosmetics: ChatCosmetics = {};

    // username: on ne peut stocker qu’un seul code dans ta table -> on le map soit en color soit en effect
    if (usernameCode && usernameCode !== "default") {
      cosmetics.username = isUsernameEffectCode(usernameCode)
        ? { effect: usernameCode, color: null }
        : { color: usernameCode, effect: null };
    }

    if (frameCode && frameCode !== "none") {
      cosmetics.frame = { frameId: frameCode };
    }

    if (hatCode && hatCode !== "none") {
      cosmetics.avatar = { hatId: hatCode };
    }

    if (badgeCode && badgeCode !== "none") {
      cosmetics.badges = [{ id: badgeCode, label: badgeCode, tier: "silver" }];
    }

    if (titleCode && titleCode !== "none") {
      cosmetics.title = { text: titleCode, tier: "silver", effect: "none" };
    }

    out.set(userId, cosmetics);
  }

  return out;
}
