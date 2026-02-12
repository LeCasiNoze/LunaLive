// web/src/pages/EventPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { getCurrentEvent, getCurrentViewerWeek, type ApiEventRow, type ApiViewerWeekResp } from "../lib/api_events";

function fmtRemain(ms: number) {
  ms = Math.max(0, Math.floor(ms));
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const hh = h % 24;
  const mm = m % 60;
  if (d > 0) return `${d}j ${hh}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${m}m`;
}

function fmtIsoLocal(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  // rendu simple
  return new Date(t).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

function Pill({
  tone,
  children,
  title,
}: {
  tone: "neutral" | "brand" | "live" | "gold";
  children: React.ReactNode;
  title?: string;
}) {
  const map: Record<string, { bg: string; bd: string }> = {
    brand: { bg: "rgba(140,90,255,0.14)", bd: "rgba(140,90,255,0.28)" },
    live: { bg: "rgba(255,90,180,0.14)", bd: "rgba(255,90,180,0.26)" },
    gold: { bg: "rgba(255,210,120,0.14)", bd: "rgba(255,210,120,0.28)" },
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)" },
  };
  const t = map[tone] ?? map.neutral;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 11px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontSize: 12,
        fontWeight: 1100,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
        boxShadow: "0 18px 55px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  right,
  defaultOpen,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 12px",
          background: "transparent",
          border: 0,
          color: "rgba(255,255,255,0.92)",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 18,
              height: 18,
              display: "inline-grid",
              placeItems: "center",
              opacity: 0.9,
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 140ms ease",
            }}
          >
            ▸
          </span>
          <span style={{ fontWeight: 1200, letterSpacing: -0.2 }}>{title}</span>
        </span>
        <span style={{ opacity: 0.85 }}>{right}</span>
      </button>
      {open ? (
        <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>{children}</div>
      ) : null}
    </div>
  );
}

function eventLabel(type: string) {
  if (type === "viewer_week") return "Viewer Week";
  if (type === "wheel_week") return "Wheel Week";
  if (type === "clip_race") return "Clip Race";
  if (type === "global_chest") return "Global Chest";
  if (type === "burn_boss") return "Burn Boss";
  if (type === "duo_week") return "Duo Week";
  return type || "Event";
}

function eventEmoji(type: string) {
  if (type === "viewer_week") return "🏁";
  if (type === "wheel_week") return "🎡";
  if (type === "clip_race") return "🎬";
  if (type === "global_chest") return "🎁";
  if (type === "burn_boss") return "🔥";
  if (type === "duo_week") return "🤝";
  return "✨";
}

function TopRow({
  rank,
  username,
  points,
  isMe,
}: {
  rank: number;
  username: string;
  points: number;
  isMe?: boolean;
}) {
  const tone = rank === 1 ? "gold" : isMe ? "brand" : "neutral";
  const badge = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.20)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Pill tone={tone as any} title="Rang">
          <b>{badge}</b>
        </Pill>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 1250,
              letterSpacing: -0.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              opacity: isMe ? 1 : 0.95,
            }}
            title={username}
          >
            {username}
            {isMe ? <span style={{ opacity: 0.75 }}> (toi)</span> : null}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Total points</div>
        </div>
      </div>

      <Pill tone={tone as any} title="Points">
        ⭐ <b>{Math.floor(Number(points || 0))}</b>
      </Pill>
    </div>
  );
}

