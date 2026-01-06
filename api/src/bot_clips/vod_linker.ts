// api/src/bot_clips/vod_linker.ts
import {
  ensureBotClips,
  getDliveChannelSlugForStreamer,
  listPendingClipsForStreamer,
  listStreamersWithPendingVodClips,
  setClipVodInfo,
  type BotClipRow,
} from "./store.js";

const ENDPOINT =
  process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";

type VodLite = {
  permlink: string;
  title: string;
  createdAtSec: number; // epoch seconds
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
    createdAtSec: Math.floor(Number(x?.createdAt || 0) / 1000),
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

  const liveStartEst = Math.floor(clip.created_ts - Math.max(0, clip.at_sec));
  let best: VodLite | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const v of vods) {
    const start = v.createdAtSec;
    const end = start + Math.max(0, v.lengthSec || 0);

    const inRange = clip.created_ts >= (start - 60) && clip.created_ts <= (end + 600);
    const delta = Math.abs(start - liveStartEst);
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
                vod_created_ts: v.createdAtSec,
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
