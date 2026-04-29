import { getClientIp } from "./client_ip.js";
/**
 * Vérifie un token Cloudflare Turnstile via l'endpoint siteverify.
 *
 * - Si TURNSTILE_SECRET_KEY n'est pas défini, retourne `true` (mode dev / pas
 *   encore configuré). Active la vraie vérif quand tu as posé la clé sur Render.
 * - Retourne false si le token est manquant ou rejeté par Cloudflare.
 */
export async function verifyTurnstile(req, token) {
    const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
    if (!secret) {
        // Pas configuré → on laisse passer (équivalent à "désactivé").
        return true;
    }
    const t = String(token || "").trim();
    if (!t)
        return false;
    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", t);
    const ip = getClientIp(req);
    if (ip)
        params.set("remoteip", ip);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            body: params,
            signal: controller.signal,
        });
        if (!r.ok)
            return false;
        const data = await r.json().catch(() => null);
        return !!data?.success;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}
