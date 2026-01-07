// api/src/routes/calls.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

import { getCallsSettings, resetCalls, deleteCallById, effectiveLimit } from "../calls/queue.js";
import { normText, keyText } from "../calls/normalize.js";
import { normalizeProvider } from "../calls/provider_aliases.js";
import { resolveSlot } from "../calls/catalog.js";

export const callsRouter = express.Router();

// helper: slug -> streamer meta
async function getStreamerBySlug(slug: string) {
  const s = String(slug || "").trim();
  if (!s) return null;
  const r = await pool.query(
    `SELECT id, slug, user_id AS "ownerUserId"
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [s]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: String(row.slug),
    ownerUserId: row.ownerUserId != null ? Number(row.ownerUserId) : null,
  };
}

function canModOnStreamer(user: any, meta: { ownerUserId: number | null }) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (meta.ownerUserId != null && Number(meta.ownerUserId) === Number(user.id)) return true;
  return false;
}

async function ensureProviderPolicyRow(streamerId: number) {
  await pool.query(
    `
    INSERT INTO calls_provider_policy (streamer_id, mode)
    VALUES ($1, 'allow_all')
    ON CONFLICT (streamer_id) DO NOTHING
    `,
    [streamerId]
  );
}

// ──────────────────────────────────────────
// Settings (public-ish read) + admin patch
// ──────────────────────────────────────────

callsRouter.get("/:slug/config", async (req, res) => {
  try {
    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const s = await getCallsSettings(pool, meta.id);
    res.json({
      ok: true,
      config: {
        enabled: s.enabled,
        allowListec: s.allowListec,
        listecMax: s.listecMax,
        perUserLimit: s.perUserLimit,
        showCmdInChat: s.showCmdInChat,
        showAcceptPublic: s.showAcceptPublic,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "config_failed") });
  }
});

callsRouter.patch("/:slug/config", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const p = req.body || {};
    const enabled = p.enabled != null ? !!p.enabled : null;
    const allowListec = p.allowListec != null ? !!p.allowListec : null;
    const showCmdInChat = p.showCmdInChat != null ? !!p.showCmdInChat : null;
    const showAcceptPublic = p.showAcceptPublic != null ? !!p.showAcceptPublic : null;

    const listecMax = p.listecMax != null ? Math.max(1, Math.min(50, Number(p.listecMax))) : null;
    const perUserLimitRaw = p.perUserLimit != null ? Number(p.perUserLimit) : null;
    const perUserLimit = perUserLimitRaw == null ? null : effectiveLimit(perUserLimitRaw);

    await pool.query(
      `
      INSERT INTO calls_settings (streamer_id)
      VALUES ($1)
      ON CONFLICT (streamer_id) DO NOTHING
      `,
      [meta.id]
    );

    await pool.query(
      `
      UPDATE calls_settings
      SET
        enabled = COALESCE($2, enabled),
        allow_listec = COALESCE($3, allow_listec),
        show_cmd_in_chat = COALESCE($4, show_cmd_in_chat),
        show_accept_public = COALESCE($5, show_accept_public),
        listec_max = COALESCE($6, listec_max),
        per_user_limit = COALESCE($7, per_user_limit),
        updated_at = NOW()
      WHERE streamer_id=$1
      `,
      [meta.id, enabled, allowListec, showCmdInChat, showAcceptPublic, listecMax, perUserLimit]
    );

    // miroir optionnel dans chat_settings (si ta table existe)
    if (showCmdInChat != null) {
      await pool.query(`
        DO $$
        BEGIN
          IF to_regclass('public.chat_settings') IS NOT NULL THEN
            INSERT INTO chat_settings (streamer_id, show_call_commands)
            VALUES (${meta.id}, ${showCmdInChat ? "TRUE" : "FALSE"})
            ON CONFLICT (streamer_id) DO UPDATE
              SET show_call_commands = EXCLUDED.show_call_commands;
          END IF;
        END $$;
      `);
    }

    const cfg = await getCallsSettings(pool, meta.id);
    res.json({ ok: true, config: cfg });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "patch_failed") });
  }
});

// ──────────────────────────────────────────
// Queue (list / reset / delete)
// ──────────────────────────────────────────

callsRouter.get("/:slug/list", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const limitRaw = Number(req.query.limit || 50);
    const offsetRaw = Number(req.query.offset || 0);

    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);

    const { rows } = await pool.query(
      `
      SELECT
        q.id::text AS id,
        q.slot_name AS "slotName",
        q.provider AS provider,
        q.username AS username,
        q.pos AS pos,
        sc.image_url AS "imageUrl"
      FROM calls_queue q
      LEFT JOIN slots_catalog sc
        ON sc.name_key = q.slot_key
      WHERE q.streamer_id = $1
      ORDER BY q.pos ASC
      LIMIT $2 OFFSET $3
      `,
      [meta.id, limit, offset]
    );

    const items = (rows || []).map((r: any) => ({
      id: String(r.id),
      slotName: String(r.slotName),
      provider: r.provider ? String(r.provider) : null,
      username: String(r.username),
      pos: Number(r.pos) || 0,
      imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    }));

    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "list_failed") });
  }
});

callsRouter.post("/:slug/reset", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    await resetCalls(pool, meta.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "reset_failed") });
  }
});

callsRouter.delete("/:slug/item/:id", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const ok = await deleteCallById(pool, meta.id, String(req.params.id));
    res.json({ ok: true, deleted: ok });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "delete_failed") });
  }
});

// ──────────────────────────────────────────
// Bans (user / slot / provider)
// ──────────────────────────────────────────

callsRouter.get("/:slug/bans", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const kind = String(req.query.kind || "").trim().toLowerCase();
    if (!["user", "slot", "provider"].includes(kind)) {
      return res.status(400).json({ ok: false, error: "bad_kind" });
    }

    const limitRaw = Number(req.query.limit || 200);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200));

    const { rows } = await pool.query(
      `
      SELECT id::text AS id, kind, ban_key AS "banKey", label, created_at AS "createdAt"
      FROM calls_bans
      WHERE streamer_id=$1 AND kind=$2
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [meta.id, kind, limit]
    );

    res.json({
      ok: true,
      items: (rows || []).map((r: any) => ({
        id: String(r.id),
        kind: String(r.kind),
        banKey: String(r.banKey),
        label: r.label ? String(r.label) : null,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "bans_failed") });
  }
});

