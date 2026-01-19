// api/src/bot_clips/vod_linker.ts
import {
  ensureBotClips,
  getDliveChannelSlugForStreamer,
  listPendingClipsForStreamer,
  listStreamersWithPendingVodClips,
  setClipVodInfo,
  type BotClipRow,
} from "./store.js";

const ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";

type VodLite = {
  permlink: string;
  title: string;
  createdAtMs: number; // ✅ epoch ms
  lengthSec: number;
  playbackUrl: string | null;
  resolution?: Array<{ resolution: string; url: string }>;
};

async function gql(query: string, variables?: any) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      origin: "https://dlive.tv",
      referer: "https://dlive.tv/",
    },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });
  if (!r.ok) throw new Error(`dlive_gql_http_${r.status}`);
  return (await r.json()) as any;
}

async function fetchRecentVods(displayName: string, first = 8): Promise<VodLite[]> {
  const query =
    'query PastBroadcastsLite($name:String!, $first:Int!){ userByDisplayName(displayname:$name){ username pastBroadcastsV2(first:$first){ list { permlink title createdAt length playbackUrl resolution { resolution url } } } } }';

  const j: any = await gql(query, { name: displayName, first });

  const list = j?.data?.userByDisplayName?.pastBroadcastsV2?.list || [];
  return (list || []).map((x: any) => ({
    permlink: String(x?.permlink || ""),
    title: String(x?.title || ""),
    createdAtMs: Number(x?.createdAt || 0), // dlive returns ms
    lengthSec: Number(x?.length || 0),
    playbackUrl: (String(x?.playbackUrl || "").trim() || null),
    resolution: Array.isArray(x?.resolution)
      ? x.resolution.map((r: any) => ({
          resolution: String(r?.resolution || ""),
          url: String(r?.url || ""),
        }))
      : undefined,
  })) as VodLite[];
}

function matchVod(
  clip: Pick<BotClipRow, "created_ts" | "at_sec">,
  vods: VodLite[],
  toleranceSec = 30 * 60
): VodLite | null {
  if (!vods.length) return null;

  // clip.created_ts = ms ; at_sec = sec
  const clipCreatedSec = Math.floor(Number(clip.created_ts || 0) / 1000);
  const liveStartEstSec = Math.floor(clipCreatedSec - Math.max(0, Number(clip.at_sec || 0)));

  let best: VodLite | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const v of vods) {
    const startSec = Math.floor(Number(v.createdAtMs || 0) / 1000);
    const endSec = startSec + Math.max(0, Number(v.lengthSec || 0));

    const inRange = clipCreatedSec >= startSec - 60 && clipCreatedSec <= endSec + 600;
    const delta = Math.abs(startSec - liveStartEstSec);
    const better = delta < bestDelta || (delta === bestDelta && inRange);

    if (better) {
      bestDelta = delta;
      best = v;
    }
  }

  return best && bestDelta <= toleranceSec ? best : null;
}

function pickVodUrl(v: VodLite): string | null {
  const res = Array.isArray(v.resolution) ? v.resolution : [];
  const src = res.find((r) => String(r?.resolution || "").toLowerCase() === "src")?.url?.trim();
  if (src) return src;

  const p720 = res.find((r) => String(r?.resolution || "").toLowerCase() === "720p")?.url?.trim();
  if (p720) return p720;

  return (v.playbackUrl || "").trim() || null;
}

let running = false;

export function startClipsVodLinker() {
  const TICK_MS = 60_000;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      await ensureBotClips();

      const streamers = await listStreamersWithPendingVodClips();
      if (!streamers.length) return;

      for (const streamerId of streamers) {
        try {
          const display = await getDliveChannelSlugForStreamer(streamerId);
          if (!display) continue;

          const vods = (await fetchRecentVods(display, 8).catch(() => [])) as VodLite[];
          if (!vods.length) continue;

          const clips = await listPendingClipsForStreamer(streamerId, 500);
          for (const c of clips) {
            try {
              const v = matchVod(c, vods);
              const url = v ? pickVodUrl(v) : null;
              if (!v || !url) continue;

              await setClipVodInfo(streamerId, c.id, {
                vod_url: url,
                vod_permlink: v.permlink,
                vod_created_ts: Number(v.createdAtMs || 0), // ✅ ms
              });
            } catch {
              // ignore clip-level errors
            }
          }
        } catch {
          // ignore streamer-level errors
        }
      }
    } finally {
      running = false;
    }
  };

  setTimeout(() => void run(), 5_000);
  const id = setInterval(() => void run(), TICK_MS);
  (id as any).unref?.();
}
