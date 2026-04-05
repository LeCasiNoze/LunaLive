// api/src/routes/public-slots.ts
// Route publique pour accéder aux slots depuis un projet extérieur

import express from "express";
import { pool } from "../db.js";
import { searchSlots, resolveSlot } from "../calls/catalog.js";
import { handleCallsCommand } from "../calls/commands.js";
import { parseBangCommand } from "../calls/commands.js";

export const publicSlotsRouter = express.Router();

// GET /api/public/slots/search?q=...&limit=...
// Recherche publique de slots
publicSlotsRouter.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.max(1, Math.min(20, Number(req.query.limit || 10)));
    if (!q) return res.json({ ok: true, items: [] });

    const items = await searchSlots(pool, q, limit);
    res.json({ ok: true, items });
  } catch (e: any) {
    res.json({ ok: false, error: String(e?.message || "search_failed") });
  }
});

// POST /api/public/slots/call
// Simule une commande !call [slot] pour un streamer spécifique
publicSlotsRouter.post("/call", async (req, res) => {
  try {
    const { streamerId, userId, username, command } = req.body;

    if (!streamerId || !userId || !username || !command) {
      return res.json({ 
        ok: false, 
        error: "missing_parameters",
        message: "streamerId, userId, username et command sont requis" 
      });
    }

    // Parser la commande
    const parsed = parseBangCommand(command);
    if (!parsed || parsed.cmd !== "call") {
      return res.json({ 
        ok: false, 
        error: "invalid_command",
        message: "Commande doit être de la forme '!call [nom_machine]'" 
      });
    }

    // Résoudre le slot (sans ajouter en file)
    const resolved = await resolveSlot(pool, parsed.arg);
    if (!resolved) {
      return res.json({ 
        ok: false, 
        error: "slot_not_found",
        message: "Machine introuvable. Essayez un nom plus précis.",
        query: parsed.arg
      });
    }

    // Retourner le slot trouvé
    res.json({ 
      ok: true, 
      slot: resolved,
      message: `Machine trouvée: ${resolved.name}${resolved.provider ? ` (${resolved.provider})` : ""}`,
      originalQuery: parsed.arg
    });

  } catch (e: any) {
    res.json({ 
      ok: false, 
      error: "server_error", 
      message: String(e?.message || "Erreur serveur") 
    });
  }
});

// POST /api/public/slots/resolve
// Résout un nom de slot (alias de /call mais sans validation de commande)
publicSlotsRouter.post("/resolve", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.json({ 
        ok: false, 
        error: "missing_query",
        message: "Le paramètre 'query' est requis" 
      });
    }

    const resolved = await resolveSlot(pool, query.trim());
    if (!resolved) {
      return res.json({ 
        ok: false, 
        error: "slot_not_found",
        message: "Machine introuvable. Essayez un nom plus précis.",
        query: query.trim()
      });
    }

    res.json({ 
      ok: true, 
      slot: resolved,
      message: `Machine trouvée: ${resolved.name}${resolved.provider ? ` (${resolved.provider})` : ""}`
    });

  } catch (e: any) {
    res.json({ 
      ok: false, 
      error: "server_error", 
      message: String(e?.message || "Erreur serveur") 
    });
  }
});