callsRouter.post("/:slug/ban", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const body = req.body || {};
    const kind = String(body.kind || "").trim().toLowerCase();

    if (!["user", "slot", "provider"].includes(kind)) {
      return res.status(400).json({ ok: false, error: "bad_kind" });
    }

    let banKey = "";
    let label: string | null = null;

    if (kind === "user") {
      const username = String(body.username || "").trim();
      const userId = body.userId != null ? String(body.userId).trim() : "";
      const key = username ? username.toLowerCase() : userId;
      if (!key) return res.status(400).json({ ok: false, error: "missing_user" });
      banKey = key;
      label = username || null;
    }

    if (kind === "provider") {
      const raw = normText(body.provider || body.key || "");
      if (!raw) return res.status(400).json({ ok: false, error: "missing_provider" });
      const norm = normalizeProvider(raw);
      banKey = String(norm || raw).toLowerCase();
      label = String(norm || raw);
    }

    if (kind === "slot") {
      const slotName = normText(body.slotName || "");
      const slotKeyRaw = String(body.slotKey || "").trim();

      if (slotKeyRaw) {
        banKey = slotKeyRaw;
        label = body.label ? String(body.label) : null;
      } else if (slotName) {
        // résout via catalog si possible (pour être sûr de la key)
        const resolved = await resolveSlot(pool, slotName);
        if (resolved) {
          banKey = keyText(resolved.name);
          label = resolved.name;
        } else {
          banKey = keyText(slotName);
          label = slotName;
        }
      } else {
        return res.status(400).json({ ok: false, error: "missing_slot" });
      }
    }

    const r = await pool.query(
      `
      INSERT INTO calls_bans (streamer_id, kind, ban_key, label)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (streamer_id, kind, ban_key) DO NOTHING
      RETURNING id
      `,
      [meta.id, kind, banKey, label]
    );

    res.json({ ok: true, changed: !!r.rows?.[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "ban_failed") });
  }
});

