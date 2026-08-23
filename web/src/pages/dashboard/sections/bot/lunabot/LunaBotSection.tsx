// web/src/pages/dashboard/sections/bot/LunaBotSection.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — LunaBotSection
//  Ergonomie : tabs sticky, grid 3-col, modal bottom-sheet mobile,
//  ordre logique (général → mini-jeux → discord → modération)
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { createPortal } from "react-dom";
import {
  Bot as BotIcon,
  ChartSpline,
  CircleDotDashed,
  CloudRain,
  Dices,
  FileClock,
  Gift,
  Link,
  MessageCircleMore,
  MonitorPlay,
  Scissors,
  ShieldCheck,
  TerminalSquare,
  TimerReset,
} from "lucide-react";
import { useAuth } from "../../../../../auth/AuthProvider";
import {
  getMyBotAutoposts, getMyBotCommands, getMyBotDashboard, getMyBotLogs,
  type ApiBotAutopost, type ApiBotCommand, type ApiBotLogRow,
  type ApiMyStreamer,
} from "./api";

import { CommandsModule } from "./modules/CommandsModule";
import { AutopostsModule } from "./modules/AutopostsModule";
import { LogsModule } from "./modules/LogsModule";
import { ObsWidgetModule } from "./modules/ObsWidgetModule";
import { ClipsModule } from "./modules/ClipsModule";
import { CallsModule } from "./modules/CallsHuntModule";
import { BotWheelModule } from "./modules/BotWheelModule";
import { BotRainModule } from "./modules/BotRainModule";
import { PredictionsModule } from "./modules/PredictionsModule";
import { DiscordWelcomeModule } from "./modules/DiscordWelcomeModule";

/* ─── Types ────────────────────────────────────────────────── */
type ModuleCategory = "general" | "minigames" | "discord" | "moderation" | "admin";
type ActiveModule =
  | "obs" | "commands" | "autoposts" | "clips" | "logs"
  | "calls" | "bot-wheel" | "bot-rain" | "predictions"
  | "discord-welcome" | null;

type ModuleDef = {
  id: string; title: string; desc?: string; icon: React.ReactNode;
  category: ModuleCategory; status: "ready" | "soon"; onOpen?: () => void;
};

const CATEGORY_LABEL: Record<ModuleCategory, string> = {
  general:    "General",
  minigames:  "Mini-jeux & Rubis",
  discord:    "Discord",
  moderation: "Moderation",
  admin:      "Admin",
};
const CATEGORY_ORDER: ModuleCategory[] = ["general", "minigames", "discord", "moderation", "admin"];

/* ─── CSS ──────────────────────────────────────────────────── */
const BOT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

.bot-root {
  padding:16px; border-radius:22px;
  border:1px solid rgba(124,92,252,.18); background:rgba(11,9,22,.92);
  box-shadow:0 24px 70px rgba(0,0,0,.40);
  backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
  position:relative; overflow:hidden;
}
.bot-root::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.28) 40%,rgba(91,142,248,.20) 60%,transparent);
  pointer-events:none; z-index:1;
}

/* Header */
.bot-header {
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;
  margin-bottom:16px; position:relative; z-index:2;
}
.bot-title { font-weight:800; font-size:18px; letter-spacing:-.4px; line-height:1.1;
  background:linear-gradient(105deg,#c4b5fd,#7c5cfc,#5b8ef8); -webkit-background-clip:text;
  background-clip:text; color:transparent;
}
.bot-slug { font-size:12px; font-weight:700; color:rgba(167,139,250,.60); margin-left:8px; }
.bot-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.bot-btn { padding:8px 14px; border-radius:12px; cursor:pointer; font-weight:800; font-size:12px;
  border:1px solid rgba(124,92,252,.22); background:rgba(124,92,252,.10);
  color:rgba(196,181,253,.85); transition:all 130ms ease;
}
.bot-btn:hover { background:rgba(124,92,252,.18); border-color:rgba(124,92,252,.36); }
.bot-btn:disabled { opacity:.45; cursor:not-allowed; }
.bot-stats { padding:7px 11px; border-radius:999px; font-size:11px; font-weight:700;
  border:1px solid rgba(124,92,252,.14); background:rgba(124,92,252,.06);
  color:rgba(167,139,250,.75);
}
.bot-search { height:38px; padding:0 13px; border-radius:12px; outline:none;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); font-size:13px; font-weight:700; min-width:200px;
  transition:all 140ms ease;
}
.bot-search::placeholder { color:rgba(167,139,250,.38); }
.bot-search:focus { border-color:rgba(124,92,252,.44); box-shadow:0 0 0 3px rgba(124,92,252,.12); }

