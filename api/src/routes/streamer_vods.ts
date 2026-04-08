import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";

export const streamerVodsRouter = Router();

type VodOut = {
  permlink: string;
  title: string;
  thumbnailUrl: string | null;
  lengthSec: number;
  createdAtMs: number;
  viewCount: number;
  playbackUrl: string | null;
  resolutions: Array<{ resolution: string; url: string }>;
  bestHlsUrl: string | null;
};

function normalizeDliveHandle(input: any): string {
  let s = String(input || "").trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\/(www\.)?dlive\.tv\//i, "");
  s = s.replace(/^@/, "");
  s = s.replace(/\/.*$/, "");
  return s.trim();
}

function pickBestHls(playbackUrl: any, resolution: any): string | null {
  const resArr = Array.isArray(resolution) ? resolution : [];
  const by = (k: string) =>
    resArr.find((x: any) => String(x?.resolution || "").toLowerCase() === k)?.url;

  return (
    by("src") ||
    by("720p") ||
    by("480p") ||
    (typeof playbackUrl === "string" && playbackUrl ? playbackUrl : null) ||
    (typeof resArr?.[0]?.url === "string" ? resArr[0].url : null)
  );
}

async function fetchDliveVods(displayname: string, first: number, after: string | null) {
  const query = `
    query PastBroadcastsV2($displayname: String!, $first: Int!, $after: String) {
      userByDisplayName(displayname: $displayname) {
        pastBroadcastsV2(first: $first, after: $after) {
          pageInfo { endCursor hasNextPage __typename }
          list {
            permlink
            thumbnailUrl
            title
            length
            createdAt
            viewCount
            playbackUrl
            resolution { resolution url __typename }
            __typename
          }
          __typename
        }
        __typename
      }
    }
  `;

  const body = {
    operationName: "PastBroadcastsV2",
    variables: { displayname, first, after },
    query,
  };

  let json: any;
  try {
    json = await fetch("https://graphigo.prd.dlive.tv/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((x) => x.json());
  } catch (e) {
    return { ok: false as const, error: "dlive_fetch_failed" as const };
  }

  if (Array.isArray(json?.errors) && json.errors.length) {
    return { ok: false as const, error: "dlive_graphql_error" as const };
  }

  const conn = json?.data?.userByDisplayName?.pastBroadcastsV2;
  const pageInfo = conn?.pageInfo || { endCursor: null, hasNextPage: false };
  const list = Array.isArray(conn?.list) ? conn.list : [];

  const vods: VodOut[] = list.map((v: any) => {
    const playbackUrl = typeof v?.playbackUrl === "string" ? v.playbackUrl : null;
    const resArr = Array.isArray(v?.resolution)
      ? v.resolution
          .map((x: any) => ({ resolution: String(x?.resolution || ""), url: String(x?.url || "") }))
          .filter((x: any) => x.resolution && x.url)
      : [];

    const bestHlsUrl = pickBestHls(playbackUrl, resArr);

    return {
      permlink: String(v?.permlink || ""),
      title: String(v?.title || ""),
      thumbnailUrl: v?.thumbnailUrl ? String(v.thumbnailUrl) : null,
      lengthSec: Number(v?.length || 0) || 0,
      createdAtMs: Number(v?.createdAt || 0) || 0,
      viewCount: Number(v?.viewCount || 0) || 0,
      playbackUrl,
      resolutions: resArr,
      bestHlsUrl,
    };
  });

  return {
    ok: true as const,
    pageInfo: {
      endCursor: pageInfo?.endCursor ?? null,
      hasNextPage: !!pageInfo?.hasNextPage,
    },
    vods,
  };
}

streamerVodsRouter.get(
  "/streamers/:slug/vods",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    const cursorRaw = req.query.cursor != null ? String(req.query.cursor) : null;
    const limit = Math.max(1, Math.min(48, Number(req.query.limit || 24)));
    res.setHeader("x-handler", "streamer_vods");

    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    // cursor optionnel prefixé: l:<cursor> ou p:<cursor>
    let forcedSource: "linked" | "provider" | null = null;
    let afterCursor: string | null = cursorRaw;

    if (cursorRaw && /^([lp]):/.test(cursorRaw)) {
      const m = cursorRaw.match(/^([lp]):(.*)$/);
      if (m) {
        forcedSource = m[1] === "l" ? "linked" : "provider";
        afterCursor = m[2] || null;
      }
    }

    const s = await pool.query(
      `SELECT
         s.id,
         s.user_id AS "userId",
         pa.channel_slug AS "providerChannelSlug",
         s.dlive_use_linked AS "useLinked",
         s.dlive_link_displayname AS "linkedDisplayname",
         s.dlive_link_username AS "linkedUsername"
       FROM streamers s
       LEFT JOIN provider_accounts pa ON pa.assigned_to_streamer_id = s.id
       WHERE s.slug=$1
       LIMIT 1`,
      [slug]
    );

    const row = s.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const providerChannelSlug = normalizeDliveHandle(row.providerChannelSlug);
    const linkedChannel = normalizeDliveHandle(row.linkedDisplayname);
    const useLinked = !!row.useLinked;

    const canUseLinked = !!linkedChannel;
    const canUseProvider = !!providerChannelSlug;

    // source par défaut:
    // - si cursor force -> force
    // - sinon si useLinked ET linked existe -> linked
    // - sinon si provider existe -> provider
    // - sinon linked (si existe)
    let source: "linked" | "provider" | null = forcedSource;
    if (!source) {
      if (useLinked && canUseLinked) source = "linked";
      else if (canUseProvider) source = "provider";
      else if (canUseLinked) source = "linked";
      else source = null;
    }

    if (!source) {
      // Pas de DLive → essayer Rumble VOD (dernier live_id connu)
      const rumbleRow = await pool.query(
        `SELECT live_id, title, thumbnail_url, live_started_at
         FROM streamer_rumble_info WHERE streamer_id=$1 LIMIT 1`,
        [row.id]
      ).then(r => r.rows[0] || null).catch(() => null);

      const liveId = rumbleRow?.live_id ? String(rumbleRow.live_id).replace(/^v/, "") : null;
      if (liveId) {
        const hlsUrl = `https://rumble.com/live-hls-dvr/${liveId}/playlist.m3u8`;
        const createdAtMs = rumbleRow.live_started_at ? Number(rumbleRow.live_started_at) : 0;
        return res.json({
          ok: true,
          reason: "ok",
          source: "rumble",
          pageInfo: { endCursor: null, hasNextPage: false },
          vods: [{
            permlink: `rumble_${liveId}`,
            title: rumbleRow.title ? String(rumbleRow.title) : "Dernier live Rumble",
            thumbnailUrl: rumbleRow.thumbnail_url ? String(rumbleRow.thumbnail_url) : null,
            lengthSec: 0,
            createdAtMs,
            viewCount: 0,
            bestHlsUrl: hlsUrl,
          }],
        });
      }

      return res.json({
        ok: true,
        reason: "no_source",
        channelSlug: null,
        source: null,
        pageInfo: { endCursor: null, hasNextPage: false },
        vods: [],
      });
    }

    const primary = source === "linked" ? linkedChannel : providerChannelSlug;
    const secondary = source === "linked" ? providerChannelSlug : linkedChannel;

    // fetch primary
    let out = await fetchDliveVods(primary, limit, afterCursor);

    // fallback auto si 0 vods et autre source dispo (et pas cursor forcé)
    if (out.ok && out.vods.length === 0 && forcedSource == null) {
      if (secondary && secondary !== primary) {
        const out2 = await fetchDliveVods(secondary, limit, null);
        if (out2.ok && out2.vods.length > 0) {
          // on switch la source
          source = source === "linked" ? "provider" : "linked";
          out = out2;
        }
      }
    }

    if (!out.ok) {
      return res.status(502).json({ ok: false, error: out.error });
    }

    const prefix = source === "linked" ? "l" : "p";
    const endCursor =
      out.pageInfo.endCursor != null ? `${prefix}:${String(out.pageInfo.endCursor)}` : null;

    return res.json({
      ok: true,
      reason: "ok",
      channelSlug: source === "linked" ? linkedChannel : providerChannelSlug, // utilisé
      providerChannelSlug: canUseProvider ? providerChannelSlug : null,
      linkedChannel: canUseLinked ? linkedChannel : null,
      source,
      pageInfo: { endCursor, hasNextPage: !!out.pageInfo.hasNextPage },
      vods: out.vods,
    });
  })
);
