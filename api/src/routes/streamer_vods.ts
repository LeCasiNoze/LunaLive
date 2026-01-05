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

streamerVodsRouter.get(
  "/streamers/:slug/vods",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    const cursor = req.query.cursor != null ? String(req.query.cursor) : null;
    const limit = Math.max(1, Math.min(48, Number(req.query.limit || 24)));

    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    // Récupère le channel_slug DLive assigné
    const s = await pool.query(
      `SELECT
         s.id,
         pa.channel_slug AS "channelSlug"
       FROM streamers s
       LEFT JOIN provider_accounts pa ON pa.assigned_to_streamer_id = s.id
       WHERE s.slug=$1
       LIMIT 1`,
      [slug]
    );

    const row = s.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const channelSlug = String(row.channelSlug || "").trim();
    if (!channelSlug) {
      console.warn("[vods] no channelSlug for streamer slug=", slug);
      return res.json({
        ok: true,
        channelSlug: null,
        reason: "no_provider_account",
        pageInfo: { endCursor: null, hasNextPage: false },
        vods: [],
      });
    }

    const query = `
      query PastBroadcastsV2($displayname: String!, $first: Int!, $after: String) {
        userByDisplayName(displayname: $displayname) {
          username
          displayname
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
      variables: {
        displayname: channelSlug,
        first: limit,
        after: cursor,
      },
      query,
    };

    const r = await fetch("https://graphigo.prd.dlive.tv/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((x) => x.json());

    if (Array.isArray(r?.errors) && r.errors.length) {
      console.warn("[vods] dlive graphql errors:", r.errors);
      return res.status(502).json({ ok: false, error: "dlive_graphql_error" });
    }

    const user = r?.data?.userByDisplayName;
    if (!user) {
      console.warn("[vods] dlive userByDisplayName null for", { channelSlug, slug });
      return res.json({
        ok: true,
        channelSlug,
        reason: "dlive_user_not_found",
        pageInfo: { endCursor: null, hasNextPage: false },
        vods: [],
      });
    }

    const conn = user?.pastBroadcastsV2;
    const pageInfo = conn?.pageInfo || { endCursor: null, hasNextPage: false };
    const list = Array.isArray(conn?.list) ? conn.list : [];

    const vods: VodOut[] = list.map((v: any) => {
      const playbackUrl = typeof v?.playbackUrl === "string" ? v.playbackUrl : null;
      const resArr = Array.isArray(v?.resolution)
        ? v.resolution
            .map((x: any) => ({
              resolution: String(x?.resolution || ""),
              url: String(x?.url || ""),
            }))
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

    res.json({
      ok: true,
      channelSlug,
      reason: "ok",
      pageInfo: {
        endCursor: pageInfo?.endCursor ?? null,
        hasNextPage: !!pageInfo?.hasNextPage,
      },
      vods,
    });
  })
);
