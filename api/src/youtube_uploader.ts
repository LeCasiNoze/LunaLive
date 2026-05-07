// api/src/youtube_uploader.ts
// Upload d'une VOD Rumble (MP4 CDN) vers la chaine YouTube @fabiozsis,
// en streaming direct (pas de stockage disque).
//
// Variables d'env requises :
//   YT_CLIENT_ID         — OAuth Client ID (Google Cloud Console)
//   YT_CLIENT_SECRET     — OAuth Client Secret
//   YT_REFRESH_TOKEN     — Refresh token avec scope https://www.googleapis.com/auth/youtube.upload
//   YT_PRIVACY           — "private" | "unlisted" | "public" (defaut: "unlisted")
//   YT_CATEGORY_ID       — defaut: "20" (Gaming)
//
// Le pipeline :
//   1. echange refresh_token -> access_token
//   2. POST resumable session  -> recupere Location URL
//   3. HEAD rumble MP4         -> taille + content-type
//   4. GET rumble MP4 (stream) -> PUT upload URL (body = ReadableStream, duplex:'half')
//   5. parse JSON              -> { id: videoId }

type UploadInput = {
  mp4Url: string;
  title: string;
  description: string;
  privacyStatus?: "private" | "unlisted" | "public";
  categoryId?: string;
  tags?: string[];
};

type UploadResult = {
  videoId: string;
  uploadUrl: string;
};

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.accessToken;

  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube OAuth env vars manquantes (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN)");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`OAuth refresh echoue ${r.status}: ${txt.slice(0, 300)}`);
  }
  const j: any = await r.json();
  const accessToken: string = j.access_token;
  const expiresIn: number = Number(j.expires_in || 3600);
  cachedToken = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

export async function uploadVodToYouTube(input: UploadInput): Promise<UploadResult> {
  const privacy = input.privacyStatus || (process.env.YT_PRIVACY as any) || "unlisted";
  const category = input.categoryId || process.env.YT_CATEGORY_ID || "20";

  const accessToken = await getAccessToken();

  // 1. HEAD pour la taille (si supporte). Sinon on poste sans Content-Length connu.
  const head = await fetch(input.mp4Url, { method: "HEAD" }).catch(() => null);
  const contentLengthHeader = head?.headers.get("content-length") || "";
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const knownSize = Number.isFinite(contentLength) && contentLength > 0;
  if (!knownSize) {
    throw new Error(`Impossible de determiner la taille du MP4 (HEAD content-length manquant): ${input.mp4Url}`);
  }

  // 2. Initier la session resumable
  const metadata = {
    snippet: {
      title: input.title.slice(0, 100), // YT limit 100 chars
      description: input.description.slice(0, 5000),
      tags: input.tags || [],
      categoryId: category,
      defaultLanguage: "fr",
      defaultAudioLanguage: "fr",
    },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": "video/mp4",
        "x-upload-content-length": String(contentLength),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    throw new Error(`YT resumable init echec ${initRes.status}: ${txt.slice(0, 500)}`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YT resumable init: header Location manquant");

  // 3. Stream le MP4 Rumble vers YT
  const src = await fetch(input.mp4Url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      referer: "https://rumble.com/",
    },
  });
  if (!src.ok || !src.body) {
    throw new Error(`Fetch MP4 Rumble echec ${src.status}`);
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(contentLength),
    },
    body: src.body,
    // @ts-expect-error: option undici pour streaming requests
    duplex: "half",
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    throw new Error(`YT upload PUT echec ${putRes.status}: ${txt.slice(0, 500)}`);
  }
  const j: any = await putRes.json();
  const videoId: string | undefined = j?.id;
  if (!videoId) throw new Error(`YT upload: reponse sans id (${JSON.stringify(j).slice(0, 300)})`);

  return { videoId, uploadUrl };
}

/**
 * Formate "Rediff stream #N (JJ/MM)" en se basant sur la date de fin du live (Europe/Paris).
 */
export function formatRediffTitle(streamNumber: number, endedAt: Date): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
  });
  const dm = fmt.format(endedAt); // "JJ/MM"
  return `Rediff stream #${streamNumber} (${dm})`;
}
