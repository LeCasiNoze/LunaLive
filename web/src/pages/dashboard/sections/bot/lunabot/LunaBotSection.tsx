// web/src/pages/dashboard/sections/bot/LunaBotSection.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../../../../auth/AuthProvider";
import {
  getMyBotAutoposts,
  getMyBotCommands,
  getMyBotLogs,
  getMyBotOverview,
  type ApiBotAutopost,
  type ApiBotCommand,
  type ApiBotLogRow,
  type ApiBotOverview,
  type ApiMyStreamer,
} from "./api";

import { CommandsModule } from "./modules/CommandsModule";
import { AutopostsModule } from "./modules/AutopostsModule";
import { LogsModule } from "./modules/LogsModule";
import { TestSendModule } from "./modules/TestSendModule";
import { ObsWidgetModule } from "./modules/ObsWidgetModule";
import { ClipsModule } from "./modules/ClipsModule";
import { CallsModule } from "./modules/CallsHuntModule";
import { BotWheelModule } from "./modules/BotWheelModule";
import { BotRainModule } from "./modules/BotRainModule";
import { PredictionsModule } from "./modules/PredictionsModule";
import { DiscordWelcomeModule } from "./modules/DiscordWelcomeModule";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

type ModuleCategory = "general" | "callhunt" | "rubis" | "discord" | "moderation" | "admin";

type ModuleDef = {
  id: string;
  title: string;
  desc?: string;
  icon: React.ReactNode;
  category: ModuleCategory;
  status: "ready" | "soon";
  onOpen?: () => void;
};

type ActiveModule =
  | "commands"
  | "autoposts"
  | "logs"
  | "test-send"
  | "obs"
  | "clips"
  | "calls"
  | "bot-wheel"
  | "bot-rain"
  | "predictions"
  | "discord-welcome"
  | null;

const CATEGORY_LABEL: Record<ModuleCategory, string> = {
  general: "Général",
  callhunt: "Call & Hunt",
  rubis: "Rubis & mini-jeux",
  discord: "Discord",
  moderation: "Modération",
  admin: "Admin",
};

const CATEGORY_ORDER: ModuleCategory[] = ["general", "callhunt", "rubis", "discord", "moderation", "admin"];

// ──────────────────────────────────────────
// Small UI helpers
// ──────────────────────────────────────────