/* Tabs sticky */
.bot-tabs-wrap {
  position:sticky; top:72px; z-index:10; margin:0 -16px 16px;
  background:linear-gradient(180deg,rgba(11,9,22,.98),rgba(11,9,22,.94));
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  padding:12px 16px; border-bottom:1px solid rgba(124,92,252,.10);
}
.bot-tabs { display:flex; gap:6px; flex-wrap:wrap; }
.bot-tab {
  padding:9px 14px; border-radius:999px; cursor:pointer; font-weight:800; font-size:12px;
  border:1px solid rgba(124,92,252,.14); background:rgba(124,92,252,.06);
  color:rgba(167,139,250,.70); transition:all 130ms ease; white-space:nowrap;
}
.bot-tab:hover { background:rgba(124,92,252,.12); border-color:rgba(124,92,252,.24); }
.bot-tab.active {
  border-color:rgba(124,92,252,.40); background:rgba(124,92,252,.18);
  color:rgba(235,232,255,.95); box-shadow:0 0 14px rgba(124,92,252,.16);
}

/* Grid cards */
.bot-grid {
  display:grid; grid-template-columns:repeat(3,1fr); gap:12px;
}
@media (max-width:980px) { .bot-grid { grid-template-columns:repeat(2,1fr); } }
@media (max-width:600px) { .bot-grid { grid-template-columns:1fr; } }

.bot-card {
  padding:14px; border-radius:18px; text-align:left; cursor:pointer;
  border:1px solid rgba(124,92,252,.12); background:rgba(124,92,252,.05);
  transition:all 140ms ease; position:relative; overflow:hidden;
}
.bot-card:hover { border-color:rgba(124,92,252,.28); background:rgba(124,92,252,.12);
  box-shadow:0 12px 36px rgba(0,0,0,.32); transform:translateY(-1px);
}
.bot-card.locked { opacity:.60; cursor:not-allowed; }
.bot-card.locked:hover { transform:none; }

.bot-card-top { display:flex; gap:12px; align-items:flex-start; justify-content:space-between; }
.bot-card-left { display:flex; gap:10px; align-items:flex-start; min-width:0; flex:1; }
.bot-icon-wrap {
  width:40px; height:40px; border-radius:14px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  border:1px solid rgba(124,92,252,.24); background:rgba(124,92,252,.14);
}
.bot-icon { font-size:18px; }
.bot-card-text { min-width:0; }
.bot-card-title { font-weight:800; font-size:13px; color:rgba(235,232,255,.92);
  line-height:1.25; letter-spacing:-.15px;
}
.bot-card-desc { margin-top:4px; font-size:11px; font-weight:700;
  color:rgba(167,139,250,.65); line-height:1.35;
}
.bot-badge {
  padding:4px 8px; border-radius:999px; font-size:10px; font-weight:800;
  letter-spacing:.04em; white-space:nowrap; flex-shrink:0;
}
.bot-badge.ready {
  border:1px solid rgba(52,211,153,.28); background:rgba(52,211,153,.10);
  color:rgba(110,231,183,.90);
}
.bot-badge.soon {
  border:1px solid rgba(251,191,36,.24); background:rgba(251,191,36,.08);
  color:rgba(253,230,138,.85);
}
.bot-card-cta {
  margin-top:12px; padding-top:10px; border-top:1px solid rgba(124,92,252,.08);
  display:flex; justify-content:space-between; align-items:center;
}
.bot-card-cta-text { font-size:11px; font-weight:800; color:rgba(196,181,253,.75); }
.bot-card-arrow { opacity:.55; }

/* Modal bottom-sheet */
.bot-modal-overlay {
  position:fixed; inset:0; z-index:9999;
  background:rgba(4,3,10,.75); backdrop-filter:blur(16px);
  display:flex; align-items:flex-end; justify-content:center;
}
@media (min-width:700px) { .bot-modal-overlay { align-items:center; } }

.bot-modal {
  width:min(1100px,100%); max-height:94svh; overflow:hidden;
  border-radius:24px 24px 0 0; border:1px solid rgba(124,92,252,.22);
  background:rgba(11,9,22,.98); box-shadow:0 -24px 90px rgba(0,0,0,.70);
  backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  display:flex; flex-direction:column;
}
@media (min-width:700px) { .bot-modal { border-radius:24px; max-height:92svh; } }

