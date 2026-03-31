// api/src/shared/clip_service.ts
// Service local pour la création de clips (API uniquement)

const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";

const LATENCY_PAD_SEC  = 0;     // Pas de compensation latence (cible: 1m15 avant / 15s après la commande)
const DEFAULT_PRE_SEC  = 75;   // 1m15 avant la commande/détection
const DEFAULT_POST_SEC = 15;   // 15s après la commande/détection

type LiveStart = { createdAtMs: number; permlink: string };
type Pool = any; // Type générique pour éviter la dépendance pg

async function dliveGql(query: string, variables?: any) {
  const r = await fetch(DLIVE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept:         "application/json",
      origin:         "https://dlive.tv",
      referer:        "https://dlive.tv/",
    },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });
  if (!r.ok) throw new Error(`dlive_gql_http_${r.status}`);
  return (await r.json()) as any;
}

async function fetchLiveStart(displayName: string): Promise<LiveStart | null> {
  const query =
    "query UserLiveStart($name:String!){ userByDisplayName(displayname:$name){ username livestream{ createdAt permlink watchingCount } } }";

  const j: any = await dliveGql(query, { name: displayName });
  const ls = j?.data?.userByDisplayName?.livestream;
  if (!ls?.createdAt) return null;

  const createdAtMs = Number(ls.createdAt);
  if (!Number.isFinite(createdAtMs)) return null;

  return { createdAtMs, permlink: String(ls.permlink || "") };
}

export async function getDliveChannelSlugForStreamer(pool: Pool, streamerId: number): Promise<{
  channelSlug: string | null;
  sourceDisplayname: string | null;
}> {
  const r = await pool.query(
    `SELECT
       s.dlive_use_linked AS "useLinked",
       s.dlive_link_displayname AS "linkedDisplayname",
       pa.channel_slug AS "providerChannelSlug"
     FROM streamers s
     LEFT JOIN provider_accounts pa
       ON pa.provider='dlive'
      AND pa.assigned_to_streamer_id = s.id
     WHERE s.id=$1
     LIMIT 1`,
    [streamerId]
  );

  const row = r.rows?.[0] || null;
  if (!row) return { channelSlug: null, sourceDisplayname: null };

  const useLinked   = !!row.useLinked;
  const linked      = row.linkedDisplayname ? String(row.linkedDisplayname) : "";
  const provider    = row.providerChannelSlug ? String(row.providerChannelSlug) : "";
  const channelSlug = useLinked && linked ? linked : provider;
  
  // ✅ Pour LunaLive radio, on snapshotne la source réelle (displayname uniquement)
  const sourceDisplayname = useLinked && linked ? linked : null;

  return { 
    channelSlug: channelSlug.trim() ? channelSlug.trim() : null,
    sourceDisplayname
  };
}

let ensured = false;

const TS_MS_THRESHOLD = 100000000000; // 1e11

async function ensureBotClipsTable(pool: Pool) {
  if (ensured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_clips (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL,
      title TEXT,
      author TEXT,
      at_sec INTEGER NOT NULL,
      pre_sec INTEGER NOT NULL DEFAULT 105,
      post_sec INTEGER NOT NULL DEFAULT 15,
      created_ts BIGINT NOT NULL,
      vod_url TEXT,
      vod_permlink TEXT,
      vod_created_ts BIGINT
    );
  `);

  await pool.query(`ALTER TABLE bot_clips ALTER COLUMN created_ts TYPE BIGINT USING created_ts::bigint;`).catch(() => {});
  await pool.query(`ALTER TABLE bot_clips ALTER COLUMN vod_created_ts TYPE BIGINT USING vod_created_ts::bigint;`).catch(() => {});

  // ✅ Nouvelle colonne : timestamp exact du début du live courant au moment du clip
  // Permet au vod_linker de trouver la VOD exacte sans estimation approximative
  await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_start_ts BIGINT;`);
  
  // ✅ Nouvelle colonne : permlink du live pour matching exact VOD
  await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS live_permlink TEXT;`);
  
  // ✅ source LunaLive radio (snapshot)
  await pool.query(`ALTER TABLE bot_clips ADD COLUMN IF NOT EXISTS source_displayname TEXT;`);
  
  // Index pour recherche rapide par permlink
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_clips_live_permlink ON bot_clips(live_permlink) WHERE live_permlink IS NOT NULL;`);
  
  // Index pour recherche rapide par source displayname
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bot_clips_source_displayname ON bot_clips(source_displayname) WHERE source_displayname IS NOT NULL;`);

  await pool.query(
    `UPDATE bot_clips SET created_ts = created_ts * 1000 WHERE created_ts < $1`,
    [TS_MS_THRESHOLD]
  ).catch(() => {});
  await pool.query(
    `UPDATE bot_clips SET vod_created_ts = vod_created_ts * 1000 WHERE vod_created_ts IS NOT NULL AND vod_created_ts < $1`,
    [TS_MS_THRESHOLD]
  ).catch(() => {});

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_created
      ON bot_clips(streamer_id, created_ts DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bot_clips_streamer_vod_pending
      ON bot_clips(streamer_id)
      WHERE vod_url IS NULL;
  `);

  ensured = true;
}

