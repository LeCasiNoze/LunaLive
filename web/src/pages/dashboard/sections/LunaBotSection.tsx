import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";
import {
  botTestSend,
  clearMyBotLogs,
  createMyBotAutopost,
  createMyBotCommand,
  deleteMyBotAutopost,
  deleteMyBotCommand,
  getMyBotAutoposts,
  getMyBotCommands,
  getMyBotLogs,
  getMyBotOverview,
  updateMyBotAutopost,
  updateMyBotCommand,
  type ApiBotAutopost,
  type ApiBotCommand,
  type ApiBotLogRow,
  type ApiBotOverview,
} from "../../../lib/api";

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

type ModuleCategory = "general" | "rubis" | "discord" | "moderation" | "admin";

type ModuleDef = {
  id: string;
  title: string;
  desc?: string;
  icon: React.ReactNode;
  category: ModuleCategory;
  status: "ready" | "soon";
  onOpen?: () => void;
};

const CATEGORY_LABEL: Record<ModuleCategory, string> = {
  general: "Général",
  rubis: "Rubis & mini-jeux",
  discord: "Discord",
  moderation: "Modération",
  admin: "Admin",
};

const CATEGORY_ORDER: ModuleCategory[] = ["general", "rubis", "discord", "moderation", "admin"];

