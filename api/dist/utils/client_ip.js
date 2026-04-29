/**
 * Retourne la vraie IP du client.
 *
 * Pourquoi ce helper plutôt que `req.ip` :
 * - LunaLive est derrière Cloudflare puis Render. `trust proxy 1` côté Express
 *   ne dépile QUE le dernier hop (Render). Donc `req.ip` retourne l'IP de
 *   l'edge Cloudflare (ex: 172.71.x.x), pas celle de l'utilisateur.
 * - Cloudflare met toujours l'IP réelle dans le header `cf-connecting-ip`.
 *
 * Ordre de priorité :
 *   1. `cf-connecting-ip` (Cloudflare authoritative — toujours présent quand on
 *      passe par CF, même via WS/HTTP/2)
 *   2. `true-client-ip` (autre standard CF Enterprise)
 *   3. `x-forwarded-for` premier IP non-privé (fallback générique)
 *   4. `req.ip` (dernier recours, IP du proxy le plus proche)
 */
export function getClientIp(req) {
    const cfIp = String(req.headers["cf-connecting-ip"] || "").trim();
    if (cfIp)
        return cfIp;
    const trueIp = String(req.headers["true-client-ip"] || "").trim();
    if (trueIp)
        return trueIp;
    const xff = String(req.headers["x-forwarded-for"] || "").trim();
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first)
            return first;
    }
    return req.ip || null;
}
