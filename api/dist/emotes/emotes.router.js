// api/src/emotes/emotes.router.ts
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { getStreamerIdBySlug, listActiveEmotesForChat, listFavorites, addFavorite, removeFavorite, } from "./emotes.store.js";
export const emotesRouter = express.Router();
function toItem(e) {
    return {
        id: e.id,
        kind: e.kind,
        scope: e.scope,
        name: e.name,
        label: e.label ?? e.name,
        url: e.url,
        char: null, // (si un jour tu stockes des unicode natifs en DB)
    };
}
// Catalogue emotes pour un chat (viewer)
emotesRouter.get("/chat/:slug/emotes", requireAuth, async (req, res) => {
    try {
        const slug = String(req.params.slug || "").trim();
        if (!slug)
            return res.status(400).json({ ok: false, error: "bad_slug" });
        const streamerId = await getStreamerIdBySlug(pool, slug);
        if (!streamerId) {
            return res.json({ ok: true, streamerId: null, channel: [], global: [], native: [], favorites: [] });
        }
        const [rows, favRows] = await Promise.all([
            listActiveEmotesForChat(pool, streamerId),
            listFavorites(pool, req.user.id),
        ]);
        const channel = rows.filter((x) => x.scope === "channel").map(toItem);
        const global = rows.filter((x) => x.scope === "global").map(toItem);
        const native = rows.filter((x) => x.scope === "native").map(toItem);
        const favorites = favRows.map(toItem);
        res.json({ ok: true, streamerId, channel, global, native, favorites });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// Favoris viewer
emotesRouter.post("/me/emotes/favorites/:id", requireAuth, async (req, res) => {
    try {
        const emoteId = Number(req.params.id);
        if (!emoteId)
            return res.status(400).json({ ok: false, error: "bad_id" });
        await addFavorite(pool, req.user.id, emoteId);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
});
emotesRouter.delete("/me/emotes/favorites/:id", requireAuth, async (req, res) => {
    try {
        const emoteId = Number(req.params.id);
        if (!emoteId)
            return res.status(400).json({ ok: false, error: "bad_id" });
        await removeFavorite(pool, req.user.id, emoteId);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
