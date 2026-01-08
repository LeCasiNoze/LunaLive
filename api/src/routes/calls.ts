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
        syncHunt: s.syncHunt, // ✅ NEW
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
    const syncHunt = p.syncHunt != null ? !!p.syncHunt : null; // ✅ NEW

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
        sync_hunt = COALESCE($8, sync_hunt),
        updated_at = NOW()
      WHERE streamer_id=$1
      `,
      [meta.id, enabled, allowListec, showCmdInChat, showAcceptPublic, listecMax, perUserLimit, syncHunt]
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
        sc.image_url AS "imageUrl",

        q.bet AS "bet",
        q.pay AS "pay",
        q.bounty AS "bounty"
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

      bet: r.bet == null ? null : Number(r.bet),
      pay: r.pay == null ? null : Number(r.pay),
      bounty: typeof r.bounty === "boolean" ? r.bounty : (r.bounty ?? null),
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

/* ──────────────────────────────────────────────────────────
   BANS (Call & Hunt)
   ────────────────────────────────────────────────────────── */

callsRouter.get("/:slug/bans", requireAuth, async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const { rows } = await pool.query(
      `
      SELECT kind, ban_key AS "banKey", note, created_at AS "createdAt"
      FROM calls_bans
      WHERE streamer_id=$1
      ORDER BY created_at DESC
      `,
      [meta.id]
    );

    const slotKeys = (rows || [])
      .filter((r: any) => String(r.kind) === "slot")
      .map((r: any) => String(r.banKey))
      .filter(Boolean);

    let slotMeta = new Map<string, { name: string; provider: string | null; imageUrl: string | null }>();
    if (slotKeys.length) {
      const { rows: srows } = await pool.query(
        `
        SELECT name_key AS "slotKey", name, provider_norm AS "provider", image_url AS "imageUrl"
        FROM slots_catalog
        WHERE name_key = ANY($1::text[])
        `,
        [slotKeys]
      );
      for (const r of srows || []) {
        slotMeta.set(String(r.slotKey), {
          name: String(r.name),
          provider: r.provider ? String(r.provider) : null,
          imageUrl: r.imageUrl ? String(r.imageUrl) : null,
        });
      }
    }

    const out = {
      users: [] as any[],
      providers: [] as any[],
      slots: [] as any[],
    };

    for (const r of rows || []) {
      const kind = String((r as any).kind);
      const banKey = String((r as any).banKey);
      const note = (r as any).note != null ? String((r as any).note) : null;

      if (kind === "user") out.users.push({ username: banKey, note });
      else if (kind === "provider") out.providers.push({ provider: banKey, note });
      else if (kind === "slot") {
        const sm = slotMeta.get(banKey);
        out.slots.push({
          slotKey: banKey,
          name: sm?.name ?? banKey,
          provider: sm?.provider ?? null,
          imageUrl: sm?.imageUrl ?? null,
          note,
        });
      }
    }

    res.json({ ok: true, bans: out });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "bans_failed") });
  }
});

callsRouter.post("/:slug/ban", requireAuth, express.json(), async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const p = req.body || {};
    const kind = String(p.kind || "").trim();
    const note = p.note != null ? String(p.note).trim() : null;

    if (!["user", "slot", "provider"].includes(kind)) {
      return res.json({ ok: false, error: "bad_kind" });
    }

    // value (ou slotKey)
    const value = String(p.value || "").trim();
    const slotKeyOverride = String(p.slotKey || "").trim();

    let banKey = "";

    if (kind === "user") {
      banKey = value.toLowerCase();
      if (!banKey) return res.json({ ok: false, error: "missing_user" });
    } else if (kind === "provider") {
      const prov = normalizeProvider(value);
      banKey = String(prov || "").trim().toLowerCase();
      if (!banKey) return res.json({ ok: false, error: "missing_provider" });
    } else if (kind === "slot") {
      if (slotKeyOverride) {
        banKey = slotKeyOverride;
      } else {
        const nm = normText(value);
        const k = keyText(nm);
        banKey = k;
      }
      if (!banKey) return res.json({ ok: false, error: "missing_slot" });
    }

    await pool.query(
      `
      INSERT INTO calls_bans (streamer_id, kind, ban_key, note, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (streamer_id, kind, ban_key) DO UPDATE
        SET note = COALESCE(EXCLUDED.note, calls_bans.note)
      `,
      [meta.id, kind, banKey, note, u?.id != null ? Number(u.id) : null]
    );

    res.json({ ok: true });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "ban_failed") });
  }
});

callsRouter.post("/:slug/unban", requireAuth, express.json(), async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    const p = req.body || {};
    const kind = String(p.kind || "").trim();
    const values: string[] = Array.isArray(p.values) ? p.values.map((x: any) => String(x || "").trim()).filter(Boolean) : [];

    if (!["user", "slot", "provider"].includes(kind)) {
      return res.json({ ok: false, error: "bad_kind" });
    }
    if (!values.length) return res.json({ ok: false, error: "empty_values" });

    await pool.query(
      `
      DELETE FROM calls_bans
      WHERE streamer_id=$1 AND kind=$2 AND ban_key = ANY($3::text[])
      `,
      [meta.id, kind, values]
    );

    res.json({ ok: true });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "unban_failed") });
  }
});

/* ──────────────────────────────────────────────────────────
   PROVIDER POLICY (allow_all / allow_only)
   ────────────────────────────────────────────────────────── */

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
      `SELECT provider_norm FROM calls_allowed_providers WHERE streamer_id=$1 ORDER BY provider_norm ASC`,
      [meta.id]
    );
    const allowedProviders = (ar.rows || []).map((x: any) => String(x.provider_norm));

    res.json({ ok: true, mode, allowedProviders });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "policy_failed") });
  }
});

callsRouter.patch("/:slug/provider-policy", requireAuth, express.json(), async (req: any, res) => {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

    const meta = await getStreamerBySlug(String(req.params.slug));
    if (!meta) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!canModOnStreamer(u, meta)) return res.status(403).json({ ok: false, error: "forbidden" });

    await ensureProviderPolicyRow(meta.id);

    const p = req.body || {};
    const mode = String(p.mode || "").trim();
    if (!["allow_all", "allow_only"].includes(mode)) {
      return res.json({ ok: false, error: "bad_mode" });
    }

    await pool.query(
      `
      UPDATE calls_provider_policy
      SET mode=$2, updated_at=NOW()
      WHERE streamer_id=$1
      `,
      [meta.id, mode]
    );

    // replace allowlist si fourni
    if (Array.isArray(p.allowedProviders)) {
      const cleaned = p.allowedProviders
        .map((x: any) => normalizeProvider(String(x || "")))
        .map((x: any) => String(x || "").trim())
        .filter(Boolean);

      // dedup + stable
      const uniq = Array.from(new Set(cleaned));

      await pool.query(`DELETE FROM calls_allowed_providers WHERE streamer_id=$1`, [meta.id]);

      if (uniq.length) {
        const values: any[] = [];
        const chunks: string[] = [];
        let i = 1;
        for (const prov of uniq) {
          values.push(meta.id, prov);
          chunks.push(`($${i++}, $${i++})`);
        }
        await pool.query(
          `
          INSERT INTO calls_allowed_providers (streamer_id, provider_norm)
          VALUES ${chunks.join(",")}
          ON CONFLICT (streamer_id, provider_norm) DO NOTHING
          `,
          values
        );
      }
    }

    const pr = await pool.query(`SELECT mode FROM calls_provider_policy WHERE streamer_id=$1 LIMIT 1`, [meta.id]);
    const outMode = String(pr.rows?.[0]?.mode || "allow_all");

    const ar = await pool.query(
      `SELECT provider_norm FROM calls_allowed_providers WHERE streamer_id=$1 ORDER BY provider_norm ASC`,
      [meta.id]
    );
    const allowedProviders = (ar.rows || []).map((x: any) => String(x.provider_norm));

    res.json({ ok: true, mode: outMode, allowedProviders });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "policy_patch_failed") });
  }
});
