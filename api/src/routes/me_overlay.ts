import { Router } from "express";

export const meOverlayRouter = Router();

// stock MVP en mémoire (on branchera DB ensuite)
const byUser = new Map<number, any>();

function deepMerge(a: any, b: any) {
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out: any = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b ?? a;
}

function getUserId(req: any): number {
  // requireAuth chez toi met déjà req.user
  const id = Number(req.user?.id ?? req.userId ?? 0);
  return Number.isFinite(id) ? id : 0;
}

meOverlayRouter.get("/widgets-config", (req, res) => {
  const uid = getUserId(req);
  const cfg = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  return res.json({ ok: true, config: cfg });
});

meOverlayRouter.post("/widgets-config", (req, res) => {
  const uid = getUserId(req);
  const patch = req.body ?? {};
  const prev = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  const next = deepMerge(prev, patch);
  byUser.set(uid, next);
  return res.json({ ok: true });
});

meOverlayRouter.post("/view-config", (req, res) => {
  // compat NozeBot: on stocke aussi (optionnel)
  const uid = getUserId(req);
  const payload = req.body ?? {};
  const prev = byUser.get(uid) ?? { chat: {}, goal: {}, viewers: {}, alerts: {} };
  const next = deepMerge(prev, { view: payload });
  byUser.set(uid, next);
  return res.json({ ok: true });
});
