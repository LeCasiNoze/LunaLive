// bot/src/modules/notifications/instagram.ts
import type { Pool } from "pg";
import type { BotEnv } from "../../env.js";
import { logEvent } from "../../log.js";
import { DISCORD_CONFIG, INSTAGRAM_USERNAME, INSTAGRAM_POLL_INTERVAL_MS } from "./config.js";

export interface InstagramReel {
  id: string;
  shortcode: string;
  url: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: Date;
}

export interface InstagramNotifierConfig {
  pollIntervalMs?: number;
  ignoreStartupHistory?: boolean; // Ignorer l'historique au premier démarrage (éviter le spam)
}

export class InstagramNotifier {
  private timer: NodeJS.Timeout | null = null;
  private lastReelId: string | null = null;
  private isPolling = false; // Protection contre les polls chevauchants

  constructor(
    private pool: Pool,
    private env: BotEnv,
    private config: InstagramNotifierConfig = {}
  ) {
    // Utiliser les valeurs hardcodées par défaut
    this.config = {
      pollIntervalMs: config.pollIntervalMs || INSTAGRAM_POLL_INTERVAL_MS,
      ignoreStartupHistory: config.ignoreStartupHistory ?? true, // Par défaut : ignorer l'historique au démarrage
    };
  }

  start() {
    if (this.timer) return;

    console.log("[bot] instagram notifier start", {
      username: INSTAGRAM_USERNAME,
      pollIntervalMs: this.config.pollIntervalMs,
    });

    // Charger le dernier Reel notifié
    this.loadLastReelId().then(() => {
      // Démarrer le polling
      this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs!);
      // Premier poll immédiat
      this.poll();
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[bot] instagram notifier stopped");
    }
  }

  private async loadLastReelId(): Promise<void> {
    try {
      const result = await this.pool.query(
        "SELECT video_id FROM instagram_notifications ORDER BY created_at DESC LIMIT 1"
      );
      this.lastReelId = result.rows[0]?.video_id || null;
      console.log("[bot] instagram loaded last reel_id", this.lastReelId);
    } catch (e: any) {
      console.log("[bot] instagram failed to load last reel_id", e?.message || e);
      this.lastReelId = null;
    }
  }

  private async saveReelId(reelId: string): Promise<void> {
    try {
      await this.pool.query(
        "INSERT INTO instagram_notifications (video_id) VALUES ($1) ON CONFLICT (video_id) DO NOTHING",
        [reelId]
      );
      this.lastReelId = reelId;
    } catch (e: any) {
      console.log("[bot] instagram failed to save reel_id", e?.message || e);
    }
  }

  private async poll(): Promise<void> {
    // Protection contre les polls chevauchants
    if (this.isPolling) {
      console.log("[bot] instagram poll skipped: already polling");
      return;
    }

    this.isPolling = true;
    
    try {
      console.log("[bot] instagram polling started...");
      const reels = await this.fetchLatestReels();
      console.log("[bot] instagram fetched reels count:", reels.length);
      
      if (!reels.length) {
        console.log("[bot] instagram no reels found");
        return;
      }

      // Prendre le Reel le plus récent
      const latestReel = reels[0];
      console.log("[bot] instagram latest reel:", {
        id: latestReel.id,
        title: latestReel.title,
        publishedAt: latestReel.publishedAt,
        lastReelId: this.lastReelId,
        idStability: latestReel.id === latestReel.shortcode ? "shortcode_stable" : "id_based"
      });

      // Validation de l'ID du Reel
      if (!latestReel.id || latestReel.id.length < 5) {
        console.log("[bot] instagram invalid reel ID, skipping:", latestReel.id);
        return;
      }

      // Vérifier si c'est un nouveau Reel
      if (latestReel.id !== this.lastReelId) {
        // Logique produit : ignorer l'historique au premier démarrage
        if (this.config.ignoreStartupHistory && !this.lastReelId) {
          console.log("[bot] instagram ignoring history on first startup", {
            reelId: latestReel.id,
            title: latestReel.title,
            reason: "first_startup_ignore_history"
          });
          // Sauvegarder ce Reel comme point de départ mais ne pas notifier
          await this.saveReelId(latestReel.id);
          return;
        }

        console.log("[bot] instagram new reel detected", {
          id: latestReel.id,
          title: latestReel.title,
          previousId: this.lastReelId
        });

        await this.notifyNewReel(latestReel);
        await this.saveReelId(latestReel.id);
      } else {
        console.log("[bot] instagram no new reel (same as last)");
      }
    } catch (e: any) {
      console.log("[bot] instagram poll error", e?.message || e);
      
      try {
        await logEvent(this.pool, null, "error", "instagram poll error", {
          error: e?.message || String(e),
        });
      } catch {}
    } finally {
      this.isPolling = false;
    }
  }