function Chip({
  kind,
  children,
}: {
  kind: "ready" | "soon";
  children: React.ReactNode;
}) {
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
              border: isActive
                ? "1px solid rgba(124,77,255,0.55)"
                : "1px solid rgba(255,255,255,0.10)",
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
// Panels
// ──────────────────────────────────────────

function CommandsPanel({
  token,
  commands,
  onReload,
}: {
  token: string;
  commands: ApiBotCommand[];
  onReload: () => Promise<void>;
}) {
  const [newTrigger, setNewTrigger] = React.useState("");
  const [newResp, setNewResp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function add() {
    setErr(null);
    setBusy(true);
    try {
      await createMyBotCommand(token, { trigger: newTrigger, response: newResp, enabled: true });
      setNewTrigger("");
      setNewResp("");
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>Commandes personnalisées</span>
        <span className="muted" style={{ fontSize: 12 }}>
          Prefix fixe: <b>!</b>
        </span>
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={newTrigger}
          onChange={(e) => setNewTrigger(e.target.value)}
          placeholder="trigger (ex: discord)"
          style={{
            flex: "0 0 200px",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <input
          value={newResp}
          onChange={(e) => setNewResp(e.target.value)}
          placeholder="réponse"
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <button className="btnGhostInline" disabled={busy} onClick={add}>
          Ajouter
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {commands.length === 0 ? (
          <div className="muted">Aucune commande.</div>
        ) : (
          commands.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.10)",
              }}
            >
              <div style={{ width: 160, fontWeight: 900 }}>!{c.trigger}</div>
              <div className="muted" style={{ flex: 1 }}>
                {c.response}
              </div>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await updateMyBotCommand(token, c.id, { enabled: !c.enabled });
                  await onReload();
                }}
              >
                {c.enabled ? "Désactiver" : "Activer"}
              </button>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await deleteMyBotCommand(token, c.id);
                  await onReload();
                }}
              >
                Supprimer
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AutopostsPanel({
  token,
  autoposts,
  onReload,
}: {
  token: string;
  autoposts: ApiBotAutopost[];
  onReload: () => Promise<void>;
}) {
  const [newMsg, setNewMsg] = React.useState("");
  const [newEvery, setNewEvery] = React.useState(600);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function add() {
    setErr(null);
    setBusy(true);
    try {
      await createMyBotAutopost(token, { message: newMsg, everySec: newEvery, enabled: true });
      setNewMsg("");
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle">Messages automatiques</div>
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
        Note: l’exécution live-only sera gérée côté bot (pas ici).
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          placeholder="message"
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <input
          type="number"
          value={newEvery}
          onChange={(e) => setNewEvery(Number(e.target.value))}
          placeholder="everySec"
          style={{
            width: 140,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.12)",
            color: "inherit",
          }}
        />
        <button className="btnGhostInline" disabled={busy} onClick={add}>
          Ajouter
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {autoposts.length === 0 ? (
          <div className="muted">Aucun auto-message.</div>
        ) : (
          autoposts.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.10)",
              }}
            >
              <div style={{ width: 120, fontWeight: 900 }}>{p.everySec}s</div>
              <div className="muted" style={{ flex: 1 }}>
                {p.message}
              </div>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await updateMyBotAutopost(token, p.id, { enabled: !p.enabled });
                  await onReload();
                }}
              >
                {p.enabled ? "Désactiver" : "Activer"}
              </button>

              <button
                className="btnGhostInline"
                onClick={async () => {
                  await deleteMyBotAutopost(token, p.id);
                  await onReload();
                }}
              >
                Supprimer
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LogsPanel({
  token,
  logs,
  onReload,
}: {
  token: string;
  logs: ApiBotLogRow[];
  onReload: () => Promise<void>;
}) {
  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>Logs</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btnGhostInline" onClick={onReload}>
            Rafraîchir
          </button>
          <button
            className="btnGhostInline"
            onClick={async () => {
              await clearMyBotLogs(token);
              await onReload();
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {logs.length === 0 ? (
          <div className="muted">Aucun log.</div>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="muted" style={{ fontSize: 12, opacity: 0.9 }}>
              <b style={{ opacity: 0.9 }}>{String(l.level).toUpperCase()}</b> — {l.message}{" "}
              <span style={{ opacity: 0.6 }}>({new Date(l.createdAt).toLocaleString()})</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
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
  const [activeModule, setActiveModule] = React.useState<string | null>(null);

  const [testBody, setTestBody] = React.useState("Test LunaBot ✅");

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

  if (!token) {
    return (
      <div className="panel">
        <div className="panelTitle">LunaBot</div>
        <div className="muted">Connecte-toi pour accéder à cet onglet.</div>
      </div>
    );
  }

  const modules: ModuleDef[] = [
    // GENERAL
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

    // RUBIS
    { id: "wheel", category: "rubis", status: "soon", title: "Roue / tickets", desc: "Join + tirage.", icon: "🎡" },
    { id: "rains", category: "rubis", status: "soon", title: "Rains", desc: "Distribution live-only.", icon: "🌧️" },
    { id: "predictions", category: "rubis", status: "soon", title: "Prédictions", desc: "Rubis live-only.", icon: "📊" },
    { id: "chest", category: "rubis", status: "soon", title: "Coffre streamer", desc: "Ouvertures + rewards.", icon: "📦" },

    // DISCORD
    { id: "discord-setup", category: "discord", status: "soon", title: "Setup Discord", desc: "Lier / rôles.", icon: "🔗" },
    { id: "discord-notif", category: "discord", status: "soon", title: "Notif Go Live", desc: "Ping / embed.", icon: "🔔" },

    // MODERATION
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

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>LunaBot</span>
        <span style={{ opacity: 0.7, fontSize: 12, fontWeight: 900 }}>
          @{streamer.slug}
        </span>
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      {/* Header actions / stats */}
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

      {/* Categories */}
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

      {/* Grid */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {visibleModules.map((m) => (
          <QuickCard
            key={m.id}
            icon={m.icon}
            title={m.title}
            desc={m.desc}
            status={m.status}
            onOpen={m.onOpen}
          />
        ))}
      </div>

      {/* Active module panel */}
      {activeModule ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 950 }}>
              {activeModule === "commands"
                ? "Commandes"
                : activeModule === "autoposts"
                ? "Messages automatiques"
                : activeModule === "logs"
                ? "Logs"
                : activeModule === "test-send"
                ? "Message test"
                : "Module"}
            </div>
            <button className="btnGhostInline" onClick={() => setActiveModule(null)}>
              Fermer
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            {activeModule === "commands" ? (
              <CommandsPanel token={token} commands={commands} onReload={reloadAll} />
            ) : activeModule === "autoposts" ? (
              <AutopostsPanel token={token} autoposts={autoposts} onReload={reloadAll} />
            ) : activeModule === "logs" ? (
              <LogsPanel token={token} logs={logs} onReload={reloadAll} />
            ) : activeModule === "test-send" ? (
              <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
                <div className="panelTitle">Envoyer un message bot</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Utile pour valider que le bot “push chat” fonctionne.
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <input
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    placeholder="Message"
                    style={{
                      flex: "1 1 360px",
                      minWidth: 240,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.12)",
                      color: "inherit",
                    }}
                  />
                  <button
                    className="btnGhostInline"
                    onClick={async () => {
                      await botTestSend(token, testBody);
                      await reloadAll();
                    }}
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
