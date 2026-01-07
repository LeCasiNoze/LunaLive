// api/src/chat_cosmetics.ts
import { pool } from "./db.js";
function uniqInts(arr) {
    const out = [];
    const seen = new Set();
    for (const v of arr || []) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0)
            continue;
        if (seen.has(n))
            continue;
        seen.add(n);
        out.push(n);
    }
    return out;
}
function clampBadgeText(s) {
    const t = String(s || "").trim().replace(/[^\w\-]/g, "");
    return (t || "SUB").slice(0, 8).toUpperCase();
}
function prettyBadgeLabel(code) {
    if (!code)
        return code;
    if (code === "badge_luna")
        return "LUNA";
    if (code === "badge_777")
        return "777";
    if (code.startsWith("badge_"))
        return code.slice("badge_".length).toUpperCase();
    return code;
}
// username effect mapping (important : front attend des IDs courts)
function mapUsernameEffect(code) {
    if (!code)
        return null;
    const c = String(code).trim();
    if (!c || c === "default" || c === "none")
        return null;
    const map = {
        uanim_chroma_toggle: "chroma",
        uanim_gold_toggle: "gold",
        uanim_rainbow_scroll: "rainbow_scroll",
        uanim_neon_underline: "neon_underline",
    };
    return map[c] ?? c; // fallback: si t’as déjà des ids "rainbow_scroll" etc
}
function isProbablyHexColor(s) {
    return /^#?[0-9a-fA-F]{6}$/.test(String(s || "").trim());
}
function frameIdFromCode(code) {
    return String(code || "")
        .trim()
        .replace(/^m?frame_/, "")
        .replace(/_(shop|event|master)$/, "");
}
function mapHat(code) {
    if (!code)
        return null;
    const c = String(code).trim();
    if (!c || c === "none")
        return null;
    const map = {
        hat_luna_cap: "luna_cap",
        hat_carton_crown: "carton_crown",
        hat_demon_horn: "demon_horn",
        hat_eclipse_halo: "eclipse_halo",
        hat_astral_helmet: "astral_helmet",
        hat_lotus_aureole: "lotus_aureole",
    };
    const hatId = map[c] ?? c.replace(/^hat_/, "");
    const EMOJI = {
        luna_cap: "🧢",
        carton_crown: "👑",
        demon_horn: "😈",
        eclipse_halo: "⭕",
        astral_helmet: "🪖",
        lotus_aureole: "🪷",
    };
    return { hatId, hatEmoji: EMOJI[hatId] ?? "🧢" };
}
// BASE public pour construire l’URL avatar
const PUBLIC_API_BASE = String(process.env.PUBLIC_API_BASE ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://lunalive-api.onrender.com").replace(/\/$/, "");
function buildSubBadge(code, info) {
    const ap = info.appearance || {};
    const b = ap?.chat?.sub?.badge || {};
    if (b.enabled === false)
        return null;
    const label = clampBadgeText(b.text);
    const borderColor = String(b.borderColor || "#7C4DFF");
    const textColor = String(b.textColor || "#FFFFFF");
    return {
        id: `sub:${info.slugLower}`,
        label,
        tier: "silver",
        borderColor,
        textColor,
        backgroundColor: "transparent",
        meta: {
            kind: "sub_badge",
            code,
            streamerSlug: info.slug,
            streamerName: info.displayName,
        },
    };
}
export async function getChatCosmeticsForUsers(userIds) {
    const ids = uniqInts(userIds);
    const out = new Map();
    if (!ids.length)
        return out;
    // ✅ join user_avatars pour cache-bust
    const r = await pool.query(`SELECT
        ue.user_id,
        ue.username_code,
        ue.badge_code,
        ue.title_code,
        ue.frame_code,
        ue.hat_code,
        ua.updated_at AS avatar_updated_at
     FROM user_equipped_cosmetics ue
     LEFT JOIN user_avatars ua ON ua.user_id = ue.user_id
     WHERE ue.user_id = ANY($1::int[])`, [ids]);
    // 1) collect needed SUB badges
    const needSubs = [];
    const needSlugSet = new Set();
    for (const row of r.rows || []) {
        const userId = Number(row.user_id);
        const badgeCode = row.badge_code ? String(row.badge_code) : null;
        if (badgeCode && badgeCode.startsWith("badge_sub_")) {
            const slug = badgeCode.slice("badge_sub_".length).trim();
            if (!slug)
                continue;
            const slugLower = slug.toLowerCase();
            needSubs.push({ userId, slugLower, code: badgeCode });
            needSlugSet.add(slugLower);
        }
    }
    // 2) bulk fetch active subs + streamer appearance
    const subsByUser = new Map();
    if (needSubs.length) {
        const slugs = Array.from(needSlugSet);
        const sr = await pool.query(`SELECT
         ss.user_id AS user_id,
         lower(s.slug) AS slug_lower,
         s.slug AS slug,
         COALESCE(s.display_name, s.slug) AS display_name,
         s.appearance AS appearance
       FROM streamer_subscriptions ss
       JOIN streamers s ON s.id = ss.streamer_id
       WHERE ss.user_id = ANY($1::int[])
         AND ss.expires_at > NOW()
         AND lower(s.slug) = ANY($2::text[])`, [ids, slugs]);
        for (const row of sr.rows || []) {
            const userId = Number(row.user_id);
            const slugLower = String(row.slug_lower || "").toLowerCase();
            if (!slugLower)
                continue;
            if (!subsByUser.has(userId))
                subsByUser.set(userId, new Map());
            subsByUser.get(userId).set(slugLower, {
                slugLower,
                slug: String(row.slug || ""),
                displayName: String(row.display_name || row.slug || ""),
                appearance: row.appearance || {},
            });
        }
    }
    // 3) build cosmetics
    for (const row of r.rows || []) {
        const userId = Number(row.user_id);
        const usernameCode = row.username_code ? String(row.username_code) : null;
        const badgeCode = row.badge_code ? String(row.badge_code) : null;
        const titleCode = row.title_code ? String(row.title_code) : null;
        const frameCode = row.frame_code ? String(row.frame_code) : null;
        const hatCode = row.hat_code ? String(row.hat_code) : null;
        const cosmetics = {};
        // username
        if (usernameCode && usernameCode !== "default") {
            const eff = mapUsernameEffect(usernameCode);
            if (eff && !isProbablyHexColor(usernameCode)) {
                cosmetics.username = { effect: eff, color: null };
            }
            else {
                // si tu stockes une couleur "#RRGGBB" dans username_code
                const c = usernameCode.startsWith("#") ? usernameCode : `#${usernameCode}`;
                cosmetics.username = { color: c, effect: null };
            }
        }
        // frame
        if (frameCode && frameCode !== "none") {
            cosmetics.frame = { frameId: frameIdFromCode(frameCode) };
        }
        // hat
        const hat = mapHat(hatCode);
        if (hat) {
            cosmetics.avatar = cosmetics.avatar || {};
            cosmetics.avatar.hatId = hat.hatId;
            cosmetics.avatar.hatEmoji = hat.hatEmoji;
        }
        // avatar url
        if (row.avatar_updated_at) {
            const v = new Date(row.avatar_updated_at).getTime();
            cosmetics.avatar = cosmetics.avatar || {};
            cosmetics.avatar.url = `${PUBLIC_API_BASE}/avatars/u/${userId}?v=${v}`;
        }
        // badge
        if (badgeCode && badgeCode !== "none") {
            if (badgeCode.startsWith("badge_sub_")) {
                const slugLower = badgeCode.slice("badge_sub_".length).trim().toLowerCase();
                const info = slugLower ? subsByUser.get(userId)?.get(slugLower) : null;
                // ✅ si la sub est active -> badge custom ; sinon -> rien
                const b = info ? buildSubBadge(badgeCode, info) : null;
                if (b) {
                    const { id: _drop, ...bNoId } = b; // ✅ évite TS2783
                    cosmetics.badges = [{ ...bNoId, id: badgeCode }];
                }
                else {
                    cosmetics.badges = [];
                }
            }
            else {
                cosmetics.badges = [
                    {
                        id: badgeCode,
                        label: prettyBadgeLabel(badgeCode),
                        tier: "silver",
                    },
                ];
            }
        }
        // title
        if (titleCode && titleCode !== "none") {
            // ton ChatMessageBubble normalise aussi une string direct
            cosmetics.title = titleCode;
        }
        out.set(userId, cosmetics);
    }
    return out;
}
