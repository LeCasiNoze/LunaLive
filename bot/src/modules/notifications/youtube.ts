// bot/src/modules/notifications/youtube.ts
import type { Pool } from "pg";
import type { BotEnv } from "../../env.js";
import { logEvent } from "../../log.js";
import { DISCORD_CONFIG, YOUTUBE_CHANNEL_ID, YOUTUBE_POLL_INTERVAL_MS } from "./config.js";

export interface YouTubeVideo {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  description: string;
}

export interface YouTubeNotifierConfig {
  pollIntervalMs?: number;
}

export class YouTubeNotifier {
  private timer: NodeJS.Timeout | null = null;
  private lastVideoId: string | null = null;

  constructor(
    private pool: Pool,
    private env: BotEnv,
    private config: YouTubeNotifierConfig = {}
  ) {
    // Utiliser les valeurs hardcodées par défaut
    this.config = {
      pollIntervalMs: config.pollIntervalMs || YOUTUBE_POLL_INTERVAL_MS,
    };
  }

  start() {
    if (this.timer) return;

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

  private async loadLastVideoId(): Promise<void> {
    try {
      const result = await this.pool.query(
        `SELECT video_id FROM youtube_notifications ORDER BY created_at DESC LIMIT 1`
      );
      
      if (result.rows.length > 0) {
        this.lastVideoId = result.rows[0].video_id;
        console.log("[bot] youtube loaded last video_id", this.lastVideoId);
      }
    } catch (e: any) {
      console.log("[bot] youtube failed to load last video_id", e?.message || e);
    }
  }

  private async saveVideoId(videoId: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO youtube_notifications (video_id, created_at) 
         VALUES ($1, NOW()) 
         ON CONFLICT (video_id) DO NOTHING`,
        [videoId]
      );
      this.lastVideoId = videoId;
    } catch (e: any) {
      console.log("[bot] youtube failed to save video_id", e?.message || e);
    }
  }

  private async poll(): Promise<void> {
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
        console.log("[bot] youtube new video detected", {
          id: latestVideo.id,
          title: latestVideo.title,
        });

        await this.notifyNewVideo(latestVideo);
        await this.saveVideoId(latestVideo.id);
      } else {
        console.log("[bot] youtube no new video (same as last)");
      }
    } catch (e: any) {
      console.log("[bot] youtube poll error", e?.message || e);
      
      try {
        await logEvent(this.pool, null, "error", "youtube poll error", {
          error: e?.message || String(e),
        });
      } catch {}
    }
  }

  private async fetchLatestVideos(): Promise<YouTubeVideo[]> {
    // Utiliser le flux RSS YouTube (pas besoin d'API key)
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
    
    try {
      const response = await fetch(rssUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();
      return this.parseYouTubeRSS(xml);
    } catch (e: any) {
      throw new Error(`Failed to fetch YouTube RSS: ${e?.message || e}`);
    }
  }

  private parseYouTubeRSS(xml: string): YouTubeVideo[] {
    // Parser simple du XML RSS YouTube
    const videos: YouTubeVideo[] = [];
    
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

  private cleanTitle(title: string): string {
    return title
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private cleanDescription(description: string): string {
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

  private extractLunaLiveLink(description: string): string | null {
    // Chercher un lien LunaLive dans la description
    const lunaLiveRegex = /https:\/\/lunalive\.onrender\.com\/s\/([a-zA-Z0-9_-]+)/g;
    const match = lunaLiveRegex.exec(description);
    return match ? match[0] : null;
  }

  private async notifyNewVideo(video: YouTubeVideo): Promise<void> {
    console.log("[bot] youtube notification process started for video:", video.id);
    
    const lunaLiveLink = this.extractLunaLiveLink(video.description);
    console.log("[bot] youtube lunaLive link found:", !!lunaLiveLink);
    
    // Construire le message Discord
    const message = [
      `<@&${DISCORD_CONFIG.GLOBAL_ROLE_ID}> <@&${DISCORD_CONFIG.YOUTUBE_ROLE_ID}>`,
      "",
      "🎬 Nouveau clip LunaLive vient de sortir !",
      `**${video.title}**`,
      `▶️ Regarder : <${video.url}>`,
    ];

    if (lunaLiveLink) {
      message.push(`📺 Retrouver le streamer : <${lunaLiveLink}>`);
    }

    const finalMessage = message.join("\n");
    console.log("[bot] youtube message prepared, length:", finalMessage.length);

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

    const url = `${base}/internal/bot/chat/send`; // Temporaire pour tester
    console.log("[bot] youtube sending to URL:", url);
    console.log("[bot] youtube full request config:", {
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-key": key.length > 8 ? `${key.slice(0, 3)}***${key.slice(-3)}` : '***'
      },
      bodyPreview: {
        channelId: DISCORD_CONFIG.YOUTUBE_CHANNEL_ID,
        content: finalMessage.substring(0, 50) + "..."
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
          streamerId: 1, // ID fictif pour tester
          body: finalMessage,
        }),
      });

      console.log("[bot] youtube API response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.log("[bot] youtube notification failed", response.status, errorText.slice(0, 300));
      } else {
        console.log("[bot] youtube notification sent successfully");
        
        try {
          await logEvent(this.pool, null, "info", "youtube notification sent", {
            videoId: video.id,
            title: video.title,
            hasLunaLiveLink: !!lunaLiveLink,
          });
        } catch {}
      }
    } catch (e: any) {
      console.log("[bot] youtube notification exception", e?.message || e);
    }
  }
}
