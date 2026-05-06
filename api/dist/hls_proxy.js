import { Readable } from "stream";
import { pipeline } from "stream/promises";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
function isIOSUA(ua) {
    const s = (ua || "").toLowerCase();
    // iPhone/iPad/iPod + iPadOS qui se présente comme Mac
    const isi = /iphone|ipad|ipod/.test(s);
    const isIpadOs = /macintosh/.test(s) && /mobile/.test(s);
    return isi || isIpadOs;
}
function isDliveHost(host) {
    const h = host.toLowerCase();
    return h.endsWith("dlive.tv") || h.endsWith("dlivecdn.com") || h === "live.prd.dlive.tv";
}
function hostMatches(host, pattern) {
    const h = host.toLowerCase();
    const p = pattern.toLowerCase().trim();
    if (!p)
        return false;
    if (p.startsWith("*."))
        return h === p.slice(2) || h.endsWith(p.slice(1));
    return h === p;
}
const DEFAULT_ALLOWED = [
    // DLive
    "live.prd.dlive.tv", "*.dlive.tv", "*.dlivecdn.com", "dlivecdn.com",
    // Rumble CDN
    "*.rumble.cloud", "rumble.cloud",
    "*.rumble.com", "rumble.com",
    "1a-1791.com", "*.1a-1791.com", // CDN réel Rumble (segments HLS)
];
function isAllowedHost(host) {
    const extra = String(process.env.HLS_PROXY_ALLOW_HOSTS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const patterns = [...DEFAULT_ALLOWED, ...extra];
    return patterns.some((p) => hostMatches(host, p));
}
function proxyUrl(u) {
    return `/hls?u=${encodeURIComponent(u)}`;
}
function rewriteM3u8(text, base) {
    const lines = text.split("\n");
    return lines
        .map((line) => {
        const s = line.trim();
        if (!s)
            return line;
        // rewrite URI="..." inside tags
        if (s.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
                const abs = new URL(uri, base).toString();
                return `URI="${proxyUrl(abs)}"`;
            });
        }
        // rewrite segment / child playlist lines
        const abs = new URL(s, base).toString();
        // Tout passe par le proxy — y compris les segments 1a-1791.com
        // (nécessaire pour injecter les headers Rumble et éviter DEMUXER_ERROR)
        return proxyUrl(abs);
    })
        .join("\n");
}
/**
 * CORS: évite le wildcard sur Allow-Headers (pas fiable partout),
 * et cache le preflight pour éviter la tempête d'OPTIONS (souvent déclenchée par Range).
 */
function setCors(req, res) {
    const acrh = String(req.headers["access-control-request-headers"] || "").trim();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    // IMPORTANT: mieux que "*" => écho des headers demandés (Range, etc.)
    res.setHeader("Access-Control-Allow-Headers", acrh || "range,content-type,accept,origin,user-agent");
    // Cache du preflight
    res.setHeader("Access-Control-Max-Age", "86400");
    // Expose utile pour hls.js / debug
    res.setHeader("Access-Control-Expose-Headers", "content-type,content-length,accept-ranges,content-range,cache-control,etag,last-modified");
    // évite des soucis de caches/proxies en présence de preflight
    res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
}
function isPlaylist(target, contentType) {
    const ct = (contentType || "").toLowerCase();
    return (ct.includes("application/vnd.apple.mpegurl") ||
        ct.includes("application/x-mpegurl") ||
        target.pathname.toLowerCase().endsWith(".m3u8"));
}
export function registerHlsProxy(app) {
    app.options("/hls", (req, res) => {
        setCors(req, res);
        return res.status(204).end();
    });
    // Optionnel mais pratique
    app.head("/hls", (req, res) => {
        setCors(req, res);
        return res.status(204).end();
    });
    app.get("/hls", async (req, res) => {
        setCors(req, res);
        const raw = String(req.query.u || "");
        if (!raw)
            return res.status(400).send("missing_u");
        let target;
        try {
            target = new URL(raw);
        }
        catch {
            return res.status(400).send("bad_url");
        }
        if (target.protocol !== "https:")
            return res.status(400).send("bad_protocol");
        if (!isAllowedHost(target.hostname))
            return res.status(400).send("host_not_allowed");
        // iOS + Dlive: user-agent desktop pour éviter certains comportements
        const uaIn = String(req.headers["user-agent"] || "Mozilla/5.0");
        const ua = isIOSUA(uaIn) && isDliveHost(target.hostname) ? DESKTOP_UA : uaIn;
        const isRumble = target.hostname.includes("rumble") || target.hostname.includes("1a-1791.com");
        const headers = {
            accept: String(req.headers.accept || "*/*"),
            "user-agent": ua,
            referer: isRumble ? "https://rumble.com/" : "https://dlive.tv/",
            origin: isRumble ? "https://rumble.com" : "https://dlive.tv",
        };
        // Range passthrough uniquement pour les segments binaires — jamais pour les playlists .m3u8
        // (un Range sur une playlist donne un 206 partiel → M3U8 tronqué → parse fail hls.js)
        // Rumble VOD: les sous-chunklists sont servies via `*.tar?r_file=chunklist.m3u8&r_type=application/vnd.apple.mpegurl`.
        // Le pathname finit par `.tar` mais c'est en fait une playlist — il faut détecter via la query.
        const search = target.search.toLowerCase();
        const isPlaylistUrl = target.pathname.toLowerCase().endsWith(".m3u8") ||
            /r_file=[^&]*\.m3u8/.test(search) ||
            /r_type=application%2fvnd\.apple\.mpegurl/.test(search);
        const range = req.headers.range ? String(req.headers.range) : "";
        if (range && !isPlaylistUrl)
            headers.range = range;
        // Abort upstream si le client coupe (évite congestion + stalls)
        const ac = new AbortController();
        const onClose = () => {
            try {
                ac.abort();
            }
            catch {
                // ignore
            }
        };
        req.on("close", onClose);
        req.on("aborted", onClose);
        let upstream;
        try {
            upstream = await fetch(target.toString(), {
                headers,
                redirect: "follow",
                signal: ac.signal,
            });
        }
        catch {
            // client a coupé ou upstream down
            if (!res.headersSent)
                return res.status(502).send("upstream_fetch_failed");
            return;
        }
        res.status(upstream.status);
        res.setHeader("x-hls-proxy-upstream", target.hostname);
        const ct = upstream.headers.get("content-type") || "";
        if (ct)
            res.setHeader("content-type", ct);
        const playlist = isPlaylist(target, ct);
        if (playlist) {
            // En live: la playlist doit être fraîche => pas de cache
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
            const text = await upstream.text();
            const rewritten = rewriteM3u8(text, target);
            return res.send(rewritten);
        }
        // Segments TS / audio:
        // Sur du live: éviter immutable/max-age long, et surtout éviter les caches bizarres avec Range/206.
        res.setHeader("Cache-Control", "no-store");
        // Passe quelques headers utiles
        for (const k of ["content-length", "accept-ranges", "content-range", "etag", "last-modified"]) {
            const v = upstream.headers.get(k);
            if (v)
                res.setHeader(k, v);
        }
        if (!upstream.body)
            return res.status(502).end();
        // Flush tôt (utile en prod avec proxies)
        res.flushHeaders?.();
        try {
            const nodeStream = Readable.fromWeb(upstream.body);
            await pipeline(nodeStream, res);
        }
        catch {
            // Client coupé / abort / pipeline interrompue => normal
            try {
                res.end();
            }
            catch {
                // ignore
            }
        }
    });
}