  private async fetchLatestReels(): Promise<InstagramReel[]> {
    // Méthode simple : scraping de la page publique Instagram
    const url = `https://www.instagram.com/${INSTAGRAM_USERNAME}/`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return this.parseInstagramPage(html);
    } catch (e: any) {
      throw new Error(`Failed to fetch Instagram page: ${e?.message || e}`);
    }
  }

  private parseInstagramPage(html: string): InstagramReel[] {
    const reels: InstagramReel[] = [];
    
    try {
      console.log("[bot] instagram parsing page HTML...");
      
      // Méthode 1: Essayer window._sharedData (peut encore fonctionner)
      const jsonMatch = html.match(/window\._sharedData\s*=\s*({.+?});/);
      if (jsonMatch) {
        console.log("[bot] instagram found sharedData, parsing...");
        try {
          const sharedData = JSON.parse(jsonMatch[1]);
          const reelsFromShared = this.parseSharedData(sharedData);
          if (reelsFromShared.length > 0) {
            console.log("[bot] instagram sharedData parsing successful:", reelsFromShared.length, "reels");
            return reelsFromShared;
          }
        } catch (e: any) {
          console.log("[bot] instagram sharedData parsing failed:", e?.message || (typeof e === 'string' ? e : 'unknown error'));
        }
      }

      // Méthode 2: Parser les données JSON inline dans le HTML
      const jsonInlineDataMatches = html.matchAll(/<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs);
      for (const match of jsonInlineDataMatches) {
        try {
          const jsonData = JSON.parse(match[1]);
          const reelsFromInline = this.extractReelsFromJsonData(jsonData);
          if (reelsFromInline.length > 0) {
            console.log("[bot] instagram inline JSON parsing successful:", reelsFromInline.length, "reels");
            return reelsFromInline;
          }
        } catch (e) {
          // Ignorer les erreurs de parsing inline
        }
      }

      // Méthode 3: Chercher les données directement dans le HTML (fallback)
      const reelsFromHtml = this.parseHtmlDirectly(html);
      if (reelsFromHtml.length > 0) {
        console.log("[bot] instagram direct HTML parsing successful:", reelsFromHtml.length, "reels");
        return reelsFromHtml;
      }

      console.log("[bot] instagram no reels found with any parsing method");
      return reels;
    } catch (e: any) {
      console.log("[bot] instagram parsing error:", e?.message || e);
      return reels;
    }
  }

  private parseSharedData(sharedData: any): InstagramReel[] {
    const reels: InstagramReel[] = [];
    
    try {
      const userData = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;
      if (!userData) {
        console.log("[bot] instagram no user data in sharedData");
        return reels;
      }

      const mediaEdges = userData?.edge_owner_to_timeline_media?.edges || [];
      
      for (const edge of mediaEdges) {
        const node = edge.node;
        
        if (node.__typename !== "GraphVideo" || !node.is_video) {
          continue;
        }

        const reel = this.createReelFromNode(node);
        if (reel) reels.push(reel);
      }
    } catch (e: any) {
      console.log("[bot] instagram sharedData processing error:", e?.message || e);
    }
    
    return reels;
  }

  private extractReelsFromJsonData(jsonData: any): InstagramReel[] {
    const reels: InstagramReel[] = [];
    
    try {
      // Chercher des structures de médias dans les données JSON
      if (jsonData?.data?.user?.edge_owner_to_timeline_media?.edges) {
        const edges = jsonData.data.user.edge_owner_to_timeline_media.edges;
        for (const edge of edges) {
          const node = edge.node;
          if (node.__typename === "GraphVideo" && node.is_video) {
            const reel = this.createReelFromNode(node);
            if (reel) reels.push(reel);
          }
        }
      }
    } catch (e: any) {
      console.log("[bot] instagram JSON data extraction error:", e?.message || e);
    }
    
    return reels;
  }

  private parseHtmlDirectly(html: string): InstagramReel[] {
    const reels: InstagramReel[] = [];
    
    try {
      // Chercher les URLs de Reels directement dans le HTML
      const reelUrlMatches = html.matchAll(/https:\/\/www\.instagram\.com\/reel\/([A-Za-z0-9_-]+)/g);
      
      for (const match of reelUrlMatches) {
        const shortcode = match[1];
        const url = match[0];
        
        // Extraire les informations contextuelles autour de l'URL
        const contextStart = Math.max(0, html.indexOf(match[0]) - 500);
        const contextEnd = Math.min(html.length, html.indexOf(match[0]) + 500);
        const context = html.substring(contextStart, contextEnd);
        
        // Essayer d'extraire une description ou titre
        let title = "Nouveau Reel LunaLive";
        let description = "";
        
        // Chercher du texte contextuel qui pourrait être une description
        const textMatch = context.match(/>([^<]{20,100})</);
        if (textMatch) {
          const potentialText = textMatch[1].trim();
          if (potentialText.length > 20 && !potentialText.includes('<') && !potentialText.includes('http')) {
            title = this.extractFirstLine(potentialText);
            description = potentialText;
          }
        }
        
        reels.push({
          id: shortcode,
          shortcode,
          url,
          title,
          description,
          thumbnail: "", // Pas accessible sans parsing JSON
          publishedAt: new Date(),
        });
      }
      
      console.log("[bot] instagram direct HTML found", reels.length, "reel URLs");
    } catch (e: any) {
      console.log("[bot] instagram direct HTML parsing error:", e?.message || e);
    }
    
    return reels;
  }

  private createReelFromNode(node: any): InstagramReel | null {
    try {
      const shortcode = node.shortcode || "";
      const id = node.id || shortcode;
      const title = node.edge_media_to_caption?.edges?.[0]?.node?.text || "Nouveau Reel LunaLive";
      const description = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
      const thumbnail = node.display_url || "";
      const takenAt = node.taken_at ? new Date(node.taken_at * 1000) : new Date();

      return {
        id,
        shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        title: this.extractFirstLine(title),
        description,
        thumbnail,
        publishedAt: takenAt,
      };
    } catch (e: any) {
      console.log("[bot] instagram error creating reel from node:", e?.message || e);
      return null;
    }
  }

  private extractFirstLine(text: string): string {
    const lines = text.split('\n');
    let firstLine = lines[0]?.trim() || "Nouveau Reel LunaLive";
    
    // Nettoyer les hashtags et mentions
    firstLine = firstLine.replace(/#[\w]+/g, '').replace(/@[\w]+/g, '').trim();
    
    // Limiter la longueur
    if (firstLine.length > 100) {
      firstLine = firstLine.substring(0, 97) + "...";
    }
    
    return firstLine || "Nouveau Reel LunaLive";
  }

  private extractLunaLiveLink(description: string): string | null {
    // Chercher un lien LunaLive dans la description
    const lunaLiveRegex = /https:\/\/lunalive\.onrender\.com\/s\/([a-zA-Z0-9_-]+)/g;
    const match = lunaLiveRegex.exec(description);
    return match ? match[0] : null;
  }

  private extractStreamerName(reel: InstagramReel, lunaLiveLink: string | null): string | null {
    // 1. Essayer d'extraire depuis le lien LunaLive
    if (lunaLiveLink) {
      const match = lunaLiveLink.match(/\/s\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }

    // 2. Essayer de parser depuis la description
    const descMatch = reel.description.match(/streamer[:\s]+([a-zA-Z0-9_-]+)/i);
    if (descMatch && descMatch[1]) {
      return descMatch[1];
    }

    // 3. Chercher des mots-clés communs
    const keywords = ["fabiozsis", "lecasinoze", "boubou", "lucas"];
    for (const keyword of keywords) {
      if (reel.description.toLowerCase().includes(keyword.toLowerCase())) {
        return keyword;
      }
    }

    return null;
  }

  private buildEmbedDescription(streamerName: string | null, lunaLiveLink: string | null): string {
    const lines = [
      "Un nouveau Reel LunaLive est disponible sur Instagram.",
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

  private truncateTitle(title: string, maxLength: number): string {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + "...";
  }

  private async notifyNewReel(reel: InstagramReel): Promise<void> {
    console.log("[bot] instagram notification process started for reel:", reel.id);
    
    const lunaLiveLink = this.extractLunaLiveLink(reel.description);
    const streamerName = this.extractStreamerName(reel, lunaLiveLink);
    
    console.log("[bot] instagram extracted data:", {
      lunaLiveLink: !!lunaLiveLink,
      streamerName: streamerName || 'not-found',
      hasDescription: !!reel.description,
      descriptionLength: reel.description.length,
      hasThumbnail: !!reel.thumbnail
    });

    // Validation du titre
    const finalTitle = this.truncateTitle(reel.title, 100);
    console.log("[bot] instagram title validation:", {
      originalTitle: reel.title,
      finalTitle,
      wasTruncated: finalTitle !== reel.title
    });

    // Construire l'embed premium
    const embed: any = {
      author: {
        name: "LunaLive • Nouveau Reel Instagram",
        icon_url: "https://lunalive.onrender.com/favicon.ico"
      },
      title: finalTitle,
      description: this.buildEmbedDescription(streamerName, lunaLiveLink),
      color: 0xE4405F, // Rose Instagram
      timestamp: reel.publishedAt.toISOString(),
      footer: {
        text: "LunaLive Clips",
        icon_url: "https://lunalive.onrender.com/favicon.ico"
      }
    };

    // Ajouter la miniature si disponible
    if (reel.thumbnail) {
      embed.image = {
        url: reel.thumbnail
      };
      console.log("[bot] instagram thumbnail added:", reel.thumbnail.substring(0, 100) + "...");
    } else {
      console.log("[bot] instagram no thumbnail available");
    }

    // Construire les boutons
    const buttons: any[] = [
      {
        type: 2, // BUTTON
        style: 5, // LINK
        label: "📸 Voir le Reel",
        url: reel.url
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
      console.log("[bot] instagram streamer button added for:", lunaLiveLink);
    } else {
      console.log("[bot] instagram no streamer button (no LunaLive link)");
    }

    // Validation des mentions de rôles
    const roleMentions = `<@&${DISCORD_CONFIG.GLOBAL_ROLE_ID}> <@&${DISCORD_CONFIG.INSTAGRAM_ROLE_ID}>`;
    console.log("[bot] instagram role mentions validation:", {
      globalRoleId: DISCORD_CONFIG.GLOBAL_ROLE_ID,
      instagramRoleId: DISCORD_CONFIG.INSTAGRAM_ROLE_ID,
      mentionsString: roleMentions
    });
    
    const payload: any = {
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

    console.log("[bot] instagram premium embed validation:", {
      hasAuthor: !!embed.author,
      hasTitle: !!embed.title,
      hasDescription: !!embed.description,
      hasColor: !!embed.color,
      hasTimestamp: !!embed.timestamp,
      hasFooter: !!embed.footer,
      hasImage: !!embed.image,
      buttonCount: buttons.length,
      descriptionLength: embed.description?.length || 0
    });

    // Envoyer via l'API interne
    const base = String(this.env.BOT_API_BASE || "").replace(/\/$/, "");
    const key = String(this.env.BOT_INTERNAL_KEY || "");
    
    console.log("[bot] instagram API config check:", {
      hasApiBase: !!base,
      hasInternalKey: !!key,
      apiBaseLength: base.length,
      keyLength: key.length
    });

    if (!base || !key) {
      console.log("[bot] instagram notification skipped: BOT_API_BASE or BOT_INTERNAL_KEY missing");
      return;
    }

    const url = `${base}/internal/bot/discord/send`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bot-key": key,
        },
        body: JSON.stringify({
          channelId: DISCORD_CONFIG.YOUTUBE_CHANNEL_ID, // Même salon que YouTube
          content: payload.content,
          embeds: payload.embeds,
          components: payload.components
        }),
      });

      console.log("[bot] instagram API response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.log("[bot] instagram notification failed", response.status, errorText.slice(0, 300));
      } else {
        console.log("[bot] instagram premium notification sent successfully");
        
        try {
          await logEvent(this.pool, null, "info", "instagram notification sent", {
            reelId: reel.id,
            title: reel.title,
            hasLunaLiveLink: !!lunaLiveLink,
            streamerName: streamerName || 'unknown',
            embedFormat: 'premium',
            buttonCount: buttons.length,
            hasThumbnail: !!reel.thumbnail
          });
        } catch {}
      }
    } catch (e: any) {
      console.log("[bot] instagram notification exception", e?.message || e);
    }
  }
}
