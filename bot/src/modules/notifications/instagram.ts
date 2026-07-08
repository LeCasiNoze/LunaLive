// bot/src/modules/notifications/instagram.ts
import type { Pool } from "pg";

// Configuration Discord
const DISCORD_CONFIG = {
  YOUTUBE_CHANNEL_ID: "1467142269122383883",
  GLOBAL_ROLE_ID: "1468982992910155908",
  INSTAGRAM_ROLE_ID: "1468983120664723507",
};

// Configuration Instagram
const INSTAGRAM_USERNAME = "lunalive.tv";
const INSTAGRAM_POLL_INTERVAL_MS = 180000; // 3 minutes

// TEMP INSTAGRAM SESSION CONFIG - TO REPLACE LATER
const INSTAGRAM_SESSION = {
  cookie: "sessionid=YOUR_SESSION_ID; ig_cb=1; csrftoken=YOUR_CSRF_TOKEN; mid=YOUR_MID; ds_user_id=YOUR_USER_ID; shbid=YOUR_SHBID; shbts=YOUR_SHBTS; rur=YOUR_RUR",
  csrftoken: "YOUR_CSRF_TOKEN",
  lsd: "YOUR_LSD",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  targetUserId: "80302456225",
  appId: "936619743392459",
  asbdId: "359341",
  fbFriendlyName: "PolarisProfileReelsTabContentQuery",
  rootFieldName: "xdt_api__v1__clips__user__connection_v2"
};

export interface InstagramReel {
  id: string; // pk
  shortcode: string; // code
  url: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: Date;
  likes?: number;
  comments?: number;
}

export interface InstagramNotifierConfig {
  pollIntervalMs?: number;
  ignoreStartupHistory?: boolean; // Ignorer l'historique au premier démarrage (éviter le spam)
}

export class InstagramNotifier {
  private timer: NodeJS.Timeout | null = null;
  private lastReelId: string | null = null;
  private isPolling = false; // Protection contre les polls chevauchants
  private consecutiveHttpErrors = 0;
  private autoDisabled = false;