const CLIPS_LIMIT_NO_SUB = 10;

async function getStreamerOwnerUserId(pool: Pool, streamerId: number): Promise<number | null> {
  const r = await pool.query(`SELECT user_id FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
  const id = Number(r.rows?.[0]?.user_id || 0);
  return id > 0 ? id : null;
}

async function hasActiveStreamerSub(pool: Pool, userId: number): Promise<boolean> {
  const uid = Number(userId || 0);
  if (!uid) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM user_subscriptions us
       WHERE us.user_id=$1 AND us.plan_code='streamer'
         AND us.status IN ('active','trialing')
         AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
       LIMIT 1`,
      [uid]
    );
    return !!r.rows?.[0];
  } catch {
    return false;
  }
}

async function streamerHasUnlimitedClips(pool: Pool, streamerId: number): Promise<boolean> {
  const ownerId = await getStreamerOwnerUserId(pool, streamerId);
  if (!ownerId) return false;
  return hasActiveStreamerSub(pool, ownerId);
}

export async function addClipPg(p: {
  pool: Pool;
  streamerId: number;
  title: string | null;
  author: string | null;
  atSec: number;
  preSec: number;
  postSec: number;
  // ✅ timestamp exact du début du live courant (ms) — ancre pour le vod_linker
  liveStartTs: number;
  // ✅ permlink du live pour matching exact VOD
  livePermlink: string;
  // ✅ source LunaLive radio (snapshot)
  sourceDisplayname?: string | null;
}): Promise<{ ok: true; id: number } | { ok: false; reason: "duplicate" }> {
  const { pool, streamerId } = p;

  await ensureBotClipsTable(pool);

  const nowMs   = Date.now();
  const at      = Math.max(0, Math.floor(p.atSec));
  const pre     = Math.max(0, Math.floor(p.preSec));
  const post    = Math.max(0, Math.floor(p.postSec));

  const unlimited = await streamerHasUnlimitedClips(pool, streamerId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dup = await client.query(
      `SELECT id FROM bot_clips
       WHERE streamer_id=$1 AND ABS(at_sec - $2) <= 20 AND created_ts >= $3
       LIMIT 1`,
      [streamerId, at, nowMs - 6 * 3600 * 1000]
    );
    if (dup.rows?.[0]?.id) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "duplicate" };
    }

    // ✅ on stocke live_start_ts, live_permlink et source LunaLive pour que le vod_linker trouve la bonne VOD
    const ins = await client.query(
      `INSERT INTO bot_clips(streamer_id, title, author, at_sec, pre_sec, post_sec, created_ts, live_start_ts, live_permlink, source_displayname)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [streamerId, p.title, p.author, at, pre, post, nowMs, p.liveStartTs, p.livePermlink, p.sourceDisplayname]
    );

    const newId = Number(ins.rows?.[0]?.id || 0);

    if (!unlimited) {
      await client.query(
        `WITH to_del AS (
           SELECT id FROM bot_clips WHERE streamer_id=$1
           ORDER BY created_ts DESC OFFSET $2
         )
         DELETE FROM bot_clips WHERE id IN (SELECT id FROM to_del)`,
        [streamerId, CLIPS_LIMIT_NO_SUB]
      );
    }

    await client.query("COMMIT");
    return { ok: true, id: newId };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export interface CreateClipParams {
  pool: Pool;
  streamerId: number;
  title?: string | null;
  author?: string | null;
  preSec?: number;
  postSec?: number;
  // Optionnel: si on veut forcer un timestamp spécifique au lieu du live actuel
  forcedOffsetSec?: number;
}

/**
 * Crée un clip auto pour un streamer (trigger detector)
 * Force toujours 75s avant / 15s après, ignore les paramètres externes
 */
export async function createAutoClipForStreamer(p: {
  pool: Pool;
  streamerId: number;
  title?: string | null;
  author?: string | null;
  forcedOffsetSec?: number;
}): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {
  // 🎯 Force toujours 75/15 pour les auto-clips, peu importe le payload
  return createClipForStreamer({
    pool: p.pool,
    streamerId: p.streamerId,
    title: p.title,
    author: p.author,
    preSec: DEFAULT_PRE_SEC,   // 75s fixe
    postSec: DEFAULT_POST_SEC,  // 15s fixe
    forcedOffsetSec: p.forcedOffsetSec,
  });
}

/**
 * Crée un clip pour un streamer (commande !clip ou création automatique)
 * Utilise la logique unifiée pour les deux cas d'usage
 */
export async function createClipForStreamer(p: CreateClipParams): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {
  const { pool, streamerId, title, author, preSec, postSec, forcedOffsetSec } = p;

  try {
    // Récupérer le channel slug et la source displayname
    const { channelSlug, sourceDisplayname } = await getDliveChannelSlugForStreamer(pool, streamerId);
    if (!channelSlug) {
      return { ok: false, reason: "streamer_dlive_not_found" };
    }

    // Vérifier que le live est actif
    const live = await fetchLiveStart(channelSlug).catch(() => null);
    if (!live) {
      return { ok: false, reason: "live_not_active" };
    }

    // Calculer l'offset du clip
    let offset: number;
    if (forcedOffsetSec !== undefined) {
      offset = Math.max(0, forcedOffsetSec);
    } else {
      const nowSec   = Math.floor(Date.now() / 1000);
      const startSec = Math.floor(live.createdAtMs / 1000);
      offset   = Math.max(0, nowSec - startSec + LATENCY_PAD_SEC);
    }

    // 🛡️ Validation défensive : clips manuels uniquement
    const isAutoClip = !p.author || p.author === 'lunaclip';
    let finalPreSec, finalPostSec;
    
    if (isAutoClip) {
      // 🎯 Auto-clip : toujours 75/15, ignore les valeurs externes
      finalPreSec = DEFAULT_PRE_SEC;
      finalPostSec = DEFAULT_POST_SEC;
    } else {
      // ✅ Manuel : respecter les valeurs utilisateur (avec limites de sécurité)
      finalPreSec  = Math.min(Math.max(0, Math.floor(preSec || DEFAULT_PRE_SEC)), 300);
      finalPostSec = Math.min(Math.max(0, Math.floor(postSec || DEFAULT_POST_SEC)), 60);
    }

    const res = await addClipPg({
      pool,
      streamerId,
      title: title || null,
      author: author || null,
      atSec: offset,
      preSec: finalPreSec,
      postSec: finalPostSec,
      liveStartTs: live.createdAtMs,
      livePermlink: live.permlink,
      sourceDisplayname,
    });

    if (!res.ok && res.reason === "duplicate") {
      return { ok: false, reason: "duplicate" };
    }

    return res;
  } catch (e: any) {
    return { ok: false, reason: e?.message || "unknown_error" };
  }
}

export function formatClipTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    (h > 0 ? String(h).padStart(2, "0") + ":" : "") +
    String(m).padStart(2, "0") +
    ":" +
    String(sec).padStart(2, "0")
  );
}

export function normalizeClipTitle(s: string): string {
  return String(s || "").trim().slice(0, 140);
}