function ViewerWeekBlock({
  data,
  authed,
}: {
  data: ApiViewerWeekResp;
  authed: boolean;
}) {
  const topN = Number(data?.rules?.topN ?? 10) || 10;
  const top = Array.isArray(data?.top) ? data.top.slice(0, topN) : [];
  const me = data?.me ?? null;

  const values = data?.rules?.values ?? {};
  const caps = data?.rules?.capsPerDay ?? {};

  // fallback: si backend ne renvoie pas values/caps, on affiche des labels génériques
  const displayRules = [
    { k: "minute", label: "1 point / minute de watch (connecté)", v: `+${data?.rules?.pointsPerMinute ?? 1} / min` },
    { k: "claim", label: "Daily claim", v: values?.CLAIM != null ? `+${values.CLAIM}` : "✓" },
    { k: "wheel", label: "Wheel spins", v: values?.WHEEL != null ? `+${values.WHEEL}` : "✓" },
    { k: "pred_join", label: "Participation prédiction", v: values?.PRED_JOIN != null ? `+${values.PRED_JOIN}` : "✓" },
    { k: "pred_win", label: "Victoire prédiction", v: values?.PRED_WIN != null ? `+${values.PRED_WIN}` : "✓" },
    { k: "call", label: "Calls actions", v: values?.CALL != null ? `+${values.CALL}` : "✓" },
  ];

  const capLines = [
    { k: "wheel", label: "Wheel / jour", v: caps?.WHEEL ?? 5 },
    { k: "pred_join", label: "Prédictions join / jour", v: caps?.PRED_JOIN ?? 3 },
    { k: "pred_win", label: "Prédictions win / jour", v: caps?.PRED_WIN ?? 1 },
    { k: "call", label: "Calls / jour", v: caps?.CALL ?? 20 },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Leaderboard */}
      <GlassCard style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 1400, letterSpacing: -0.2 }}>🏆 Leaderboard</div>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950 }}>Top {topN}</div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {top.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 900 }}>
              Pas encore de scores (ou recompute pas encore passé).  
              <span style={{ opacity: 0.7 }}> Tu peux déjà jouer, ça va apparaître.</span>
            </div>
          ) : (
            top.map((r) => (
              <TopRow
                key={`${r.userId}-${r.rank}`}
                rank={Number(r.rank || 0)}
                username={String(r.username || `user#${r.userId}`)}
                points={Number(r.points || 0)}
                isMe={me ? Number(me.userId) === Number(r.userId) : false}
              />
            ))
          )}
        </div>

        {/* Me */}
        <div style={{ marginTop: 12 }}>
          {authed ? (
            me ? (
              <>
                <div style={{ fontWeight: 1200, letterSpacing: -0.2, marginBottom: 8 }}>🎯 Toi</div>
                <TopRow
                  rank={Number(me.rank || 0) || 0}
                  username={String(me.username || "Moi")}
                  points={Number(me.points || 0)}
                  isMe
                />

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950 }}>Détail (MVP)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Pill tone="neutral" title="Watchtime points">
                      ⏱ <b>{Math.floor(Number(me.minutesPoints ?? 0))}</b>
                    </Pill>
                    <Pill tone="neutral" title="Daily claim points">
                      🎁 <b>{Math.floor(Number(me.claimPoints ?? 0))}</b>
                    </Pill>
                    <Pill tone="neutral" title="Wheel points">
                      🎡 <b>{Math.floor(Number(me.wheelPoints ?? 0))}</b>
                    </Pill>
                    <Pill tone="neutral" title="Calls points">
                      📣 <b>{Math.floor(Number(me.callsPoints ?? 0))}</b>
                    </Pill>
                    <Pill tone="neutral" title="Pred join points">
                      🔮 <b>{Math.floor(Number(me.predJoinPoints ?? 0))}</b>
                    </Pill>
                    <Pill tone="neutral" title="Pred win points">
                      ✅ <b>{Math.floor(Number(me.predWinPoints ?? 0))}</b>
                    </Pill>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 900 }}>
                Connecté ✅ mais “me” est vide (pas éligible / pas encore de score).
              </div>
            )
          ) : (
            <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 900 }}>
              Connecte-toi pour voir tes points.
            </div>
          )}
        </div>
      </GlassCard>

      {/* Rules */}
      <Section title="📜 Règles & barème" right={<span style={{ opacity: 0.8 }}>points • caps</span>} defaultOpen>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 950 }}>
            Éligibilité : comptes <b>welcome-qualified</b> (pas d’anonymes) • ban site = exclu.
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 1200 }}>Gagner des points</div>
            <div style={{ display: "grid", gap: 8 }}>
              {displayRules.map((x) => (
                <div
                  key={x.k}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.95 }}>{x.label}</div>
                  <Pill tone="brand" title="Gain">
                    {x.v}
                  </Pill>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 1200 }}>Caps / jour</div>
            <div style={{ display: "grid", gap: 8 }}>
              {capLines.map((x) => (
                <div
                  key={x.k}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.95 }}>{x.label}</div>
                  <Pill tone="neutral" title="Cap">
                    max <b>{Number(x.v)}</b>
                  </Pill>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* CTA */}
      <GlassCard style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 1300, letterSpacing: -0.2 }}>Tu veux grind vite ?</div>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginTop: 4 }}>
              Regarde un live + daily + wheel + 2-3 calls = tu montes direct.
            </div>
          </div>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 12px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.92)",
              fontWeight: 1150,
              textDecoration: "none",
              whiteSpace: "nowrap",
              minHeight: 40,
            }}
          >
            Aller aux lives ▶
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}

function ComingSoonBlock({ type }: { type: string }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <GlassCard style={{ padding: 12 }}>
        <div style={{ fontWeight: 1400, letterSpacing: -0.2 }}>
          {eventEmoji(type)} {eventLabel(type)}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.82, fontWeight: 950 }}>
          UI prête ✅ — le contenu spécifique de cet event sera branché ensuite.
        </div>
      </GlassCard>

      <Section title="📜 Règles" right={<span style={{ opacity: 0.8 }}>placeholder</span>} defaultOpen>
        <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 950 }}>
          Cet event arrive bientôt.  
          On affichera ici : barème • caps • leaderboard • tes points.
        </div>
      </Section>
    </div>
  );
}

