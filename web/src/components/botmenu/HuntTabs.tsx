// web/src/components/botmenu/HuntTab.tsx
import * as React from "react";
import { SlotThumb } from "./SlotThumb";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type HuntStateResp = {
  ok: boolean;
  mode: "farm" | "open";
  hunt: { phase: string; opened: boolean; start: number | null; archive_id: number | null; itemsCount: number };
  currentCall: null | {
    id: string;
    slotName: string;
    slotKey: string;
    provider: string | null;
    username: string;
    pos: number;
    imageUrl: string | null;
  };
  currentOpenItem: null | {
    id: string;
    name: string;
    provider: string | null;
    image_url: string | null;
    bet: number | null;
    caller: string | null;
    pos: number;
  };
};

type CallItem = {
  id: string;
  slotName: string;
  provider: string | null;
  username: string;
  pos: number;
  imageUrl?: string | null;
};

async function readJsonSafe(r: Response): Promise<any> {
  const text = await r.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 180) || "invalid_json" };
  }
}

function toast(kind: "success" | "error", title: string, message?: string) {
  window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind, title, message } }));
}

export function HuntTab({
  token,
  slug,
  canMod,
  onRequireLogin,
}: {
  token: string | null;
  slug: string;
  canMod: boolean;
  onRequireLogin: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [state, setState] = React.useState<HuntStateResp | null>(null);

  const [bet, setBet] = React.useState("");
  const [pay, setPay] = React.useState("");

  // ✅ même source de vérité que "File"
  const [calls, setCalls] = React.useState<CallItem[]>([]);
  const [callsLoading, setCallsLoading] = React.useState(false);

  async function loadState(opts?: { silent?: boolean }) {
    if (!token) return;
    const silent = !!opts?.silent;

    if (!silent) setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/hunt/state`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await readJsonSafe(r)) as HuntStateResp;

      if (r.ok && j?.ok) setState(j);
      else if (!silent) setState(null);
    } catch {
      if (!silent) setState(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadQueue(opts?: { silent?: boolean }) {
    if (!token) return;
    const silent = !!opts?.silent;

    if (!silent) setCallsLoading(true);
    try {
      const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/list?limit=80`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await readJsonSafe(r);

      if (r.ok && j?.ok && Array.isArray(j.items)) setCalls(j.items || []);
      else if (!silent) setCalls([]);
    } catch {
      if (!silent) setCalls([]);
    } finally {
      if (!silent) setCallsLoading(false);
    }
  }

  async function loadAll(opts?: { silent?: boolean }) {
    await Promise.all([loadState(opts), loadQueue(opts)]);
  }

  React.useEffect(() => {
    if (!canMod || !token) return;

    void loadAll({ silent: false });

    const t = window.setInterval(() => void loadAll({ silent: true }), 2500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMod, token, slug]);

  async function post(path: string, body?: any) {
    if (!token) return onRequireLogin();

    const r = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : "{}",
    });

    const j = await readJsonSafe(r);

    if (!r.ok || !j?.ok) {
      toast("error", "Erreur", j?.error || j?.message || `HTTP ${r.status}`);
      return;
    }

    await loadAll();
  }

  async function doResetQueue() {
    if (!token) return onRequireLogin();
    const ok = window.confirm("Reset la file de calls ?");
    if (!ok) return;

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await readJsonSafe(r);

    if (r.ok && j?.ok) {
      toast("success", "Calls reset ✅");
      await loadAll();
    } else {
      toast("error", "Erreur", j?.error || "reset_failed");
    }
  }

  async function doDeleteCall(id: string) {
    if (!token) return onRequireLogin();

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/item/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await readJsonSafe(r);

    if (r.ok && j?.ok) {
      await loadAll();
    } else {
      toast("error", "Erreur", j?.error || "delete_failed");
    }
  }

  if (!canMod) {
    return <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>Accès réservé aux modérateurs / streamer / admin.</div>;
  }
  if (!token) {
    return <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>Connecte-toi pour accéder au Hunt.</div>;
  }

  const mode = state?.mode || "farm";

  // ✅ fallback UI -> si le backend ne renvoie pas currentCall,
  // on prend la 1ère machine de la file
  const headFromQueue = calls[0]
    ? {
        id: calls[0].id,
        slotName: calls[0].slotName,
        provider: calls[0].provider,
        username: calls[0].username,
        pos: calls[0].pos,
        imageUrl: calls[0].imageUrl ?? null,
      }
    : null;

  const headCall = state?.currentCall || (headFromQueue as any);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 950 }}>Hunt</div>
        <button
          type="button"
          onClick={() => void loadAll()}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {loading || callsLoading ? "…" : "Refresh"}
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
        Mode: <b>{mode === "farm" ? "Farm (calls → bets)" : "Open (pays)"}</b> · Items hunt:{" "}
        <b>{state?.hunt?.itemsCount ?? "—"}</b>
      </div>

      <button
        type="button"
        onClick={() => post(`/calls/${encodeURIComponent(slug)}/hunt/open`)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(124,77,255,0.18)",
          color: "white",
          fontWeight: 950,
          cursor: "pointer",
        }}
      >
        🔓 Ouvrir le hunt
      </button>

      {mode === "farm" ? (
        <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Machine en cours (head call)</div>

          {!headCall ? (
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Aucun call en file.</div>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <SlotThumb url={headCall.imageUrl} size={54} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {headCall.slotName}
                  {headCall.provider ? <span style={{ opacity: 0.75, fontWeight: 800 }}> — {headCall.provider}</span> : null}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>call par @{headCall.username}</div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <input
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              placeholder="bet (ex: 0.6)"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.12)",
                color: "inherit",
                fontWeight: 800,
              }}
            />

            <button
              type="button"
              onClick={() => post(`/calls/${encodeURIComponent(slug)}/hunt/pass`)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,120,150,0.12)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              Pass
            </button>

            <button
              type="button"
              onClick={() => {
                const b = Number(String(bet).replace(",", "."));
                if (!(b > 0)) {
                  toast("error", "Bet invalide");
                  return;
                }
                void post(`/calls/${encodeURIComponent(slug)}/hunt/bonus`, { bet: b });
                setBet("");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(124,77,255,0.18)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              Bonus
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
            Astuce: tu peux aussi faire <b>!bonus 0.6</b> dans le chat.
          </div>
        </div>
      ) : (
        <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Machine en cours (open)</div>

          {!state?.currentOpenItem ? (
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Plus d’item à payer.</div>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <SlotThumb url={state.currentOpenItem.image_url} size={54} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {state.currentOpenItem.name}
                  {state.currentOpenItem.provider ? <span style={{ opacity: 0.75, fontWeight: 800 }}> — {state.currentOpenItem.provider}</span> : null}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                  bet: <b>{state.currentOpenItem.bet ?? "—"}</b> · caller: <b>@{state.currentOpenItem.caller ?? "—"}</b>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <input
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              placeholder="pay (ex: 120)"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.12)",
                color: "inherit",
                fontWeight: 800,
              }}
            />

            <button
              type="button"
              onClick={() => {
                const p = Number(String(pay).replace(",", "."));
                if (!(p >= 0)) {
                  toast("error", "Pay invalide");
                  return;
                }
                void post(`/calls/${encodeURIComponent(slug)}/hunt/pay`, { pay: p });
                setPay("");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(124,77,255,0.18)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              Valider pay
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
            Astuce: tu peux aussi faire <b>!pay 120</b> dans le chat.
          </div>
        </div>
      )}

      {/* ✅ LA FILE */}
      <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 950 }}>File de calls (même source)</div>
          <button
            type="button"
            onClick={() => void doResetQueue()}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,120,150,0.12)",
              color: "white",
              fontWeight: 950,
              cursor: "pointer",
            }}
          >
            Reset file
          </button>
        </div>

        {!calls.length ? (
          callsLoading ? (
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Chargement…</div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Aucun call.</div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {callsLoading ? (
              <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 800, marginBottom: 2 }}>Mise à jour…</div>
            ) : null}

            {calls.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                  <SlotThumb url={c.imageUrl} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.pos}. {c.slotName}
                      {c.provider ? <span style={{ opacity: 0.75, fontWeight: 800 }}> — {c.provider}</span> : null}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>@ {c.username}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void doDeleteCall(c.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,120,150,0.12)",
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
