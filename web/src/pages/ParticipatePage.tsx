// web/src/pages/ParticipatePage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../auth/AuthProvider";
import { LoginModal } from "../components/LoginModal";
import "../components/events/events-theme.css";
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
              <Link to="/browse" className="evBtnGhost">
                Découvrir les streamers →
              </Link>
            ) : null}

            {stepKey === "link_discord" ? (
              <>
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="evBtnGhost">
                  Rejoindre le Discord
                </a>
                <Link to="/profile" className="evBtnGhost">
                  Lier mon compte →
                </Link>
              </>
            ) : null}

            {stepKey === "follow_insta" ? (
              <>
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="evBtnGhost">
                  Ouvrir Instagram
                </a>
                <button
                  type="button"
                  className="evBtn"
                  disabled={done || declaring}
                  onClick={() => (token ? onDeclareInsta() : onOpenLogin())}
                >
                  {done ? "✅ Confirmé" : declaring ? "Envoi…" : "J'ai suivi"}
                </button>
              </>
            ) : null}

            {stepKey === "daily_claim" ? (
              <Link to="/" className="evBtnGhost">
                Aller à l'accueil →
              </Link>
            ) : null}

            {stepKey === "watch_30" ? (
              <Link to="/" className="evBtnGhost">
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
    <main className="container evRoot" style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom))", display: "grid", gap: 14 }}>
      <section className="evHero">
        <div className="evMesh" />
        <div className="evGrain" />

        <div className="evHeroContent" style={{ textAlign: "left", justifyItems: "start" }}>
          <span className="evStateBadge scheduled">🔓 5 étapes</span>
          <h1 className="evTitle" style={{ fontSize: "clamp(1.9rem, 6vw, 3rem)" }}>Débloque les événements</h1>
          <p className="evHeroMeta" style={{ justifyContent: "flex-start", textAlign: "left", opacity: 0.88 }}>
            5 étapes simples pour apparaître dans les classements d'events et gagner des lots (rubis, tickets roue,
            badges exclusifs). Les points comptent pour tout le monde dès le départ — ces étapes débloquent juste
            ton apparition dans le classement et la distribution des lots.
          </p>

          {!token ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="evBtn" onClick={() => setLoginOpen(true)}>
                Se connecter
              </button>
              <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                Connecte-toi pour suivre ta progression en direct.
              </span>
            </div>
          ) : loading ? (
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Chargement…</div>
          ) : eligible ? (
            <span className="evStepChip done">✅ Tu peux participer !</span>
          ) : null}
        </div>
      </section>

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
        <div className="evCard">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 1250, letterSpacing: -0.2 }}>Voir l'event en cours</div>
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900, marginTop: 4 }}>
                Classement, lots et détail de tes points.
              </div>
            </div>
            <Link to="/event" className="evBtnGhost">
              Aller à l'event →
            </Link>
          </div>
        </div>
      </Reveal>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}