function Chip({
  kind,
  children,
}: {
  kind: "ready" | "soon";
  children: React.ReactNode;
}) {
  const base: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 950,
    padding: "5px 9px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.20)",
    opacity: 0.95,
    whiteSpace: "nowrap",
    letterSpacing: -0.1,
  };

  if (kind === "ready") {
    return (
      <span
        style={{
          ...base,
          border: "1px solid rgba(60, 240, 180, 0.30)",
          background: "rgba(60, 240, 180, 0.10)",
          color: "rgba(230,255,248,0.92)",
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      style={{
        ...base,
        border: "1px solid rgba(255, 190, 60, 0.35)",
        background: "rgba(255, 190, 60, 0.10)",
        color: "rgba(255,235,210,0.92)",
      }}
    >
      {children}
    </span>
  );
}

function CategoryTabs({
  active,
  categories,
  onChange,
}: {
  active: ModuleCategory;
  categories: ModuleCategory[];
  onChange: (c: ModuleCategory) => void;
}) {
  return (
    <div className="llBotCats">
      {categories.map((cat) => {
        const isActive = active === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={`llBotCat ${isActive ? "isActive" : ""}`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        );
      })}
    </div>
  );
}

function QuickCard({
  icon,
  title,
  desc,
  status,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  status: "ready" | "soon";
  onOpen?: () => void;
}) {
  const locked = status !== "ready";
  return (
    <button
      type="button"
      className={`llBotCard ${locked ? "isLocked" : ""}`}
      onClick={() => {
        if (locked) return;
        onOpen?.();
      }}
      disabled={locked || !onOpen}
      aria-disabled={locked || !onOpen}
    >
      <div className="llBotCardTop">
        <div className="llBotCardLeft">
          <div className="llBotIconWrap" aria-hidden>
            <span className="llBotIcon">{icon}</span>
          </div>

          <div className="llBotCardText">
            <div className="llBotCardTitle">{title}</div>
            {desc ? <div className="llBotCardDesc">{desc}</div> : null}
          </div>
        </div>

        <div className="llBotCardRight">
          {status === "ready" ? <Chip kind="ready">DISPO</Chip> : <Chip kind="soon">BIENTÔT</Chip>}
        </div>
      </div>

      <div className="llBotCardCtaRow">
        <span className="llBotCardCta">{locked ? "Bientôt" : "Ouvrir"}</span>
        <span className="llBotCardArrow" aria-hidden>
          →
        </span>
      </div>

      {locked ? <div className="llBotLockedOverlay" aria-hidden /> : null}
    </button>
  );
}

// ──────────────────────────────────────────
// Modal — LunaLive style
// ──────────────────────────────────────────

function Modal({
  open,
  title,
  desc,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  desc?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      className="llBotModalOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="llBotModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="llBotModalHead">
          <div style={{ minWidth: 0 }}>
            <div className="llBotModalTitle">{title}</div>
            {desc ? <div className="llBotModalDesc">{desc}</div> : null}
          </div>

          <button
            className="llBotModalClose"
            onClick={onClose}
            aria-label="Fermer"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="llBotModalBody">{children}</div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

// ──────────────────────────────────────────
// Main section
// ──────────────────────────────────────────

export function LunaBotSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token, user } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [overview, setOverview] = React.useState<ApiBotOverview | null>(null);
  const [commands, setCommands] = React.useState<ApiBotCommand[]>([]);
  const [autoposts, setAutoposts] = React.useState<ApiBotAutopost[]>([]);
  const [logs, setLogs] = React.useState<ApiBotLogRow[]>([]);

  const [activeCategory, setActiveCategory] = React.useState<ModuleCategory>("general");
  const [activeModule, setActiveModule] = React.useState<ActiveModule>(null);

  const [q, setQ] = React.useState(""); // 🔎 search modules

  const isAdmin = user?.role === "admin";

  async function reloadAll() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [ov, c, a, l] = await Promise.all([
        getMyBotOverview(token),
        getMyBotCommands(token),
        getMyBotAutoposts(token),
        getMyBotLogs(token, 60),
      ]);
      setOverview(ov);
      setCommands(c.commands);
      setAutoposts(a.autoposts);
      setLogs(l.logs);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  React.useEffect(() => {
    if (!activeModule) return;
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule]);

  if (!token) {
    return (
      <div className="panel">
        <div className="panelTitle">LunaBot</div>
        <div className="muted">Connecte-toi pour accéder à cet onglet.</div>
      </div>
    );
  }

  const modules: ModuleDef[] = [
    {
      id: "commands",
      category: "general",
      status: "ready",
      title: "Commandes personnalisées",
      desc: "Gère tes !commandes.",
      icon: "⌨️",
      onOpen: () => setActiveModule("commands"),
    },
    {
      id: "autoposts",
      category: "general",
      status: "ready",
      title: "Messages automatiques",
      desc: "Planifie des messages.",
      icon: "🗓️",
      onOpen: () => setActiveModule("autoposts"),
    },
    {
      id: "clips",
      category: "general",
      status: "ready",
      title: "Clips (!clip)",
      desc: "Enregistre et télécharge tes clips (DLive VOD).",
      icon: "🎬",
      onOpen: () => setActiveModule("clips"),
    },
    {
      id: "logs",
      category: "general",
      status: "ready",
      title: "Logs & diagnostic",
      desc: "Événements / erreurs.",
      icon: "🧾",
      onOpen: () => setActiveModule("logs"),
    },
    {
      id: "test-send",
      category: "general",
      status: "ready",
      title: "Message test (chat)",
      desc: "Envoie un message bot immédiat.",
      icon: "📣",
      onOpen: () => setActiveModule("test-send"),
    },
    {
      id: "obs",
      category: "general",
      status: "ready",
      title: "Widget OBS",
      desc: "URL protégée + options overlay (Browser Source).",
      icon: "📺",
      onOpen: () => setActiveModule("obs"),
    },
    {
      id: "calls",
      category: "callhunt",
      status: "ready",
      title: "Calls & Hunt",
      desc: "Queue + limites + bans + providers autorisés.",
      icon: "🎰",
      onOpen: () => setActiveModule("calls"),
    },
    {
      id: "bot-wheel",
      category: "rubis",
      status: "ready",
      title: "Roue (tirage stream)",
      desc: "Inscriptions + tirage (bot_wheel).",
      icon: "🎡",
      onOpen: () => setActiveModule("bot-wheel"),
    },
    {
      id: "bot-rain",
      category: "rubis",
      status: "ready",
      title: "Rain (distribution)",
      desc: "Distribution automatique de rubis (live-only).",
      icon: "🌧️",
      onOpen: () => setActiveModule("bot-rain"),
    },
    {
      id: "predictions",
      category: "rubis",
      status: "ready",
      title: "Prédictions",
      desc: "Prédictions rubis live-only.",
      icon: "📊",
      onOpen: () => setActiveModule("predictions"),
    },

    { id: "chest", category: "rubis", status: "soon", title: "Coffre streamer", desc: "Ouvertures + rewards.", icon: "📦" },

    { id: "discord-setup", category: "discord", status: "soon", title: "Setup Discord", desc: "Lier / rôles.", icon: "🔗" },
    {
      id: "discord-welcome",
      category: "discord",
      status: "ready",
      title: "Welcome / Goodbye",
      desc: "Messages d’arrivée et de départ (2 salons).",
      icon: "👋",
      onOpen: () => setActiveModule("discord-welcome"),
    },

    { id: "discord-notif", category: "discord", status: "soon", title: "Notif Go Live", desc: "Ping / embed.", icon: "🔔" },

    { id: "moderation", category: "moderation", status: "soon", title: "Modération bot", desc: "Auto-mod / outils.", icon: "🛡️" },
  ];

  if (isAdmin) {
    modules.push({
      id: "admin-swap",
      category: "admin",
      status: "soon",
      title: "Admin: swap streamer",
      desc: "Changer de chaîne sans login streamer.",
      icon: "🧪",
    });
  }

  const availableCategories = CATEGORY_ORDER.filter((c) => (isAdmin ? true : c !== "admin"));

  const visibleModulesRaw = modules.filter((m) => m.category === activeCategory);

  const qNorm = q.trim().toLowerCase();
  const visibleModules = qNorm
    ? visibleModulesRaw.filter((m) => {
        const hay = `${m.title} ${m.desc ?? ""}`.toLowerCase();
        return hay.includes(qNorm);
      })
    : visibleModulesRaw;

  const modalTitle =
    activeModule === "commands"
      ? "Commandes personnalisées"
      : activeModule === "autoposts"
      ? "Messages automatiques"
      : activeModule === "clips"
      ? "Clips"
      : activeModule === "logs"
      ? "Logs"
      : activeModule === "test-send"
      ? "Message test"
      : activeModule === "obs"
      ? "Widget OBS"
      : activeModule === "calls"
      ? "Calls & Hunt"
      : activeModule === "bot-wheel"
      ? "Roue (tirage stream)"
      : activeModule === "bot-rain"
      ? "Rain (distribution)"
      : activeModule === "predictions"
      ? "Prédictions"
      : "Module";

  const modalDesc =
    activeModule === "commands"
      ? "Crée, active/désactive et supprime tes !commandes."
      : activeModule === "autoposts"
      ? "Planifie des messages (exécution live-only gérée côté bot)."
      : activeModule === "clips"
      ? "Commande chat: !clip (tout le monde par défaut). Fenêtre: 1m45 avant / 15s après."
      : activeModule === "logs"
      ? "Événements / erreurs / diagnostic du bot."
      : activeModule === "test-send"
      ? "Utile pour valider que le bot “push chat” fonctionne."
      : activeModule === "obs"
      ? "Génère l’URL Browser Source OBS (avec secret), options d’affichage et rotate."
      : activeModule === "calls"
      ? "Queue calls, limites par user, bans (users/machines/providers) + mode “autoriser seulement ces providers”."
      : activeModule === "bot-wheel"
      ? "Module bot_wheel: inscriptions + tirage (ne touche pas la roue quotidienne)."
      : activeModule === "bot-rain"
      ? "Distribution automatique de rubis (live-only) + réglages."
      : activeModule === "predictions"
      ? "Crée et gère des prédictions rubis (live-only)."
      : undefined;

  const countsText = overview?.ok
    ? `Commandes: ${overview.counts.commands} • Auto: ${overview.counts.autoposts} • Logs: ${overview.counts.logs}`
    : "Stats indisponibles";

  return (
    <div className="panel llBotPanel" style={{ padding: 14 }}>
      <style>{`
        .llBotPanel{
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(520px 220px at 10% 0%, rgba(124,77,255,0.18), rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.14));
          box-shadow: 0 18px 60px rgba(0,0,0,0.30);
          backdrop-filter: blur(10px);
        }

        .llBotTop{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .llBotTitleRow{
          display:flex;
          gap: 10px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .llBotTitle{
          font-weight: 1100;
          letter-spacing: -0.2px;
          font-size: 16px;
        }
        .llBotSlug{
          opacity: 0.7;
          font-size: 12px;
          font-weight: 900;
        }

        .llBotActions{
          display:flex;
          gap: 10px;
          align-items:center;
          flex-wrap: wrap;
        }
        .llBotStatPill{
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          font-size: 12px;
          opacity: 0.9;
          white-space: nowrap;
        }
        .llBotSearch{
          height: 38px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.90);
          padding: 0 12px;
          outline: none;
          min-width: 220px;
        }
        .llBotSearch::placeholder{
          color: rgba(255,255,255,0.45);
        }
        .llBotSearch:focus-visible{
          border-color: rgba(124,77,255,0.50);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.14);
        }

        .llBotCats{
          display:flex;
          gap: 8px;
          padding: 6px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          flex-wrap: wrap;
        }
        .llBotCat{
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 950;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.12);
          color: rgba(255,255,255,0.82);
          cursor: pointer;
          transition: transform .08s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
        }
        .llBotCat:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.05);
        }
        .llBotCat.isActive{
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.14);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }
        .llBotCat:focus-visible{
          outline: none;
          box-shadow: 0 0 0 2px rgba(124,77,255,0.18);
          border-color: rgba(124,77,255,0.55);
        }

        .llBotGrid{
          margin-top: 14px;
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        }

        .llBotCard{
          position: relative;
          width: 100%;
          text-align: left;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(180px 90px at 18% 0%, rgba(255,255,255,0.07), rgba(0,0,0,0) 62%),
            rgba(0,0,0,0.18);
          color: rgba(255,255,255,0.90);
          cursor: pointer;
          transition: transform .10s ease, border-color .14s ease, background .14s ease, box-shadow .14s ease;
          outline: none;
          backdrop-filter: blur(10px);
        }
        .llBotCard:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.16);
          background:
            radial-gradient(180px 90px at 18% 0%, rgba(255,255,255,0.10), rgba(0,0,0,0) 62%),
            rgba(255,255,255,0.05);
          box-shadow: 0 16px 40px rgba(0,0,0,0.28);
        }
        .llBotCard:focus-visible{
          box-shadow:
            0 0 0 2px rgba(124,77,255,0.18),
            0 16px 40px rgba(0,0,0,0.28);
          border-color: rgba(124,77,255,0.55);
        }
        .llBotCard.isLocked{
          opacity: 0.75;
          cursor: not-allowed;
        }
        .llBotLockedOverlay{
          position:absolute;
          inset:0;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.22));
          pointer-events:none;
        }

        .llBotCardTop{
          display:flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .llBotCardLeft{
          display:flex;
          gap: 12px;
          align-items: flex-start;
          min-width: 0;
        }
        .llBotIconWrap{
          width: 44px;
          height: 44px;
          border-radius: 16px;
          display:flex;
          align-items:center;
          justify-content:center;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(124,77,255,0.10);
          box-shadow: inset 0 -10px 18px rgba(0,0,0,0.18);
          flex: 0 0 44px;
        }
        .llBotIcon{
          font-size: 18px;
        }
        .llBotCardText{
          min-width: 0;
        }
        .llBotCardTitle{
          font-weight: 1050;
          letter-spacing: -0.2px;
          font-size: 14px;
          line-height: 1.15;
          color: rgba(255,255,255,0.92);
        }
        .llBotCardDesc{
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.35;
          color: rgba(255,255,255,0.66);
        }

        .llBotCardCtaRow{
          margin-top: 14px;
          display:flex;
          justify-content: space-between;
          align-items:center;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.08);
          opacity: 0.95;
        }
        .llBotCardCta{
          font-weight: 950;
          font-size: 12px;
          color: rgba(255,255,255,0.82);
        }
        .llBotCardArrow{
          font-weight: 950;
          opacity: 0.6;
        }

        .llBotHint{
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,90,90,0.22);
          background: rgba(255,90,90,0.10);
          color: rgba(255,200,200,0.92);
          font-size: 12px;
          font-weight: 850;
        }

        /* Modal */
        .llBotModalOverlay{
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0,0,0,0.62);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .llBotModal{
          width: min(1020px, 96vw);
          max-height: 92vh;
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(520px 240px at 10% 0%, rgba(124,77,255,0.16), rgba(0,0,0,0) 60%),
            rgba(10,10,14,0.94);
          box-shadow: 0 30px 110px rgba(0,0,0,0.60);
        }
        .llBotModalHead{
          padding: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .llBotModalTitle{
          font-weight: 1100;
          font-size: 16px;
          letter-spacing: -0.2px;
          color: rgba(255,255,255,0.92);
          line-height: 1.15;
        }
        .llBotModalDesc{
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.35;
          color: rgba(255,255,255,0.65);
        }
        .llBotModalClose{
          border-radius: 14px;
          padding: 10px 12px;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.18);
          color: rgba(255,255,255,0.86);
          cursor: pointer;
          transition: transform .08s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
        }
        .llBotModalClose:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
        }
        .llBotModalClose:focus-visible{
          outline: none;
          box-shadow: 0 0 0 2px rgba(124,77,255,0.16);
          border-color: rgba(124,77,255,0.55);
        }
        .llBotModalBody{
          padding: 16px;
          overflow: auto;
          max-height: calc(92vh - 70px);
        }

        @media (prefers-reduced-motion: reduce){
          .llBotCard, .llBotCat, .llBotModalClose{ transition: border-color .12s ease, background .12s ease, box-shadow .12s ease; }
          .llBotCard:hover, .llBotCat:hover, .llBotModalClose:hover{ transform: none; }
        }
      `}</style>

      <div className="llBotTop">
        <div>
          <div className="llBotTitleRow">
            <span className="llBotTitle">LunaBot</span>
            <span className="llBotSlug">@{streamer.slug}</span>
          </div>
        </div>

        <div className="llBotActions">
          <button className="btnGhostInline" onClick={() => reloadAll()} disabled={loading}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </button>

          <span className="llBotStatPill">{countsText}</span>

          <input
            className="llBotSearch"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un module…"
          />
        </div>
      </div>

      {err ? <div className="llBotHint">⚠️ {err}</div> : null}

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 13 }}>Modules par catégorie</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>
            Choisis une catégorie puis ouvre un module. (Astuce : utilise la recherche 🔎)
          </div>
        </div>

        <CategoryTabs
          active={activeCategory}
          categories={availableCategories}
          onChange={(c) => {
            setActiveCategory(c);
            setActiveModule(null);
          }}
        />
      </div>

      <div className="llBotGrid">
        {visibleModules.length ? (
          visibleModules.map((m) => (
            <QuickCard key={m.id} icon={m.icon} title={m.title} desc={m.desc} status={m.status} onOpen={m.onOpen} />
          ))
        ) : (
          <div className="muted" style={{ opacity: 0.75, padding: 12 }}>
            Aucun module ne correspond à ta recherche.
          </div>
        )}
      </div>

      <Modal open={!!activeModule} title={modalTitle} desc={modalDesc} onClose={() => setActiveModule(null)}>
        {activeModule === "commands" ? (
          <CommandsModule token={token} commands={commands} onReload={reloadAll} />
        ) : activeModule === "autoposts" ? (
          <AutopostsModule token={token} autoposts={autoposts} onReload={reloadAll} />
        ) : activeModule === "clips" ? (
          <ClipsModule token={token} onReload={reloadAll} />
        ) : activeModule === "logs" ? (
          <LogsModule token={token} logs={logs} onReload={reloadAll} />
        ) : activeModule === "test-send" ? (
          <TestSendModule token={token} onSent={reloadAll} />
        ) : activeModule === "obs" ? (
          <ObsWidgetModule
            token={token}
            streamerSlug={streamer.slug}
            streamerName={(streamer as any).displayName ?? streamer.slug}
            userId={(user as any)?.id ?? 0}
          />
        ) : activeModule === "calls" ? (
          <CallsModule token={token} streamerSlug={streamer.slug} />
        ) : activeModule === "bot-wheel" ? (
          <BotWheelModule token={token} />
        ) : activeModule === "bot-rain" ? (
          <BotRainModule token={token} streamerSlug={streamer.slug} />
        ) : activeModule === "predictions" ? (
          <PredictionsModule token={token} streamerId={Number(streamer.id)} streamerSlug={streamer.slug} />
        ) : activeModule === "discord-welcome" ? (
          <DiscordWelcomeModule token={token} onReload={reloadAll} />
        ) : null}
      </Modal>
    </div>
  );
}