.bot-modal::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.40) 35%,rgba(91,142,248,.28) 65%,transparent);
  pointer-events:none; z-index:2;
}
.bot-modal-handle {
  width:36px; height:4px; border-radius:999px; background:rgba(124,92,252,.30);
  margin:10px auto 4px; flex-shrink:0;
}
.bot-modal-header {
  padding:14px 18px; border-bottom:1px solid rgba(124,92,252,.12);
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
  flex-shrink:0; background:linear-gradient(135deg,rgba(124,92,252,.14),rgba(59,77,200,.08));
}
.bot-modal-title-wrap { min-width:0; flex:1; }
.bot-modal-title { font-weight:800; font-size:16px; letter-spacing:-.3px;
  background:linear-gradient(105deg,#c4b5fd,#7c5cfc,#5b8ef8); -webkit-background-clip:text;
  background-clip:text; color:transparent; line-height:1.2;
}
.bot-modal-desc { margin-top:4px; font-size:12px; font-weight:700;
  color:rgba(167,139,250,.70); line-height:1.4;
}
.bot-modal-close {
  width:36px; height:36px; border-radius:11px; flex-shrink:0;
  border:1px solid rgba(124,92,252,.20); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.75); cursor:pointer; display:grid; place-items:center;
  font-size:14px; transition:all 130ms ease;
}
.bot-modal-close:hover { background:rgba(124,92,252,.16); border-color:rgba(124,92,252,.36); }
.bot-modal-body { padding:18px; overflow-y:auto; flex:1; }