callsRouter.post("/:slug/unban", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const body = req.body || {};
    const kind = String(body.kind || "").trim().toLowerCase();
    if (!["user", "slot", "provider"].includes(kind)) {
      return res.status(400).json({ ok: false, error: "bad_kind" });
    }

    const keys: string[] = Array.isArray(body.keys)
      ? body.keys.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [String(body.key || "").trim()].filter(Boolean);

    if (!keys.length) return res.status(400).json({ ok: false, error: "missing_key" });

    const r = await pool.query(
      `DELETE FROM calls_bans WHERE streamer_id=$1 AND kind=$2 AND ban_key = ANY($3::text[])`,
      [meta.id, kind, keys]
    );

    res.json({ ok: true, changed: Number(r.rowCount || 0) > 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "unban_failed") });
  }
});

// ──────────────────────────────────────────
// Provider policy (ban all providers except allowed list)
// ──────────────────────────────────────────

callsRouter.get("/:slug/provider-policy", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    await ensureProviderPolicyRow(meta.id);

    const pr = await pool.query(`SELECT mode FROM calls_provider_policy WHERE streamer_id=$1 LIMIT 1`, [meta.id]);
    const mode = String(pr.rows?.[0]?.mode || "allow_all");

    const ar = await pool.query(
      `SELECT provider_norm AS provider FROM calls_allowed_providers WHERE streamer_id=$1 ORDER BY provider_norm ASC`,
      [meta.id]
    );

    res.json({ ok: true, mode, allowed: (ar.rows || []).map((x: any) => String(x.provider)) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "policy_failed") });
  }
});

callsRouter.patch("/:slug/provider-policy", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const mode = String(req.body?.mode || "").trim().toLowerCase();
    if (!["allow_all", "allow_only"].includes(mode)) return res.status(400).json({ ok: false, error: "bad_mode" });

    await ensureProviderPolicyRow(meta.id);

    await pool.query(
      `UPDATE calls_provider_policy SET mode=$2, updated_at=NOW() WHERE streamer_id=$1`,
      [meta.id, mode]
    );

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "policy_patch_failed") });
  }
});

callsRouter.post("/:slug/provider-allow", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const raw: string[] = Array.isArray(req.body?.providers) ? req.body.providers : [];
    const providers = raw
      .map((x: any) => normText(x))
      .map((x: string) => (x ? normalizeProvider(x) || x : ""))
      .map((x: string) => x.toLowerCase())
      .filter(Boolean);

    if (!providers.length) return res.status(400).json({ ok: false, error: "missing_providers" });

    await ensureProviderPolicyRow(meta.id);

    for (const p of providers) {
      await pool.query(
        `
        INSERT INTO calls_allowed_providers (streamer_id, provider_norm)
        VALUES ($1,$2)
        ON CONFLICT (streamer_id, provider_norm) DO NOTHING
        `,
        [meta.id, p]
      );
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "allow_failed") });
  }
});

callsRouter.post("/:slug/provider-unallow", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const raw: string[] = Array.isArray(req.body?.providers) ? req.body.providers : [];
    const providers = raw
      .map((x: any) => normText(x))
      .map((x: string) => (x ? normalizeProvider(x) || x : ""))
      .map((x: string) => x.toLowerCase())
      .filter(Boolean);

    if (!providers.length) return res.status(400).json({ ok: false, error: "missing_providers" });

    const r = await pool.query(
      `DELETE FROM calls_allowed_providers WHERE streamer_id=$1 AND provider_norm = ANY($2::text[])`,
      [meta.id, providers]
    );

    res.json({ ok: true, changed: Number(r.rowCount || 0) > 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "unallow_failed") });
  }
});

callsRouter.post("/:slug/provider-allow-only", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const raw = normText(req.body?.provider || "");
    if (!raw) return res.status(400).json({ ok: false, error: "missing_provider" });

    const p = (normalizeProvider(raw) || raw).toLowerCase();

    await ensureProviderPolicyRow(meta.id);

    await pool.query("BEGIN");
    try {
      await pool.query(`UPDATE calls_provider_policy SET mode='allow_only', updated_at=NOW() WHERE streamer_id=$1`, [
        meta.id,
      ]);
      await pool.query(`DELETE FROM calls_allowed_providers WHERE streamer_id=$1`, [meta.id]);
      await pool.query(
        `
        INSERT INTO calls_allowed_providers (streamer_id, provider_norm)
        VALUES ($1,$2)
        ON CONFLICT (streamer_id, provider_norm) DO NOTHING
        `,
        [meta.id, p]
      );
      await pool.query("COMMIT");
    } catch (e) {
      try {
        await pool.query("ROLLBACK");
      } catch {}
      throw e;
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || "allow_only_failed") });
  }
});
