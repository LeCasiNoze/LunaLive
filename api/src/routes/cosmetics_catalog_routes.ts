// api/src/routes/cosmetics_catalog_routes.ts
import { Router } from "express";
import { COSMETICS_CATALOG } from "../cosmetics/catalog.js"; // ✅ IMPORTANT (catalog unique)

export const cosmeticsCatalogRoutes = Router();

cosmeticsCatalogRoutes.get("/cosmetics/catalog", (_req, res) => {
  res.json({
    ok: true,
    items: COSMETICS_CATALOG.filter((x) => x && x.active),
  });
});
