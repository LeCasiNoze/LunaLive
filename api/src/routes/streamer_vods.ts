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
  s = s.replace(/\/.*$/, ""); // garde le 1er segment
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

async function tableExists(fullName: string) {
  const { rows } = await pool.query(`SELECT to_regclass($1) AS reg`, [fullName]);
  return !!rows?.[0]?.reg;
}

async function getColumns(tableName: string) {
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );
  return new Set(rows.map((r: any) => String(r.column_name)));
}

type LinkedInfo = {
  linkedDisplayname: string | null;
  linkedUsername: string | null;
  useLinked: boolean | null;
  foundFrom: string | null;
};

async function getLinkedDliveInfoByUserId(userId: number): Promise<LinkedInfo> {
  // candidates (adapte si besoin)
  const candidates = [
    "streamer_dlive_links",
    "streamer_dlive_link",
    "dlive_links",
    "user_dlive_links",
    "dlive_link",
  ];

  for (const t of candidates) {
    const full = `public.${t}`;
    const ok = await tableExists(full);
    if (!ok) continue;

    const cols = await getColumns(t);

    // user ref column
    const userCol =
      (cols.has("user_id") && "user_id") ||
      (cols.has("owner_user_id") && "owner_user_id") ||
      (cols.has("uid") && "uid") ||
      null;

    // linked columns
    const displayCol =
      (cols.has("linked_displayname") && "linked_displayname") ||
      (cols.has("linkedDisplayname") && "linkedDisplayname") ||
      (cols.has("displayname") && "displayname") ||
      null;

    const usernameCol =
      (cols.has("linked_username") && "linked_username") ||
      (cols.has("linkedUsername") && "linkedUsername") ||
      (cols.has("username") && "username") ||
      null;

    const useCol =
      (cols.has("use_linked") && "use_linked") ||
      (cols.has("useLinked") && "useLinked") ||
      null;

    if (!userCol) continue; // on sait pas relier à un user

    // construit SELECT minimal
    const sel = [
      displayCol ? `${displayCol} AS "linkedDisplayname"` : `NULL::text AS "linkedDisplayname"`,
      usernameCol ? `${usernameCol} AS "linkedUsername"` : `NULL::text AS "linkedUsername"`,
      useCol ? `${useCol} AS "useLinked"` : `NULL::bool AS "useLinked"`,
    ].join(", ");

    try {
      const { rows } = await pool.query(
        `SELECT ${sel}
         FROM ${t}
         WHERE ${userCol}=$1
         LIMIT 1`,
        [userId]
      );

      const r = rows?.[0];
      if (!r) continue;

      const linkedDisplayname = r.linkedDisplayname != null ? String(r.linkedDisplayname) : null;
      const linkedUsername = r.linkedUsername != null ? String(r.linkedUsername) : null;
      const useLinked = r.useLinked != null ? !!r.useLinked : null;

      if ((linkedDisplayname && linkedDisplayname.trim()) || (linkedUsername && linkedUsername.trim())) {
        return {
          linkedDisplayname: linkedDisplayname ? linkedDisplayname.trim() : null,
          linkedUsername: linkedUsername ? linkedUsername.trim() : null,
          useLinked,
          foundFrom: t,
        };
      }
    } catch {
      // ignore et tente la suivante
    }
  }

  return { linkedDisplayname: null, linkedUsername: null, useLinked: null, foundFrom: null };
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

  const r = await fetch("https://graphigo.prd.dlive.tv/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((x) => x.json());

  if (Array.isArray(r?.errors) && r.errors.length) {
    return { ok: false as const, error: "dlive_graphql_error", raw: r };
  }

  const conn = r?.data?.userByDisplayName?.pastBroadcastsV2;
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

    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    // parse cursor prefix: l:<cursor> / p:<cursor>
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
         pa.channel_slug AS "providerChannelSlug"
       FROM streamers s
       LEFT JOIN provider_accounts pa ON pa.assigned_to_streamer_id = s.id
       WHERE s.slug=$1
       LIMIT 1`,
      [slug]
    );

    const row = s.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const providerChannelSlug = normalizeDliveHandle(row.providerChannelSlug);
    const userId = Number(row.userId || 0) || 0;

    const linked = userId ? await getLinkedDliveInfoByUserId(userId) : null;
    const linkedHandle = normalizeDliveHandle(linked?.linkedUsername || linked?.linkedDisplayname);

    // choix de la source
    const canUseLinked = !!linkedHandle;
    const canUseProvider = !!providerChannelSlug;

    // si cursor impose une source -> on force
    let source: "linked" | "provider" | null = forcedSource;

    if (!source) {
      // logique simple: si linked existe => linked, sinon provider
      source = canUseLinked ? "linked" : canUseProvider ? "provider" : null;
    }

    if (!source) {
      return res.json({
        ok: true,
        reason: "no_source",
        channelSlug: null,
        providerChannelSlug: canUseProvider ? providerChannelSlug : null,
        linkedChannel: canUseLinked ? linkedHandle : null,
        source: null,
        foundFrom: linked?.foundFrom ?? null,
        pageInfo: { endCursor: null, hasNextPage: false },
        vods: [],
      });
    }

    const chosenDisplay = source === "linked" ? linkedHandle : providerChannelSlug;

    // fetch chosen
    let out = await fetchDliveVods(chosenDisplay, limit, afterCursor);

    // fallback automatique si linked choisi mais 0 vods et provider dispo (ou inverse)
    if (out.ok && out.vods.length === 0 && forcedSource == null) {
      if (source === "linked" && canUseProvider && providerChannelSlug && providerChannelSlug !== chosenDisplay) {
        const out2 = await fetchDliveVods(providerChannelSlug, limit, null);
        if (out2.ok && out2.vods.length > 0) {
          source = "provider";
          out = out2;
        }
      } else if (source === "provider" && canUseLinked && linkedHandle && linkedHandle !== chosenDisplay) {
        const out2 = await fetchDliveVods(linkedHandle, limit, null);
        if (out2.ok && out2.vods.length > 0) {
          source = "linked";
          out = out2;
        }
      }
    }

    if (!out.ok) {
      return res.status(502).json({ ok: false, error: out.error });
    }

    const prefix = source === "linked" ? "l" : "p";
    const endCursor = out.pageInfo.endCursor != null ? `${prefix}:${String(out.pageInfo.endCursor)}` : null;

    return res.json({
      ok: true,
      reason: "ok",
      // pour ton UI: on met channelSlug = celui utilisé
      channelSlug: source === "linked" ? linkedHandle : providerChannelSlug,
      providerChannelSlug: canUseProvider ? providerChannelSlug : null,
      linkedChannel: canUseLinked ? linkedHandle : null,
      source,
      foundFrom: linked?.foundFrom ?? null,
      pageInfo: {
        endCursor,
        hasNextPage: !!out.pageInfo.hasNextPage,
      },
      vods: out.vods,
    });
  })
);
