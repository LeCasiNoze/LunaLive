// web/src/components/botmenu/CallTab.tsx
import * as React from "react";
import { SlotThumb } from "./SlotThumb";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type SlotItem = { name: string; provider: string | null; imageUrl?: string | null };

type CallItem = {
  id: string;
  slotName: string;
  provider: string | null;
  username: string;
  pos: number;
  imageUrl?: string | null;
};

const CALLS_QUEUE_CHANGED_EVT = "calls:queue-changed";

type CallsQueueChangedDetail = {
  slug?: string;
  removedId?: string | null;
  action?: "bonus" | "pass" | "delete" | "reset" | string;
};

export function CallTab({
  token,
  slug,
  canMod,
  onClose,
  onRequireLogin,
  sendBang,
}: {
  token: string | null;
  slug: string;
  canMod: boolean;
  onClose: () => void;
  onRequireLogin: () => void;
  sendBang: (text: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<SlotItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  // ✅ Queue intégrée (ancien QueueTab)
  const [calls, setCalls] = React.useState<CallItem[]>([]);
  const [callsLoading, setCallsLoading] = React.useState(false);

  const isAuthed = !!token;

  // ✅ PayCall (pcall) UI state
  const [pcallUnlocked, setPcallUnlocked] = React.useState<boolean>(false);
  const [pcallNextAtMs, setPcallNextAtMs] = React.useState<number>(0);
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());

  function msToMinLeft(ms: number) {
    const n = Math.max(0, ms);
    return Math.max(1, Math.ceil(n / 60000));
  }

  const pcallOnCooldown = pcallNextAtMs > 0 && nowMs < pcallNextAtMs;
  const pcallLeftMin = pcallOnCooldown ? msToMinLeft(pcallNextAtMs - nowMs) : 0;

  function toast(kind: "success" | "error" | "info", title: string, message?: string) {
    window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind, title, message } }));
  }

  function goShopSubs() {
    try {
      localStorage.setItem("shop:openTab", "subs");
    } catch {}
    window.location.href = "/shop";
  }

  // tick pour afficher cooldown temps réel
  React.useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  async function loadPcallStatus() {
    if (!token) return;
    try {
      const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/pcall/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (j?.ok) {
        setPcallUnlocked(!!j.unlocked);
        setPcallNextAtMs(Number(j.nextAtMs || 0));
      }
    } catch {
      // silence
    }
  }

  async function fetchSuggestions(text: string) {
    const s = String(text || "").trim();
    if (s.length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      // ✅ FIX 401: on envoie le Bearer token (l'API exige l'auth ici)
      const r = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(s)}&limit=10`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const j = await r.json();
      if (j?.ok) setItems(j.items || []);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadQueue() {
    if (!token) return;
    if (!canMod) return;
    setCallsLoading(true);
    try {
      // ✅ IMPORTANT: /list est maintenant “calls only” (pas bonus)
      const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/list?limit=80`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (j?.ok) setCalls(j.items || []);
      else setCalls([]);
    } catch {
      setCalls([]);
    } finally {
      setCallsLoading(false);
    }
  }

  async function doReset() {
    if (!token) return onRequireLogin();
    if (!canMod) return;

    const ok = window.confirm("Reset la file de calls ?");
    if (!ok) return;

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());

    if (r?.ok) {
      toast("success", "Calls reset ✅");
      await loadQueue();
    } else {
      toast("error", "Erreur", r?.error || "reset_failed");
    }
  }

  async function doDelete(id: string) {
    if (!token) return onRequireLogin();
    if (!canMod) return;

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/item/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());

    if (r?.ok) {
      await loadQueue();
    } else {
      toast("error", "Erreur", r?.error || "delete_failed");
    }
  }

  async function doPcall(slotName: string) {
    const t = String(slotName || "").trim();
    if (!t) return;

    // pas débloqué => redirect shop abonnements
    if (!pcallUnlocked) {
      onClose();
      goShopSubs();
      return;
    }

    // cooldown => toast et on ne ferme pas forcément
    if (pcallOnCooldown) {
      toast("error", "Pay Call en cooldown", `Reviens dans ${pcallLeftMin} min.`);
      return;
    }

    // envoi cmd
    sendBang(`!pcall ${t}`);
    onClose();

    // optimiste: bloque local 1h30 + refresh status best-effort
    const optimistic = Date.now() + 90 * 60 * 1000;
    setPcallNextAtMs(optimistic);
    window.setTimeout(() => void loadPcallStatus(), 800);
  }

  // debounce suggestions
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      fetchSuggestions(q).catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [q]); // volontaire

  // load pcall status
  React.useEffect(() => {
    if (token) void loadPcallStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, slug]);

  // ✅ auto load queue quand on ouvre CallTab
  React.useEffect(() => {
    if (token && canMod) void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canMod, slug]);

  // ✅ SYNC: si Hunt valide un bonus (ou pass), on refresh la queue sans action manuelle
  React.useEffect(() => {
    function onQueueChanged(ev: Event) {
      const ce = ev as CustomEvent;
      const detail = (ce?.detail || {}) as CallsQueueChangedDetail;

      if (detail?.slug && String(detail.slug) !== String(slug)) return;

      // best-effort: remove optimiste immédiat (ça évite le flash si le fetch prend 300ms)
      if (detail?.removedId) {
        const rid = String(detail.removedId);
        setCalls((prev) => prev.filter((c) => String(c.id) !== rid));
      }

      // source de vérité : reload depuis l'API (positions correctes)
      if (token && canMod) void loadQueue();
    }

    window.addEventListener(CALLS_QUEUE_CHANGED_EVT, onQueueChanged as any);
    return () => window.removeEventListener(CALLS_QUEUE_CHANGED_EVT, onQueueChanged as any);
  }, [slug, token, canMod]);

  return (
    <>
      {!isAuthed ? (
        <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", opacity: 0.9 }}>
          <div style={{ fontWeight: 950 }}>Connecte-toi pour utiliser le bot</div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onRequireLogin();
            }}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(124,77,255,0.22)",
              color: "white",
              fontWeight: 950,
              cursor: "pointer",
            }}
          >
            Se connecter
          </button>
        </div>
      ) : (
        <>
          {/* ===== CALL (suggestions) ===== */}
          <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 8 }}>Choisis une machine :</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tape le nom…"
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              outline: "none",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              fontWeight: 800,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const text = q.trim();
                if (!text) return;
                sendBang(`!call ${text}`);
                onClose();
              }
            }}
          />

          {/* ===== PCALL action ===== */}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                const text = q.trim();
                if (!text) return;
                void doPcall(text);
              }}
              style={{
                flex: 1,
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: !pcallUnlocked
                  ? "rgba(255,255,255,0.06)"
                  : pcallOnCooldown
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(124,77,255,0.22)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
                opacity: !pcallUnlocked ? 0.9 : 1,
              }}
            >
              {!pcallUnlocked
                ? "🔒 Call prioritaire (débloquer)"
                : pcallOnCooldown
                ? `⏳ Call prioritaire (${pcallLeftMin} min)`
                : "⚡ Call prioritaire"}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            {loading ? <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Suggestions…</div> : null}

            {items.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {items.map((it) => (
                  <div key={`${it.name}|${it.provider || ""}`} style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        sendBang(`!call ${it.name}`);
                        onClose();
                      }}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.05)",
                        color: "white",
                        textAlign: "left",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <SlotThumb url={it.imageUrl} />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 950,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {it.name}
                            {it.provider ? (
                              <span style={{ opacity: 0.75, fontWeight: 800 }}> — {it.provider}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void doPcall(it.name)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: !pcallUnlocked
                          ? "rgba(255,255,255,0.06)"
                          : pcallOnCooldown
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(124,77,255,0.22)",
                        color: "white",
                        fontWeight: 950,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      title={
                        !pcallUnlocked
                          ? "Débloque le talent Calls niveau 3"
                          : pcallOnCooldown
                          ? "Cooldown actif"
                          : "Prioritaire"
                      }
                    >
                      {!pcallUnlocked ? "🔒" : pcallOnCooldown ? `⏳ ${pcallLeftMin}m` : "⚡"}
                    </button>
                  </div>
                ))}
              </div>
            ) : q.trim().length >= 2 ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Aucune suggestion.</div>
            ) : null}
          </div>

          {/* ===== QUEUE intégrée (ancien File tab) ===== */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 950, opacity: 0.92 }}>File de calls</div>

              {!canMod ? (
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Accès mod/streamer/admin</div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => loadQueue()}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      fontWeight: 950,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Rafraîchir
                  </button>
                  <button
                    type="button"
                    onClick={() => doReset()}
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
                    Reset
                  </button>
                </div>
              )}
            </div>

            {canMod ? (
              callsLoading ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Chargement…</div>
              ) : !calls.length ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Aucun call.</div>
              ) : (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
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
                          <div
                            style={{
                              fontWeight: 950,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.pos}. {c.slotName}
                            {c.provider ? <span style={{ opacity: 0.75, fontWeight: 800 }}> — {c.provider}</span> : null}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                            @ {c.username}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => doDelete(c.id)}
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
              )
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
