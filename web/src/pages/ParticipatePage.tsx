// web/src/pages/ParticipatePage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../auth/AuthProvider";
import { LoginModal } from "../components/LoginModal";
import {
  getEventAccessStatus,
  declareInstaFollow,
  type ApiEventAccessStatus,
  type EventAccessStepKey,
} from "../lib/api_events";

const DISCORD_INVITE_URL = "https://discord.gg/93BFrsBWWB";
const INSTAGRAM_URL = "https://www.instagram.com/lunalive_tv/";

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

const STEP_ORDER: EventAccessStepKey[] = ["follow_streamer", "link_discord", "follow_insta", "daily_claim", "watch_30"];

const STEP_META: Record<EventAccessStepKey, { icon: string; title: string; desc: string }> = {
  follow_streamer: {
    icon: "❤️",
    title: "Suivre un streamer",
    desc: "Choisis un(e) streamer LunaLive et clique sur « Suivre » sur sa page.",
  },
  link_discord: {
    icon: "🔗",
    title: "Lier ton compte Discord",
    desc: "Rejoins le Discord LunaLive, tape /link dans un salon pour recevoir un code par MP, puis colle-le dans ton profil (onglet Paramètres).",
  },
  follow_insta: {
    icon: "📸",
    title: "Suivre @lunalive_tv sur Instagram",
    desc: "Abonne-toi sur Instagram puis confirme ci-dessous — étape déclarative, on te fait confiance.",
  },
  daily_claim: {
    icon: "🎁",
    title: "Réclamer ton bonus quotidien",
    desc: "Le bonus du jour se propose automatiquement dès que tu es connecté sur l'accueil.",
  },
  watch_30: {
    icon: "⏱",
    title: "Regarder 30 minutes de live",
    desc: "Reste sur un live pendant 30 minutes cumulées (comptées à la minute, anti-AFK).",
  },
};