/* Hint error */
.bot-hint {
  margin-top:10px; padding:10px 13px; border-radius:13px;
  border:1px solid rgba(239,68,68,.26); background:rgba(239,68,68,.10);
  font-size:12px; font-weight:700; color:rgba(252,165,165,.90);
}
.bot-empty {
  padding:16px; text-align:center; font-size:13px; font-weight:700;
  color:rgba(167,139,250,.55);
}
`;

/* ─── Sub-components ───────────────────────────────────────── */
function Badge({ kind, children }: { kind: "ready" | "soon"; children: React.ReactNode }) {
  return <span className={`bot-badge ${kind}`}>{children}</span>;
}

function ModuleCard({ m }: { m: ModuleDef }) {
  const locked = m.status !== "ready";
  return (
    <button
      type="button"
      className={`bot-card${locked ? " locked" : ""}`}
      onClick={() => { if (!locked) m.onOpen?.(); }}
      disabled={locked || !m.onOpen}
    >
      <div className="bot-card-top">
        <div className="bot-card-left">
          <div className="bot-icon-wrap"><span className="bot-icon">{m.icon}</span></div>
          <div className="bot-card-text">
            <div className="bot-card-title">{m.title}</div>
            {m.desc ? <div className="bot-card-desc">{m.desc}</div> : null}
          </div>
        </div>
        <Badge kind={m.status}>{m.status === "ready" ? "DISPO" : "BIENTÔT"}</Badge>
      </div>
      <div className="bot-card-cta">
        <span className="bot-card-cta-text">{locked ? "Bientôt disponible" : "Ouvrir le module"}</span>
        <span className="bot-card-arrow">→</span>
      </div>
    </button>
  );
}

function Modal({ open, title, desc, onClose, children }: {
  open: boolean; title: string; desc?: string; onClose: () => void; children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="bot-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bot-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="bot-modal-handle" />
        <div className="bot-modal-header">
          <div className="bot-modal-title-wrap">
            <div className="bot-modal-title">{title}</div>
            {desc ? <div className="bot-modal-desc">{desc}</div> : null}
          </div>
          <button className="bot-modal-close" onClick={onClose} type="button" aria-label="Fermer">✕</button>
        </div>
        <div className="bot-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Main ─────────────────────────────────────────────────── */
export function LunaBotSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token, user } = useAuth();

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [commands, setCommands] = React.useState<ApiBotCommand[]>([]);
  const [autoposts, setAutoposts] = React.useState<ApiBotAutopost[]>([]);
  const [logs, setLogs] = React.useState<ApiBotLogRow[]>([]);
  const [configLoaded, setConfigLoaded] = React.useState(false);
  const [logsLoaded, setLogsLoaded] = React.useState(false);

  const [activeCategory, setActiveCategory] = React.useState<ModuleCategory>("general");
  const [activeModule, setActiveModule] = React.useState<ActiveModule>(null);
  const [q, setQ] = React.useState("");

  const isAdmin = user?.role === "admin";

  const reloadAll = React.useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const data = await getMyBotDashboard(token);
      setCommands(data.commands);
      setAutoposts(data.autoposts);
      setConfigLoaded(true);
    } catch (error: unknown) { setErr(error instanceof Error ? error.message : "Erreur"); }
    finally { setLoading(false); }
  }, [token]);

  async function reloadCommands() {
    if (!token) return;
    const result = await getMyBotCommands(token);
    setCommands(result.commands);
    setConfigLoaded(true);
  }

  async function reloadAutoposts() {
    if (!token) return;
    const result = await getMyBotAutoposts(token);
    setAutoposts(result.autoposts);
    setConfigLoaded(true);
  }

  const reloadLogs = React.useCallback(async () => {
    if (!token) return;
    const result = await getMyBotLogs(token, 60);
    setLogs(result.logs);
    setLogsLoaded(true);
  }, [token]);

  React.useEffect(() => { void reloadAll(); }, [reloadAll]);
  React.useEffect(() => {
    if (activeModule === "logs" && !logsLoaded) void reloadLogs();
  }, [activeModule, logsLoaded, reloadLogs]);

  if (!token) {
    return (
      <div className="panel">
        <div className="panelTitle">LunaBot</div>
        <div className="muted">Connecte-toi pour accéder à cet onglet.</div>
      </div>
    );
  }

  /* ── Modules définis dans l'ordre logique ────────────────── */
  const modules: ModuleDef[] = [
    // Général (5 modules - ordre : OBS, Commandes, Autoposts, Clips, Logs)
    { id: "obs", category: "general", status: "ready", title: "Widget OBS", desc: "Source navigateur securisee", icon: <MonitorPlay size={19} />, onOpen: () => setActiveModule("obs") },
    { id: "commands", category: "general", status: "ready", title: "Commandes", desc: "Reponses personnalisees", icon: <TerminalSquare size={19} />, onOpen: () => setActiveModule("commands") },
    { id: "autoposts", category: "general", status: "ready", title: "Autoposts", desc: "Messages automatiques", icon: <TimerReset size={19} />, onOpen: () => setActiveModule("autoposts") },
    { id: "clips", category: "general", status: "ready", title: "Clips", desc: "Creation et telechargement", icon: <Scissors size={19} />, onOpen: () => setActiveModule("clips") },
    { id: "logs", category: "general", status: "ready", title: "Journal", desc: "Evenements et diagnostic", icon: <FileClock size={19} />, onOpen: () => setActiveModule("logs") },

    // Mini-jeux & Rubis (5 modules)
    { id: "calls", category: "minigames", status: "ready", title: "Calls & Hunt", desc: "File, limites et exclusions", icon: <Dices size={19} />, onOpen: () => setActiveModule("calls") },
    { id: "bot-wheel", category: "minigames", status: "ready", title: "Roue", desc: "Inscriptions et tirage", icon: <CircleDotDashed size={19} />, onOpen: () => setActiveModule("bot-wheel") },
    { id: "bot-rain", category: "minigames", status: "ready", title: "Rain", desc: "Distribution de rubis", icon: <CloudRain size={19} />, onOpen: () => setActiveModule("bot-rain") },
    { id: "predictions", category: "minigames", status: "ready", title: "Predictions", desc: "Predictions en direct", icon: <ChartSpline size={19} />, onOpen: () => setActiveModule("predictions") },
    { id: "chest", category: "minigames", status: "soon", title: "Coffre streamer", desc: "Ouvertures et recompenses", icon: <Gift size={19} /> },

    // Discord (3 modules)
    { id: "discord-setup", category: "discord", status: "soon", title: "Connexion Discord", desc: "Lier le bot et les roles", icon: <Link size={19} /> },
    { id: "discord-welcome", category: "discord", status: "ready", title: "Accueil Discord", desc: "Messages d'arrivee et de depart", icon: <MessageCircleMore size={19} />, onOpen: () => setActiveModule("discord-welcome") },
    { id: "discord-notif", category: "discord", status: "soon", title: "Alerte Go Live", desc: "Notification de direct", icon: <BotIcon size={19} /> },

    // Modération (1 module)
    { id: "moderation", category: "moderation", status: "soon", title: "Moderation bot", desc: "Filtres et outils automatiques", icon: <ShieldCheck size={19} /> },
  ];

  if (isAdmin) {
    modules.push({ id: "admin-swap", category: "admin", status: "soon", title: "Swap streamer", desc: "Changer chaîne (admin)", icon: "🧪" });
  }

  const availableCategories = CATEGORY_ORDER.filter(c => isAdmin || c !== "admin");
  const visibleModulesRaw = modules.filter(m => m.category === activeCategory);
  const qNorm = q.trim().toLowerCase();
  const visibleModules = qNorm
    ? visibleModulesRaw.filter(m => `${m.title} ${m.desc ?? ""}`.toLowerCase().includes(qNorm))
    : visibleModulesRaw;

  const modalMeta: Record<string, { title: string; desc?: string }> = {
    obs:       { title: "Widget OBS", desc: "URL Browser Source (avec secret) + options overlay." },
    commands:  { title: "Commandes personnalisées", desc: "Crée, active/désactive et supprime tes !commandes." },
    autoposts: { title: "Messages automatiques", desc: "Planifie des messages (exécution live-only)." },
    clips:     { title: "Clips (!clip)", desc: "Fenetre : 1m45 avant / 15s apres." },
    logs:      { title: "Logs & diagnostic", desc: "Événements / erreurs bot." },
    calls:     { title: "Calls & Hunt", desc: "Queue, limites user, bans (users/machines/providers)." },
    "bot-wheel": { title: "Roue (tirage stream)", desc: "Inscriptions + tirage (bot_wheel)." },
    "bot-rain":  { title: "Rain (distribution)", desc: "Distribution auto rubis (live-only)." },
    predictions: { title: "Prédictions", desc: "Crée et gère prédictions rubis (live-only)." },
    "discord-welcome": { title: "Discord Welcome/Goodbye", desc: "Messages arrivée/départ (2 salons)." },
  };
  const meta = activeModule ? modalMeta[activeModule] : null;
  const countsText = configLoaded
    ? `Cmd: ${commands.length} • Auto: ${autoposts.length}`
    : "Chargement...";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BOT_CSS }} />
      <div className="bot-root">
        {/* Header */}
        <div className="bot-header">
          <div>
            <span className="bot-title">LunaBot</span>
            <span className="bot-slug">@{streamer.slug}</span>
          </div>
          <div className="bot-actions">
            <button className="bot-btn" onClick={reloadAll} disabled={loading}>
              {loading ? "Mise a jour..." : "Actualiser"}
            </button>
            <span className="bot-stats">{countsText}</span>
            <input className="bot-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un module" />
          </div>
        </div>

        {err ? <div className="bot-hint">⚠️ {err}</div> : null}

        {/* Tabs sticky */}
        <div className="bot-tabs-wrap">
          <div className="bot-tabs">
            {availableCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`bot-tab${activeCategory === cat ? " active" : ""}`}
                onClick={() => { setActiveCategory(cat); setActiveModule(null); }}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Grid cards */}
        <div className="bot-grid">
          {visibleModules.length ? (
            visibleModules.map(m => <ModuleCard key={m.id} m={m} />)
          ) : (
            <div className="bot-empty">Aucun module ne correspond à ta recherche.</div>
          )}
        </div>

        {/* Modal */}
        <Modal open={!!activeModule} title={meta?.title ?? "Module"} desc={meta?.desc} onClose={() => setActiveModule(null)}>
          {activeModule === "obs" ? (
            <ObsWidgetModule
              token={token}
              streamerSlug={streamer.slug}
              streamerName={streamer.displayName ?? streamer.slug}
              userId={user?.id ?? 0}
            />
          ) : activeModule === "commands" && !configLoaded ? (
            <div className="bot-empty">Chargement des commandes...</div>
          ) : activeModule === "commands" ? (
            <CommandsModule token={token} commands={commands} onReload={reloadCommands} />
          ) : activeModule === "autoposts" && !configLoaded ? (
            <div className="bot-empty">Chargement des messages automatiques...</div>
          ) : activeModule === "autoposts" ? (
            <AutopostsModule token={token} autoposts={autoposts} onReload={reloadAutoposts} />
          ) : activeModule === "clips" ? (
            <ClipsModule token={token} onReload={reloadLogs} />
          ) : activeModule === "logs" && !logsLoaded ? (
            <div className="bot-empty">Chargement du journal...</div>
          ) : activeModule === "logs" ? (
            <LogsModule token={token} logs={logs} onReload={reloadLogs} />
          ) : activeModule === "calls" ? (
            <CallsModule token={token} streamerSlug={streamer.slug} />
          ) : activeModule === "bot-wheel" ? (
            <BotWheelModule token={token} />
          ) : activeModule === "bot-rain" ? (
            <BotRainModule token={token} streamerSlug={streamer.slug} />
          ) : activeModule === "predictions" ? (
            <PredictionsModule token={token} streamerId={Number(streamer.id)} streamerSlug={streamer.slug} />
          ) : activeModule === "discord-welcome" ? (
            <DiscordWelcomeModule token={token} onReload={reloadLogs} />
          ) : null}
        </Modal>
      </div>
    </>
  );
}
