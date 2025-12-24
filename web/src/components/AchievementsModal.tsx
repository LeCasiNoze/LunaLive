// web/src/components/AchievementsModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { getMyAchievements, type ApiAchievement } from "../lib/api";

const TIER_ORDER: Array<ApiAchievement["tier"]> = ["bronze", "silver", "gold", "master"];

function tierTitle(t: ApiAchievement["tier"]) {
  if (t === "bronze") return "Bronze";
  if (t === "silver") return "Silver";
  if (t === "gold") return "Gold";
  return "Master";
}

function cardStyle(unlocked: boolean): React.CSSProperties {
  return {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    opacity: unlocked ? 1 : 0.6,
    filter: unlocked ? "none" : "grayscale(1)",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    minWidth: 0,
  };
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = target <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  return (
    <div style={{ marginTop: 8 }}>
      <div className="mutedSmall" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Progression</span>
        <span>
          <b style={{ color: "rgba(255,255,255,0.9)" }}>
            {Math.min(current, target)}/{target}
          </b>
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "rgba(180,140,255,0.35)" }} />
      </div>
    </div>
  );
}

export function AchievementsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth() as any;
  const token: string | null = auth?.token ?? null;

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ApiAchievement[]>([]);

  // ✅ fetch à l’ouverture
  React.useEffect(() => {
    if (!open) return;

    if (!token) {
      setItems([]);
      setError("Connecte-toi pour voir tes succès.");
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await getMyAchievements(token);
        if (!alive) return;
        setItems(r.achievements ?? []);
      } catch (e: any) {
        if (!alive) return;
        setError(String(e?.message || "Erreur"));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, token]);

  // ✅ ESC pour fermer
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const grouped = React.useMemo(() => {
    const byTier: Record<string, ApiAchievement[]> = {};
    for (const t of TIER_ORDER) byTier[t] = [];
    for (const a of items) (byTier[a.tier] ??= []).push(a);
    return byTier;
  }, [items]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ✅ Carte OPAQUE + layout scroll correct */}
      <div
        style={{
          width: "min(980px, 96vw)",
          height: "min(780px, 90vh)", // ✅ hauteur fixe pour que le scroll marche
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",

          background: "#0b0b10", // ✅ OPAQUE
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          boxShadow: "0 18px 60px rgba(0,0,0,0.60)",
        }}
      >
        {/* Header (fixe) */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Succès</div>
            <div className="mutedSmall" style={{ opacity: 0.8 }}>
              Les Master peuvent contenir des récompenses cosmétiques plus tard.
            </div>
          </div>

          <button type="button" className="btnPrimarySmall" onClick={onClose} style={{ padding: "6px 10px" }}>
            ✕
          </button>
        </div>

        {/* Body (scroll) */}
        <div style={{ padding: 14, overflow: "auto", flex: 1, minHeight: 0 }}>
          {loading ? <div className="muted">Chargement…</div> : null}
          {error ? <div className="mutedSmall" style={{ color: "rgba(255,90,90,0.95)" }}>{error}</div> : null}

          {!loading && !error ? (
            <div style={{ display: "grid", gap: 16 }}>
              {TIER_ORDER.map((t) => {
                const list = grouped[t] ?? [];
                if (!list.length) return null;

                return (
                  <div key={t}>
                    <div className="panelTitle" style={{ marginBottom: 10 }}>
                      {tierTitle(t)}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      {list.map((a) => (
                        <div key={a.id} style={cardStyle(a.unlocked)}>
                          <div style={{ fontSize: 22, lineHeight: 1, marginTop: 2 }}>{a.icon}</div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div
                                style={{
                                  fontWeight: 950,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={a.name}
                              >
                                {a.name}
                              </div>
                              <div className="mutedSmall" style={{ opacity: 0.8 }}>
                                {a.unlocked ? "✓" : "—"}
                              </div>
                            </div>

                            {a.desc ? (
                              <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 4, lineHeight: 1.35 }}>
                                {a.desc}
                              </div>
                            ) : null}

                            {a.hint ? (
                              <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 4, lineHeight: 1.35 }}>
                                {a.hint}
                              </div>
                            ) : null}

                            {a.rewardPreview ? (
                              <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 4 }}>
                                🎁 {a.rewardPreview}
                              </div>
                            ) : null}

                            {a.progress ? <ProgressBar current={a.progress.current} target={a.progress.target} /> : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* mini note responsive : si tu veux, on pourra passer à 1 colonne <820px via un style tag */}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