function StepCard({
  index,
  stepKey,
  done,
  token,
  onOpenLogin,
  onDeclareInsta,
  declaring,
}: {
  index: number;
  stepKey: EventAccessStepKey;
  done: boolean;
  token: string | null;
  onOpenLogin: () => void;
  onDeclareInsta: () => void;
  declaring: boolean;
}) {
  const meta = STEP_META[stepKey];

  return (
    <GlassCard style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            flexShrink: 0,
            width: 34,
            height: 34,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            fontSize: 16,
            fontWeight: 1200,
            background: done ? "rgba(52,211,153,0.18)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${done ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.12)"}`,
            color: done ? "#86EFAC" : "rgba(255,255,255,0.85)",
          }}
          aria-hidden
        >
          {done ? "✓" : index}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 1250, letterSpacing: -0.2 }}>
              {meta.icon} {meta.title}
            </div>
            {done ? (
              <span style={{ fontSize: 11, fontWeight: 1100, color: "#86EFAC", opacity: 0.9 }}>fait ✅</span>
            ) : null}
          </div>
          <div style={{ fontSize: 12, opacity: 0.78, fontWeight: 850, marginTop: 4, lineHeight: 1.5 }}>{meta.desc}</div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {stepKey === "follow_streamer" ? (
              <Link to="/browse" className="btnGhost2">
                Découvrir les streamers →
              </Link>
            ) : null}

            {stepKey === "link_discord" ? (
              <>
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="btnGhost2">
                  Rejoindre le Discord
                </a>
                <Link to="/profile" className="btnGhost2">
                  Lier mon compte →
                </Link>
              </>
            ) : null}

            {stepKey === "follow_insta" ? (
              <>
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="btnGhost2">
                  Ouvrir Instagram
                </a>
                <button
                  type="button"
                  className="btnBrand2"
                  disabled={done || declaring}
                  onClick={() => (token ? onDeclareInsta() : onOpenLogin())}
                >
                  {done ? "✅ Confirmé" : declaring ? "Envoi…" : "J'ai suivi"}
                </button>
              </>
            ) : null}

            {stepKey === "daily_claim" ? (
              <Link to="/" className="btnGhost2">
                Aller à l'accueil →
              </Link>
            ) : null}

            {stepKey === "watch_30" ? (
              <Link to="/" className="btnGhost2">
                Voir les lives →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

export default function ParticipatePage() {
  const auth = useAuth();
  const token = auth?.token ?? null;

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [status, setStatus] = React.useState<ApiEventAccessStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [declaring, setDeclaring] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function load() {
    if (!token) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await getEventAccessStatus(token);
      setStatus(r);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
    setLoading(false);
  }

  React.useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onDeclareInsta() {
    if (!token) {
      setLoginOpen(true);
      return;
    }
    setDeclaring(true);
    setErr(null);
    try {
      const r = await declareInstaFollow(token);
      setStatus(r);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
    setDeclaring(false);
  }

  const doneMap = React.useMemo(() => {
    const m = new Map<EventAccessStepKey, boolean>();
    for (const s of status?.steps ?? []) m.set(s.key, s.done);
    return m;
  }, [status]);

  const eligible = status?.eligible ?? false;

  return (
    <main className="container" style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom))" }}>
      <style>{`
        .partWrap{
          position:relative;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10));
          box-shadow: 0 20px 70px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          padding: 12px;
          overflow:hidden;
        }
        .partWrap::before{
          content:"";
          position:absolute; inset:-40px;
          pointer-events:none;
          background:
            radial-gradient(900px 360px at 18% 0%, rgba(167,139,250,0.24), rgba(0,0,0,0) 62%),
            radial-gradient(900px 420px at 80% 10%, rgba(80,160,255,0.18), rgba(0,0,0,0) 62%);
          opacity: 0.85;
        }
        .partInner{ position:relative; z-index:1; display:grid; gap:12px; }
        .partHero{
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(900px 320px at 20% 0%, rgba(167,139,250,0.20), rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12));
          box-shadow: 0 18px 55px rgba(0,0,0,0.25);
        }
        .partH1{
          margin:0;
          font-weight:1500;
          letter-spacing:-0.5px;
          font-size: 22px;
          line-height:1.1;
          background: linear-gradient(90deg, rgba(196,181,253,1), rgba(167,139,250,1));
          -webkit-background-clip:text; background-clip:text; color:transparent;
        }
        .partSub{ margin-top:8px; font-size:13px; opacity:0.82; font-weight:800; line-height:1.5; }
        .btnGhost2{
          display:inline-flex; align-items:center; justify-content:center;
          padding: 9px 12px; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          font-weight: 1100; font-size: 12.5px;
          cursor:pointer; text-decoration:none;
          min-height: 36px; white-space: nowrap;
        }
        .btnGhost2:active{ transform: translateY(1px); }
        .btnBrand2{
          display:inline-flex; align-items:center; justify-content:center;
          padding: 9px 14px; border-radius: 14px;
          border: 1px solid rgba(167,139,250,0.45);
          background: linear-gradient(135deg, rgba(167,139,250,0.9), rgba(196,181,253,0.85));
          color: #17102b;
          font-weight: 1200; font-size: 12.5px;
          cursor:pointer; text-decoration:none;
          min-height: 36px; white-space: nowrap;
          box-shadow: 0 8px 24px rgba(167,139,250,0.3);
        }
        .btnBrand2:disabled{ opacity: 0.6; cursor: default; box-shadow: none; }
        .btnBrand2:active{ transform: translateY(1px); }

        @media (max-width: 620px) {
          .partH1{ font-size: 19px; }
        }
      `}</style>

      <div className="partWrap">
        <div className="partInner">
          <div className="partHero">
            <h1 className="partH1">🔓 Débloque les événements LunaLive</h1>
            <p className="partSub">
              5 étapes simples pour apparaître dans les classements d'events et gagner des lots (rubis, tickets roue,
              badges exclusifs). Les points comptent pour tout le monde dès le départ — ces étapes débloquent juste
              ton apparition dans le classement et la distribution des lots.
            </p>

            {!token ? (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btnBrand2" onClick={() => setLoginOpen(true)}>
                  Se connecter
                </button>
                <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                  Connecte-toi pour suivre ta progression en direct.
                </span>
              </div>
            ) : loading ? (
              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Chargement…</div>
            ) : eligible ? (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(52,211,153,0.4)",
                  background: "rgba(52,211,153,0.12)",
                  color: "#86EFAC",
                  fontWeight: 1150,
                  fontSize: 13,
                  display: "inline-block",
                }}
              >
                ✅ Tu peux participer !
              </div>
            ) : null}
          </div>

          {err ? (
            <div className="alert" style={{ margin: 0 }}>
              {err}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            {STEP_ORDER.map((key, i) => (
              <Reveal key={key} delay={i * 0.04}>
                <StepCard
                  index={i + 1}
                  stepKey={key}
                  done={token ? doneMap.get(key) ?? false : false}
                  token={token}
                  onOpenLogin={() => setLoginOpen(true)}
                  onDeclareInsta={onDeclareInsta}
                  declaring={declaring}
                />
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.24}>
            <GlassCard style={{ padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 1250, letterSpacing: -0.2 }}>Voir l'event en cours</div>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900, marginTop: 4 }}>
                    Classement, lots et détail de tes points.
                  </div>
                </div>
                <Link to="/event" className="btnGhost2">
                  Aller à l'event →
                </Link>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}