  constructor(
    private pool: Pool,
    private env: any,
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

    if (String(process.env.IG_NOTIFIER_DISABLED || "").trim() === "1") {
      console.log("[bot] instagram notifier disabled via IG_NOTIFIER_DISABLED=1");
      return;
    }

    console.log("[bot] instagram notifier start", {
      username: INSTAGRAM_USERNAME,
      pollIntervalMs: this.config.pollIntervalMs,
      method: "graphql"
    });

    this.loadLastReelId().then(() => {
      this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs!);
      this.poll(); // Premier poll immédiat
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
      console.log("[bot] instagram graphql fetch started");
      const reels = await this.fetchLatestReelsGraphQL();
      console.log("[bot] instagram graphql reels count found:", reels.length);
      
      if (!reels.length) {
        console.log("[bot] instagram no reels found");
        return;
      }

      // Prendre le Reel le plus récent
      const latestReel = reels[0];
      console.log("[bot] instagram latest reel code:", latestReel.shortcode, "pk:", latestReel.id);

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
            reelCode: latestReel.shortcode,
            reason: "first_startup_ignore_history"
          });
          // Sauvegarder ce Reel comme point de départ mais ne pas notifier
          await this.saveReelId(latestReel.id);
          return;
        }

        console.log("[bot] instagram new reel detected", {
          id: latestReel.id,
          code: latestReel.shortcode,
          previousId: this.lastReelId
        });

        await this.notifyNewReel(latestReel);
        await this.saveReelId(latestReel.id);
      } else {
        console.log("[bot] instagram no new reel (same as last)");
      }
    } catch (e: any) {
      console.log("[bot] instagram poll error", e?.message || e);
    } finally {
      this.isPolling = false;
    }
  }

  private async fetchLatestReelsGraphQL(): Promise<InstagramReel[]> {
    const url = "https://www.instagram.com/graphql/query";
    
    // Variables pour la requête GraphQL
    const variables = {
      data: {
        count: 12,
        include_feed_info: true,
        latest_best_reels: true,
        seen_ids: [],
        cursor: null
      },
      target_user_id: INSTAGRAM_SESSION.targetUserId,
      scale: 1
    };

    // Requête GraphQL pour les Reels
    const queryHash = "305b69e3d5a1e3b6c4f4c5c8f5a8d2e"; // Hash pour PolarisProfileReelsTabContentQuery
    
    const requestBody = {
      variables: JSON.stringify(variables),
      doc_id: queryHash
    };

    try {
      console.log("[bot] instagram graphql request prepared", {
        url,
        targetUserId: INSTAGRAM_SESSION.targetUserId,
        fbFriendlyName: INSTAGRAM_SESSION.fbFriendlyName,
        rootFieldName: INSTAGRAM_SESSION.rootFieldName
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": INSTAGRAM_SESSION.userAgent,
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": INSTAGRAM_SESSION.csrftoken,
          "X-ASBD-ID": INSTAGRAM_SESSION.asbdId,
          "X-FB-Friendly-Name": INSTAGRAM_SESSION.fbFriendlyName,
          "X-Root-Field-Name": INSTAGRAM_SESSION.rootFieldName,
          "X-App-ID": INSTAGRAM_SESSION.appId,
          "X-IG-App-ID": INSTAGRAM_SESSION.appId,
          "X-Requested-With": "XMLHttpRequest",
          "Referer": `https://www.instagram.com/${INSTAGRAM_USERNAME}/`,
          "Origin": "https://www.instagram.com",
          "Cookie": INSTAGRAM_SESSION.cookie,
          "X-Instagram-AJAX": "100",
          "X-IG-WWW-Claim": "0"
        },
        body: new URLSearchParams(requestBody).toString()
      });

      console.log("[bot] instagram graphql status:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        this.consecutiveHttpErrors++;
        // Auto-disable apres 10 erreurs consecutives (~30 min de spam) → session expiree
        if (this.consecutiveHttpErrors === 1 || this.consecutiveHttpErrors === 10) {
          console.log("[bot] instagram graphql HTTP error:", response.status, response.statusText, "consecutive=", this.consecutiveHttpErrors);
        }
        if (this.consecutiveHttpErrors >= 10 && !this.autoDisabled) {
          this.autoDisabled = true;
          console.warn("[bot] instagram notifier auto-disabled after 10 consecutive HTTP errors. Session likely expired. Refresh INSTAGRAM_SESSION and redeploy or set IG_NOTIFIER_DISABLED=1.");
          if (this.timer) { clearInterval(this.timer); this.timer = null; }
        }
        return [];
      }
      this.consecutiveHttpErrors = 0;

      const jsonResponse: any = await response.json();
      
      console.log("[bot] instagram graphql response analysis:", {
        hasData: !!jsonResponse.data,
        hasErrors: !!jsonResponse.errors,
        errorsCount: jsonResponse.errors?.length || 0,
        dataKeys: jsonResponse.data ? Object.keys(jsonResponse.data) : []
      });

      if (jsonResponse.errors) {
        console.log("[bot] instagram graphql errors:", jsonResponse.errors);
        return [];
      }

      return this.parseGraphQLResponse(jsonResponse);
    } catch (e: any) {
      console.log("[bot] instagram graphql fetch exception:", {
        message: e?.message || e,
        stack: e?.stack || 'no stack',
        name: e?.name || 'unknown'
      });
      return [];
    }
  }

  private parseGraphQLResponse(response: any): InstagramReel[] {
    const reels: InstagramReel[] = [];
    
    try {
      const reelsData = response.data?.[INSTAGRAM_SESSION.rootFieldName];
      
      if (!reelsData) {
        console.log("[bot] instagram graphql no reels data found in response");
        return reels;
      }

      const edges = reelsData.edges || [];
      console.log("[bot] instagram graphql edges found:", edges.length);

      for (const edge of edges) {
        const media = edge.node?.media;
        
        if (!media || media.product_type !== "clips") {
          continue;
        }

        const reel = this.createReelFromGraphQLMedia(media);
        if (reel) reels.push(reel);
      }

      // Trier par date (plus récent en premier)
      return reels.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    } catch (e: any) {
      console.log("[bot] instagram graphql parsing error:", e?.message || e);
      return reels;
    }
  }

  private createReelFromGraphQLMedia(media: any): InstagramReel | null {
    try {
      const pk = media.pk?.toString() || "";
      const code = media.code || "";
      const title = media.caption?.text || "Nouveau Reel LunaLive";
      const description = media.caption?.text || "";
      const thumbnail = media.image_versions2?.candidates?.[0]?.url || "";
      const takenAt = media.taken_at ? new Date(media.taken_at * 1000) : new Date();
      const likes = media.like_count || 0;
      const comments = media.comment_count || 0;

      console.log("[bot] instagram latest reel thumbnail found:", !!thumbnail);

      return {
        id: pk,
        shortcode: code,
        url: `https://www.instagram.com/reel/${code}/`,
        title: this.extractFirstLine(title),
        description,
        thumbnail,
        publishedAt: takenAt,
        likes,
        comments
      };
    } catch (e: any) {
      console.log("[bot] instagram error creating reel from GraphQL media:", e?.message || e);
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

  private truncateTitle(title: string, maxLength: number): string {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + "...";
  }

  private extractLunaLiveLink(description: string): string | null {
    // Chercher les liens vers LunaLive dans la description
    const lunaLiveRegex = /https:\/\/lunalive\.onrender\.com\/s\/([a-zA-Z0-9_-]+)/gi;
    const match = description.match(lunaLiveRegex);
    
    if (match) {
      return match[0];
    }
    
    // Chercher les mentions de streamers connus
    const knownStreamers = ["fabiozsis", "lecasinoze", "lunalive", "twitch"];
    for (const streamer of knownStreamers) {
      if (description.toLowerCase().includes(streamer.toLowerCase())) {
        return `https://lunalive.win/s/${streamer}`;
      }
    }
    
    return null;
  }

  private extractStreamerName(reel: InstagramReel, lunaLiveLink: string | null): string | null {
    // Extraire le nom du streamer depuis le lien LunaLive
    if (lunaLiveLink) {
      const match = lunaLiveLink.match(/\/s\/([a-zA-Z0-9_-]+)/i);
      if (match) {
        return match[1];
      }
    }
    
    // Chercher dans la description
    const patterns = [
      /streamer[:\s]*([a-zA-Z0-9_-]+)/i,
      /by[:\s]*([a-zA-Z0-9_-]+)/i,
      /avec[:\s]*([a-zA-Z0-9_-]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = reel.description.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  private buildEmbedDescription(streamerName: string | null, lunaLiveLink: string | null): string {
    let description = "Un nouveau Reel LunaLive est disponible sur Instagram.";
    
    if (streamerName) {
      description += `\n\n👤 **Streamer** : ${streamerName}`;
    }
    
    if (lunaLiveLink) {
      description += `\n📺 **LunaLive** : <${lunaLiveLink}>`;
    }
    
    return description;
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
        icon_url: "https://lunalive.win/favicon.ico"
      },
      title: finalTitle,
      description: this.buildEmbedDescription(streamerName, lunaLiveLink),
      color: 0xE4405F, // Rose Instagram
      timestamp: reel.publishedAt.toISOString(),
      footer: {
        text: "LunaLive Clips",
        icon_url: "https://lunalive.win/favicon.ico"
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
        console.log("[bot] instagram notification sent successfully");
      }
    } catch (e: any) {
      console.log("[bot] instagram notification exception", e?.message || e);
    }
  }
}