export default function EventPage() {
  const auth = useAuth() as any;
  const token: string | null = auth?.token ?? null;

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [event, setEvent] = React.useState<ApiEventRow | null>(null);
  const [viewerWeek, setViewerWeek] = React.useState<ApiViewerWeekResp | null>(null);

  // mini timer pour countdown
  const [nowMs, setNowMs] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const cur = await getCurrentEvent();
      setEvent(cur?.event ?? null);

      // si viewer_week, et token => fetch le détail (top + me)
      const type = String(cur?.event?.type || "");
      if (type === "viewer_week" && token) {
        const v = await getCurrentViewerWeek(token);
        setViewerWeek(v);
      } else {
        setViewerWeek(null);
      }

      setLoading(false);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const endMs = event?.end_at ? new Date(event.end_at).getTime() : 0;
  const startMs = event?.start_at ? new Date(event.start_at).getTime() : 0;
  const remaining = endMs > 0 ? fmtRemain(endMs - nowMs) : null;

  const title = event ? `${eventEmoji(event.type)} ${eventLabel(event.type)}` : "✨ Event";

  return (
    <main className="container" style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom))" }}>
      <style>{`
        .eventWrap{
          position:relative;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10));
          box-shadow: 0 20px 70px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          padding: 12px;
          overflow:hidden;
        }
        .eventWrap::before{
          content:"";
          position:absolute; inset:-40px;
          pointer-events:none;
          background:
            radial-gradient(900px 360px at 18% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(900px 420px at 80% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(900px 520px at 50% 95%, rgba(140,90,255,0.22), rgba(0,0,0,0) 64%);
          opacity: 0.85;
        }
        .eventInner{ position:relative; z-index:1; display:grid; gap:12px; }

        .hero{
          padding: 12px 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(900px 320px at 20% 0%, rgba(140,90,255,0.18), rgba(0,0,0,0) 60%),
            radial-gradient(900px 320px at 80% 20%, rgba(80,160,255,0.14), rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12));
          box-shadow: 0 18px 55px rgba(0,0,0,0.25);
          display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
        }
        .h1{
          margin:0;
          font-weight:1500;
          letter-spacing:-0.6px;
          font-size: 24px;
          line-height:1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .sub{
          margin-top:6px;
          font-size:12px;
          opacity:0.82;
          font-weight:900;
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        }
        .btnGhost{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          font-weight: 1150;
          cursor:pointer;
          text-decoration:none;
          min-height: 40px;
          white-space: nowrap;
        }
        .btnGhost:active{ transform: translateY(1px); }
      `}</style>

      <div className="eventWrap">
        <div className="eventInner">
          <div className="hero">
            <div style={{ minWidth: 0 }}>
              <h1 className="h1">{title}</h1>
              <div className="sub">
                {event ? (
                  <>
                    <span style={{ opacity: 0.9 }}>
                      {event.state === "live" ? "🟢 en cours" : event.state === "scheduled" ? "⏳ scheduled" : "✅ terminé"}
                    </span>
                    <span style={{ opacity: 0.75 }}>•</span>
                    <span title="Début">{fmtIsoLocal(event.start_at)}</span>
                    <span style={{ opacity: 0.75 }}>→</span>
                    <span title="Fin">{fmtIsoLocal(event.end_at)}</span>
                  </>
                ) : (
                  <span>Aucun event actif.</span>
                )}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {event ? (
                  <>
                    <Pill tone="brand" title="Type">{event.type}</Pill>
                    <Pill tone="neutral" title="Cycle">cycle <b>{Number(event.cycle_index ?? 0)}</b></Pill>
                    {remaining && event.state === "live" ? (
                      <Pill tone="live" title="Temps restant">
                        ⏳ <b>{remaining}</b>
                      </Pill>
                    ) : null}
                    {startMs > 0 && endMs > 0 ? (
                      <Pill tone="neutral" title="Fenêtre UTC">
                        {Math.max(0, Math.floor((endMs - startMs) / 3600_000))}h
                      </Pill>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
              <button type="button" className="btnGhost" onClick={() => load().catch(() => {})} disabled={loading}>
                {loading ? "Chargement…" : "Rafraîchir ↻"}
              </button>
              <Link to="/" className="btnGhost" title="Retour aux lives">
                Lives
              </Link>
            </div>
          </div>

          {err ? (
            <div className="alert" style={{ margin: 0 }}>
              {err}
            </div>
          ) : null}

          {loading ? (
            <GlassCard style={{ padding: 12 }}>
              <div style={{ fontWeight: 1200 }}>Chargement…</div>
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginTop: 6 }}>
                Récupération de l’event courant et du leaderboard.
              </div>
            </GlassCard>
          ) : !event ? (
            <GlassCard style={{ padding: 12 }}>
              <div style={{ fontWeight: 1200 }}>Aucun event actif</div>
              <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 950, marginTop: 6 }}>
                Le moteur d’events n’a peut-être pas encore ouvert l’event (ou la fenêtre est terminée).
              </div>
            </GlassCard>
          ) : event.type === "viewer_week" ? (
            viewerWeek ? (
              <ViewerWeekBlock data={viewerWeek} authed={!!token} />
            ) : (
              <GlassCard style={{ padding: 12 }}>
                <div style={{ fontWeight: 1300, letterSpacing: -0.2 }}>🔒 Viewer Week</div>
                <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 950, marginTop: 6 }}>
                  Connecte-toi pour voir le leaderboard et tes points.
                </div>
              </GlassCard>
            )
          ) : (
            <ComingSoonBlock type={event.type} />
          )}
        </div>
      </div>
    </main>
  );
}
