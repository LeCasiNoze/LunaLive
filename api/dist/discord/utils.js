// api/src/discord/utils.ts
import crypto from "crypto";
export function maskSecret(v) {
    const s = String(v ?? "").trim();
    if (!s)
        return "(missing)";
    if (s.length <= 6)
        return `*** (len=${s.length})`;
    return `${s.slice(0, 2)}***${s.slice(-2)} (len=${s.length})`;
}
export function getLinkCodeSecret(ctx) {
    const raw = process.env.DISCORD_LINK_CODE_SECRET;
    const s = String(raw ?? "").trim();
    if (!s) {
        ctx?.log?.(`[discord] DISCORD_LINK_CODE_SECRET=${maskSecret(raw)} | DISCORD_* keys=` +
            Object.keys(process.env)
                .filter((k) => k.startsWith("DISCORD_"))
                .sort()
                .join(","));
        throw new Error("DISCORD_LINK_CODE_SECRET missing");
    }
    return s;
}
export function hashCode(code, ctx) {
    const secret = getLinkCodeSecret(ctx);
    return crypto.createHash("sha256").update(`${code}::${secret}`).digest("hex");
}
export function codeAlphabet() {
    return "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
}
export function genCode(len = 6) {
    const A = codeAlphabet();
    const b = crypto.randomBytes(len);
    let s = "";
    for (let i = 0; i < len; i++)
        s += A[b[i] % A.length];
    return `LL-${s}`;
}
export function getTtlMin() {
    const n = Number(process.env.DISCORD_LINK_CODE_TTL_MIN || 12);
    return Number.isFinite(n) ? Math.max(5, Math.min(30, n)) : 12;
}
export function maskEmail(email) {
    if (!email)
        return null;
    const e = String(email);
    const at = e.indexOf("@");
    if (at <= 1)
        return "***";
    const name = e.slice(0, at);
    const dom = e.slice(at + 1);
    return `${name[0]}***@${dom}`;
}
export async function safeDm(client, userId, content, ctx) {
    if (!client)
        return;
    try {
        const u = await client.users.fetch(userId);
        await u.send(content);
    }
    catch (e) {
        ctx.log(`[discord] dm failed to ${userId}: ${e?.message || e}`);
    }
}
export function normalizeAccept(v) {
    return String(v || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}
