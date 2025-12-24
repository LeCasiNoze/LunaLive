import { Router } from "express";
import { COSMETICS_CATALOG } from "../cosmetics_catalog";

export const cosmeticsCatalogRoutes = Router();

cosmeticsCatalogRoutes.get("/cosmetics/catalog", (_req, res) => {
  res.json({
    ok: true,
    items: COSMETICS_CATALOG.filter((x) => x.active),
  });
});
