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
import { CallsHuntModule } from "./modules/CallsHuntModule";

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
  | "call-hunt"
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

function Chip({ kind, children }: { kind: "ready" | "soon"; children: React.ReactNode }) {
  const base: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.20)",
    opacity: 0.95,
    whiteSpace: "nowrap",
  };

  if (kind === "ready") {
    return (
      <span
        style={{
          ...base,
          border: "1px solid rgba(60, 240, 180, 0.30)",
          background: "rgba(60, 240, 180, 0.10)",
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
    <div
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 8,
        padding: 6,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.14)",
      }}
    >
      {categories.map((cat) => {
        const isActive = active === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className="btnGhostInline"
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              fontWeight: 900,
              border: isActive ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
              background: isActive ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
            }}
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
    <div
      className="panel"
      style={{
        padding: 14,
        borderRadius: 18,
        opacity: locked ? 0.7 : 1,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(124,77,255,0.10)",
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.1 }}>{title}</div>
            {desc ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {desc}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {status === "ready" ? <Chip kind="ready">DISPO</Chip> : <Chip kind="soon">BIENTÔT</Chip>}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btnGhostInline"
          onClick={() => {
            if (locked) return;
            onOpen?.();
          }}
          disabled={locked || !onOpen}
          style={{ padding: "10px 12px", borderRadius: 14, fontWeight: 950 }}
        >
          {locked ? "Bientôt" : "Ouvrir"}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Modal (popup)
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{
          width: "min(980px, 96vw)",
          maxHeight: "92vh",
          overflow: "hidden",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(10,10,10,0.92)",
          boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, fontSize: 16, lineHeight: 1.1 }}>{title}</div>
            {desc ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {desc}
              </div>
            ) : null}
          </div>

          <button
            className="btnGhostInline"
            onClick={onClose}
            style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 16, overflow: "auto", maxHeight: "calc(92vh - 70px)" }}>{children}</div>
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

    // ✅ NEW: Call & Hunt
    {
      id: "call-hunt",
      category: "callhunt",
      status: "ready",
      title: "Calls & Hunt (settings + bans)",
      desc: "Limites, bans users/machines/providers, allowlist providers.",
      icon: "🎯",
      onOpen: () => setActiveModule("call-hunt"),
    },

    { id: "wheel", category: "rubis", status: "soon", title: "Roue / tickets", desc: "Join + tirage.", icon: "🎡" },
    { id: "rains", category: "rubis", status: "soon", title: "Rains", desc: "Distribution live-only.", icon: "🌧️" },
    { id: "predictions", category: "rubis", status: "soon", title: "Prédictions", desc: "Rubis live-only.", icon: "📊" },
    { id: "chest", category: "rubis", status: "soon", title: "Coffre streamer", desc: "Ouvertures + rewards.", icon: "📦" },

    { id: "discord-setup", category: "discord", status: "soon", title: "Setup Discord", desc: "Lier / rôles.", icon: "🔗" },
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
  const visibleModules = modules.filter((m) => m.category === activeCategory);

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
      : activeModule === "call-hunt"
      ? "Call & Hunt"
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
      : activeModule === "call-hunt"
      ? "Gère les paramètres de calls et les bans (users/machines/providers) + mode allowlist providers."
      : undefined;

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>LunaBot</span>
        <span style={{ opacity: 0.7, fontSize: 12, fontWeight: 900 }}>@{streamer.slug}</span>
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <button className="btnGhostInline" onClick={() => reloadAll()} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>

        <div className="muted" style={{ fontSize: 12 }}>
          {overview?.ok ? (
            <>
              Commandes: <b>{overview.counts.commands}</b> • Auto: <b>{overview.counts.autoposts}</b> • Logs:{" "}
              <b>{overview.counts.logs}</b>
            </>
          ) : (
            <>Stats indisponibles</>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 13 }}>Modules par catégorie</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Choisis une catégorie pour afficher les modules associés.
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

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {visibleModules.map((m) => (
          <QuickCard key={m.id} icon={m.icon} title={m.title} desc={m.desc} status={m.status} onOpen={m.onOpen} />
        ))}
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
        ) : activeModule === "call-hunt" ? (
          <CallsHuntModule token={token} streamerSlug={streamer.slug} />
        ) : null}
      </Modal>
    </div>
  );
}
