// web/src/components/AchievementsModal.tsx
// ─── REWORK VISUEL Purple Velvet ─── logique 100% identique à l'original ───
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

/* ── Purple Velvet tier accents ── */
const TIER_ACCENT: Record<string, { bd: string; bg: string; bar: string; title: string }> = {
  bronze: { bd:"rgba(180,100,50,.28)",  bg:"rgba(180,100,50,.08)",  bar:"rgba(205,127,50,.70)", title:"rgba(210,140,70,.90)"  },
  silver: { bd:"rgba(186,230,253,.22)", bg:"rgba(186,230,253,.06)", bar:"rgba(147,197,253,.70)", title:"rgba(186,230,253,.88)" },
  gold:   { bd:"rgba(251,191,36,.28)",  bg:"rgba(251,191,36,.08)",  bar:"rgba(251,191,36,.75)", title:"rgba(253,230,138,.90)" },
  master: { bd:"rgba(167,139,250,.30)", bg:"rgba(124,92,252,.10)",  bar:"rgba(124,92,252,.80)", title:"rgba(196,181,253,.92)" },
};

function cardStyle(unlocked: boolean, tier: ApiAchievement["tier"]): React.CSSProperties {
  const a = TIER_ACCENT[tier] ?? TIER_ACCENT.bronze;
  return {
    padding: 12,
    borderRadius: 16,
    border: `1px solid ${unlocked ? a.bd : "rgba(124,92,252,.10)"}`,
    background: unlocked ? a.bg : "rgba(124,92,252,.04)",
    opacity: unlocked ? 1 : 0.55,
    filter: unlocked ? "none" : "grayscale(1)",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    minWidth: 0,
    position: "relative",
    overflow: "hidden",
    transition: "opacity 200ms ease",
  };
}

function ProgressBar({ current, target, tier }: { current: number; target: number; tier: ApiAchievement["tier"] }) {
  const pct = target <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  const a = TIER_ACCENT[tier] ?? TIER_ACCENT.bronze;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="mutedSmall" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Progression</span>
        <span><b style={{ color:"rgba(235,232,255,.90)" }}>{Math.min(current, target)}/{target}</b></span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(124,92,252,.10)", overflow: "hidden", marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${a.bar}, rgba(91,142,248,.65))`,
          borderRadius: 999, transition: "width 400ms cubic-bezier(.22,1,.36,1)" }} />
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

  React.useEffect(() => {
    if (!open) return;
    if (!token) { setItems([]); setError("Connecte-toi pour voir tes succès."); return; }
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
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
    return () => { alive = false; };
  }, [open, token]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
      style={{ position:"fixed", inset:0, zIndex:2147483647,
        background:"rgba(0,0,0,.78)", backdropFilter:"blur(8px)",
        display:"grid", placeItems:"center", padding:16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "min(980px, 96vw)",
          height: "min(780px, 90vh)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          /* Purple Velvet dark glass */
          background: "rgba(11,9,22,.96)",
          border: "1px solid rgba(124,92,252,.20)",
          borderRadius: 22,
          boxShadow: "0 28px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(167,139,250,.06) inset",
          backdropFilter: "blur(2px)",
          position: "relative",
        }}
      >
        {/* reflet haut signature */}
        <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1,
          background:"linear-gradient(90deg,transparent,rgba(167,139,250,.36) 40%,rgba(91,142,248,.26) 60%,transparent)", pointerEvents:"none" }} />

        {/* Background déco radial */}
        <div aria-hidden style={{ position:"absolute", inset:0, pointerEvents:"none",
          background:"radial-gradient(1000px 400px at 20% 0%,rgba(124,92,252,.12),transparent 60%), radial-gradient(900px 350px at 80% 90%,rgba(59,77,200,.10),transparent 60%)" }} />

        {/* Header */}
        <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(124,92,252,.14)",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
          position:"relative", flexShrink:0 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, fontSize:17,
              letterSpacing:-.3, background:"linear-gradient(90deg,#c4b5fd,#a78bfa,#5b8ef8)",
              WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
              🏆 Succès
            </div>
            <div className="mutedSmall" style={{ opacity:.80, marginTop:2 }}>
              Les Master peuvent contenir des récompenses cosmétiques plus tard.
            </div>
          </div>
          <button type="button" className="btnPrimarySmall" onClick={onClose} style={{ padding:"6px 10px", flexShrink:0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding:14, overflow:"auto", flex:1, minHeight:0, position:"relative" }}>
          {loading ? <div className="muted">Chargement…</div> : null}
          {error  ? <div className="mutedSmall" style={{ color:"rgba(252,165,165,.90)" }}>{error}</div> : null}

          {!loading && !error ? (
            <div style={{ display:"grid", gap:18 }}>
              {TIER_ORDER.map(t => {
                const list = grouped[t] ?? [];
                if (!list.length) return null;
                const a = TIER_ACCENT[t] ?? TIER_ACCENT.bronze;
                return (
                  <div key={t}>
                    {/* Tier header */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, fontSize:15, letterSpacing:-.2, color:a.title }}>
                        {tierTitle(t)}
                      </div>
                      <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${a.bd},transparent)` }} />
                      <div className="mutedSmall" style={{ opacity:.70 }}>
                        {list.filter(x=>x.unlocked).length}/{list.length}
                      </div>
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10 }}>
                      {list.map(ach => (
                        <div key={ach.id} style={cardStyle(ach.unlocked, t)}>
                          {/* reflet haut sur carte débloquée */}
                          {ach.unlocked ? (
                            <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1,
                              background:`linear-gradient(90deg,transparent,${a.bd} 45%,transparent)`, pointerEvents:"none" }} />
                          ) : null}

                          <div style={{ fontSize:22, lineHeight:1, marginTop:2, flexShrink:0 }}>{ach.icon}</div>

                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                              <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700,
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={ach.name}>
                                {ach.name}
                              </div>
                              <div className="mutedSmall" style={{ opacity:.75, flexShrink:0 }}>
                                {ach.unlocked ? <span style={{ color:a.title }}>✓</span> : "—"}
                              </div>
                            </div>

                            {ach.desc ? (
                              <div className="mutedSmall" style={{ opacity:.82, marginTop:4, lineHeight:1.35 }}>{ach.desc}</div>
                            ) : null}
                            {ach.hint ? (
                              <div className="mutedSmall" style={{ opacity:.82, marginTop:4, lineHeight:1.35 }}>{ach.hint}</div>
                            ) : null}
                            {ach.rewardPreview ? (
                              <div className="mutedSmall" style={{ opacity:.85, marginTop:4 }}>🎁 {ach.rewardPreview}</div>
                            ) : null}
                            {ach.progress ? (
                              <ProgressBar current={ach.progress.current} target={ach.progress.target} tier={t} />
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
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