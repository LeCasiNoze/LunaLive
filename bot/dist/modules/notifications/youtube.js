import { logEvent } from "../../log.js";
import { DISCORD_CONFIG, YOUTUBE_CHANNEL_ID, YOUTUBE_POLL_INTERVAL_MS } from "./config.js";
export class YouTubeNotifier {
    pool;
    env;
    config;
    timer = null;
    lastVideoId = null;
    constructor(pool, env, config = {}) {
        this.pool = pool;
        this.env = env;
        this.config = config;
        // Utiliser les valeurs hardcodées par défaut
        this.config = {
            pollIntervalMs: config.pollIntervalMs || YOUTUBE_POLL_INTERVAL_MS,
        };
    }
    start() {
        if (this.timer)
            return;
        console.log("[bot] youtube notifier start", {
            channelId: YOUTUBE_CHANNEL_ID,
            pollIntervalMs: this.config.pollIntervalMs,
        });
        // Charger le dernier ID connu depuis la BDD
        this.loadLastVideoId().then(() => {
            this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
            void this.poll(); // Premier poll immédiat
        });
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async loadLastVideoId() {
        try {
            const result = await this.pool.query(`SELECT video_id FROM youtube_notifications ORDER BY created_at DESC LIMIT 1`);
            if (result.rows.length > 0) {
                this.lastVideoId = result.rows[0].video_id;
                console.log("[bot] youtube loaded last video_id", this.lastVideoId);
            }
        }
        catch (e) {
            console.log("[bot] youtube failed to load last video_id", e?.message || e);
        }
    }
    async saveVideoId(videoId) {
        try {
            await this.pool.query(`INSERT INTO youtube_notifications (video_id, created_at) 
         VALUES ($1, NOW()) 
         ON CONFLICT (video_id) DO NOTHING`, [videoId]);
            this.lastVideoId = videoId;
        }
        catch (e) {
            console.log("[bot] youtube failed to save video_id", e?.message || e);
        }
    }
    async poll() {
        try {
            console.log("[bot] youtube polling started...");
            const videos = await this.fetchLatestVideos();
            console.log("[bot] youtube fetched videos count:", videos.length);
            if (!videos.length) {
                console.log("[bot] youtube no videos found");
                return;
            }
            // Prendre la vidéo la plus récente
            const latestVideo = videos[0];
            console.log("[bot] youtube latest video:", {
                id: latestVideo.id,
                title: latestVideo.title,
                publishedAt: latestVideo.publishedAt,
                lastVideoId: this.lastVideoId
            });
            // Vérifier si c'est une nouvelle vidéo
            if (latestVideo.id !== this.lastVideoId) {
                // Mode pipeline : ignorer les vidéos très récentes
                if (this.config.ignoreRecentHours && this.config.ignoreRecentHours > 0) {
                    const hoursSincePublished = (Date.now() - latestVideo.publishedAt.getTime()) / (1000 * 60 * 60);
                    if (hoursSincePublished < this.config.ignoreRecentHours) {
                        console.log("[bot] youtube ignoring recent video (pipeline mode)", {
                            id: latestVideo.id,
                            title: latestVideo.title,
                            hoursSincePublished: Math.round(hoursSincePublished * 100) / 100,
                            ignoreHours: this.config.ignoreRecentHours
                        });
                        return;
                    }
                }
                console.log("[bot] youtube new video detected", {
                    id: latestVideo.id,
                    title: latestVideo.title,
                });
                await this.notifyNewVideo(latestVideo);
                await this.saveVideoId(latestVideo.id);
            }
            else {
                console.log("[bot] youtube no new video (same as last)");
            }
        }
        catch (e) {
            console.log("[bot] youtube poll error", e?.message || e);
            try {
                await logEvent(this.pool, null, "error", "youtube poll error", {
                    error: e?.message || String(e),
                });
            }
            catch { }
        }
    }
    async fetchLatestVideos() {
        // Utiliser le flux RSS YouTube (pas besoin d'API key)
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
        try {
            const response = await fetch(rssUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const xml = await response.text();
            return this.parseYouTubeRSS(xml);
        }
        catch (e) {
            throw new Error(`Failed to fetch YouTube RSS: ${e?.message || e}`);
        }
    }
    parseYouTubeRSS(xml) {
        // Parser simple du XML RSS YouTube
        const videos = [];
        // Extraction des entrées <entry>
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(xml)) !== null) {
            const entry = match[1];
            // Corriger les regex pour correspondre au vrai format YouTube
            const idMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
            const titleMatch = entry.match(/<title>(.*?)<\/title>/);
            const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
            const descriptionMatch = entry.match(/<media:description>(.*?)<\/media:description>/);
            if (idMatch && titleMatch && publishedMatch) {
                videos.push({
                    id: idMatch[1].trim(),
                    title: this.cleanTitle(titleMatch[1]),
                    url: `https://www.youtube.com/watch?v=${idMatch[1].trim()}`,
                    publishedAt: new Date(publishedMatch[1]),
                    description: descriptionMatch ? this.cleanDescription(descriptionMatch[1]) : "",
                });
            }
        }
        // Trier par date de publication (plus récent en premier)
        return videos.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    }
    cleanTitle(title) {
        return title
            .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }
    cleanDescription(description) {
        return description
            .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\\n/g, "\n")
            .trim();
    }
    extractLunaLiveLink(description) {
        // Chercher un lien LunaLive dans la description
        const lunaLiveRegex = /https:\/\/lunalive\.onrender\.com\/s\/([a-zA-Z0-9_-]+)/g;
        const match = lunaLiveRegex.exec(description);
        return match ? match[0] : null;
    }
    async notifyNewVideo(video) {
        console.log("[bot] youtube notification process started for video:", video.id);
        const lunaLiveLink = this.extractLunaLiveLink(video.description);
        const streamerName = this.extractStreamerName(video, lunaLiveLink);
        console.log("[bot] youtube extracted data:", {
            lunaLiveLink: !!lunaLiveLink,
            streamerName: streamerName || 'not-found'
        });
        // Construire l'embed premium
        const embed = {
            author: {
                name: "LunaLive • Nouveau clip",
                icon_url: "https://lunalive.win/favicon.ico" // Fallback si disponible
            },
            title: this.truncateTitle(video.title, 100), // Tronquer si trop long
            description: this.buildEmbedDescription(streamerName, lunaLiveLink),
            color: 0x5865F2, // Couleur Discord bleue
            timestamp: video.publishedAt.toISOString(),
            footer: {
                text: "LunaLive Clips",
                icon_url: "https://lunalive.win/favicon.ico"
            }
        };
        // Ajouter la miniature YouTube comme image principale
        if (video.id) {
            embed.image = {
                url: `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`
            };
        }
        // Construire les boutons
        const buttons = [
            {
                type: 2, // BUTTON
                style: 5, // LINK
                label: "▶ Regarder le clip",
                url: video.url
            }
        ];
        // Ajouter le bouton streamer seulement si lien LunaLive trouvé
        if (lunaLiveLink) {
            buttons.push({
                type: 2, // BUTTON
                style: 5, // LINK
                label: "📺 Voir le streamer",
                url: lunaLiveLink
            });
        }
        // Construire le message Discord avec mentions de rôles
        const roleMentions = `<@&${DISCORD_CONFIG.GLOBAL_ROLE_ID}> <@&${DISCORD_CONFIG.YOUTUBE_ROLE_ID}>`;
        const payload = {
            content: roleMentions,
            embeds: [embed]
        };
        // Ajouter les boutons seulement si présents
        if (buttons.length > 0) {
            payload.components = [
                {
                    type: 1, // ACTION_ROW
                    components: buttons
                }
            ];
        }
        console.log("[bot] youtube premium embed prepared:", {
            title: embed.title,
            hasImage: !!embed.image,
            buttonCount: buttons.length,
            descriptionLength: embed.description?.length || 0
        });
        // Envoyer via l'API interne
        const base = String(this.env.BOT_API_BASE || "").replace(/\/$/, "");
        const key = String(this.env.BOT_INTERNAL_KEY || "");
        console.log("[bot] youtube API config check:", {
            hasApiBase: !!base,
            hasInternalKey: !!key,
            apiBaseLength: base.length,
            keyLength: key.length,
            keyPrefix: key.length > 8 ? `${key.slice(0, 3)}***${key.slice(-3)}` : '***',
            fullKey: key.length > 0 ? `[${key.length} chars]` : 'EMPTY'
        });
        if (!base || !key) {
            console.log("[bot] youtube notification skipped: BOT_API_BASE or BOT_INTERNAL_KEY missing");
            return;
        }
        const url = `${base}/internal/bot/discord/send`;
        console.log("[bot] youtube sending to URL:", url);
        console.log("[bot] youtube full request config:", {
            url,
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-bot-key": key.length > 8 ? `${key.slice(0, 3)}***${key.slice(-3)}` : '***'
            },
            bodyPreview: {
                hasContent: !!payload.content,
                hasEmbeds: payload.embeds?.length || 0,
                hasComponents: payload.components?.length || 0
            }
        });
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-bot-key": key,
                },
                body: JSON.stringify({
                    channelId: DISCORD_CONFIG.YOUTUBE_CHANNEL_ID,
                    content: payload.content,
                    embeds: payload.embeds,
                    components: payload.components
                }),
            });
            console.log("[bot] youtube API response status:", response.status);
            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                console.log("[bot] youtube notification failed", response.status, errorText.slice(0, 300));
            }
            else {
                console.log("[bot] youtube premium notification sent successfully");
                try {
                    await logEvent(this.pool, null, "info", "youtube notification sent", {
                        videoId: video.id,
                        title: video.title,
                        hasLunaLiveLink: !!lunaLiveLink,
                        streamerName: streamerName || 'unknown',
                        embedFormat: 'premium'
                    });
                }
                catch { }
            }
        }
        catch (e) {
            console.log("[bot] youtube notification exception", e?.message || e);
        }
    }
    buildEmbedDescription(streamerName, lunaLiveLink) {
        const lines = [
            "Un nouveau clip LunaLive est disponible sur YouTube.",
            "",
        ];
        if (streamerName) {
            lines.push(`👤 **Streamer** : ${streamerName}`);
        }
        if (lunaLiveLink) {
            lines.push(`📺 **LunaLive** : <${lunaLiveLink}>`);
        }
        return lines.join("\n");
    }
    truncateTitle(title, maxLength) {
        if (title.length <= maxLength)
            return title;
        return title.substring(0, maxLength - 3) + "...";
    }
    extractStreamerName(video, lunaLiveLink) {
        // 1. Essayer d'extraire depuis le lien LunaLive
        if (lunaLiveLink) {
            const match = lunaLiveLink.match(/\/s\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                return match[1];
            }
        }
        // 2. Essayer de parser depuis le titre (format: "🎰 x 1000 · Fabiozsis | LunaLive")
        const titleMatch = video.title.match(/[\u2022·]\s*([a-zA-Z0-9_-]+)\s*(?:\||$)/);
        if (titleMatch && titleMatch[1]) {
            return titleMatch[1];
        }
        // 3. Essayer un pattern plus simple (nom avant "|")
        const simpleMatch = video.title.match(/^([^\|]+?)\s*\|/);
        if (simpleMatch && simpleMatch[1]) {
            const name = simpleMatch[1].trim();
            // Nettoyer les emojis et symboles
            const cleanName = name.replace(/[^\w\s-]/g, '').trim();
            if (cleanName.length > 0 && cleanName.length < 30) {
                return cleanName;
            }
        }
        return null;
    }
}
