import type { Pool } from "pg";

export type ChatSettings = {
  allowLinks: boolean;
  followOnly: boolean;
  subOnly: boolean;

  // ✅ NEW: DLive
  dliveUsername: string | null;
  dliveSyncPublic: boolean;
  dliveSyncPopup: boolean;
};

export type ChatSettingsPatch = Partial<ChatSettings>;

const DEFAULTS: ChatSettings = {
  allowLinks: true,
  followOnly: false,
  subOnly: false,

  dliveUsername: null,
  dliveSyncPublic: false,
  dliveSyncPopup: false,
};

function toBool(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

function toTextOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, 64);
}

export async function getChatSettings(pool: Pool, streamerId: number): Promise<ChatSettings> {
  const r = await pool.query(
    `SELECT
       allow_links,
       follow_only,
       sub_only,
       dlive_username,
       dlive_sync_public,
       dlive_sync_popup
     FROM streamer_chat_settings
     WHERE streamer_id=$1
     LIMIT 1`,
    [streamerId]
  );

  if (!r.rows?.[0]) {
    await pool.query(
      `INSERT INTO streamer_chat_settings (streamer_id)
       VALUES ($1)
       ON CONFLICT (streamer_id) DO NOTHING`,
      [streamerId]
    );
    return { ...DEFAULTS };
  }

  const row = r.rows[0];
  return {
    allowLinks: !!row.allow_links,
    followOnly: !!row.follow_only,
    subOnly: !!row.sub_only,

    dliveUsername: row.dlive_username != null ? String(row.dlive_username) : null,
    dliveSyncPublic: !!row.dlive_sync_public,
    dliveSyncPopup: !!row.dlive_sync_popup,
  };
}

export async function patchChatSettings(
  pool: Pool,
  streamerId: number,
  patch: ChatSettingsPatch,
  actorUserId: number | null
): Promise<ChatSettings> {
  const allowLinks = patch.allowLinks != null ? toBool(patch.allowLinks) : null;
  const followOnly = patch.followOnly != null ? toBool(patch.followOnly) : null;
  const subOnly = patch.subOnly != null ? toBool(patch.subOnly) : null;

  const dliveSyncPublic = patch.dliveSyncPublic != null ? toBool(patch.dliveSyncPublic) : null;
  const dliveSyncPopup = patch.dliveSyncPopup != null ? toBool(patch.dliveSyncPopup) : null;

  // ⚠️ distinction importante :
  // - undefined => ne change pas
  // - null => efface
  const dliveUsernameProvided = Object.prototype.hasOwnProperty.call(patch, "dliveUsername");
  const dliveUsername = dliveUsernameProvided ? toTextOrNull((patch as any).dliveUsername) : undefined;

  const noBoolChange =
    allowLinks == null &&
    followOnly == null &&
    subOnly == null &&
    dliveSyncPublic == null &&
    dliveSyncPopup == null;

  const noUserChange = !dliveUsernameProvided;

  if (noBoolChange && noUserChange) {
    return await getChatSettings(pool, streamerId);
  }

  await pool.query(
    `INSERT INTO streamer_chat_settings (streamer_id)
     VALUES ($1)
     ON CONFLICT (streamer_id) DO NOTHING`,
    [streamerId]
  );

  const r = await pool.query(
    `UPDATE streamer_chat_settings
     SET
       allow_links       = COALESCE($2, allow_links),
       follow_only       = COALESCE($3, follow_only),
       sub_only          = COALESCE($4, sub_only),
       dlive_sync_public = COALESCE($5, dlive_sync_public),
       dlive_sync_popup  = COALESCE($6, dlive_sync_popup),
       dlive_username    = CASE WHEN $7::boolean THEN $8::text ELSE dlive_username END,
       updated_at = now(),
       updated_by_user_id = $9
     WHERE streamer_id=$1
     RETURNING
       allow_links, follow_only, sub_only,
       dlive_username, dlive_sync_public, dlive_sync_popup`,
    [
      streamerId,
      allowLinks,
      followOnly,
      subOnly,
      dliveSyncPublic,
      dliveSyncPopup,
      dliveUsernameProvided,          // $7
      dliveUsername ?? null,          // $8
      actorUserId,                    // $9
    ]
  );

  const row = r.rows?.[0];
  return {
    allowLinks: !!row.allow_links,
    followOnly: !!row.follow_only,
    subOnly: !!row.sub_only,

    dliveUsername: row.dlive_username != null ? String(row.dlive_username) : null,
    dliveSyncPublic: !!row.dlive_sync_public,
    dliveSyncPopup: !!row.dlive_sync_popup,
  };
}

export function roleLabelFr(role: "mod" | "streamer" | "admin" | string | undefined | null) {
  if (role === "admin") return "admin";
  if (role === "streamer") return "propriétaire";
  if (role === "mod") return "modérateur";
  return "viewer";
}

export function formatSettingsChangeMessage(opts: {
  actorUsername: string;
  actorRole: string;
  changed: ChatSettingsPatch;
}) {
  const who = opts.actorUsername || "Quelqu’un";
  const role = roleLabelFr(opts.actorRole);

  const parts: string[] = [];

  if (opts.changed.allowLinks != null) {
    parts.push(opts.changed.allowLinks ? "a activé les liens" : "a désactivé les liens");
  }
  if (opts.changed.followOnly != null) {
    parts.push(opts.changed.followOnly ? "a activé le mode follow-only" : "a désactivé le mode follow-only");
  }
  if (opts.changed.subOnly != null) {
    parts.push(opts.changed.subOnly ? "a activé le mode sub-only" : "a désactivé le mode sub-only");
  }

  if ((opts.changed as any).dliveSyncPublic != null) {
    parts.push((opts.changed as any).dliveSyncPublic ? "a activé la sync DLive (public)" : "a désactivé la sync DLive (public)");
  }
  if ((opts.changed as any).dliveSyncPopup != null) {
    parts.push((opts.changed as any).dliveSyncPopup ? "a activé la sync DLive (popup)" : "a désactivé la sync DLive (popup)");
  }
  if (Object.prototype.hasOwnProperty.call(opts.changed, "dliveUsername")) {
    const v = (opts.changed as any).dliveUsername;
    parts.push(v ? `a défini le pseudo DLive : ${v}` : "a effacé le pseudo DLive");
  }

  const action = parts.length ? parts.join(" • ") : "a modifié les options du chat";
  return `⚙️ ${who} (${role}) ${action}.`;
}

// détection lien simple MVP
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s]+|(?:\b(?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s]*)?/i;

export function containsLink(text: string) {
  return URL_RE.test(String(text || ""));
}
