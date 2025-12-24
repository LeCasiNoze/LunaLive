//api/src/routes/cosmetics_catalog_routes.ts
import { Router } from "express";
import { COSMETICS_CATALOG } from "../cosmetics_catalog.js";

export const cosmeticsCatalogRoutes = Router();

cosmeticsCatalogRoutes.get("/cosmetics/catalog", (_req, res) => {
  res.json({
    ok: true,
    items: COSMETICS_CATALOG.filter((x) => x.active),
  });
});
