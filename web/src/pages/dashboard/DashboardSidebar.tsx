import type { ApiMyStreamer } from "../../lib/api";

export type DashboardTab =
  | "overview"
  | "stream"
  | "moderation"
  | "appearance"
  | "earnings"
  | "stats"
  | "settings";

export function DashboardSidebar({
  tab,
  setTab,
  streamer,
}: {
  tab: DashboardTab;
  setTab: (t: DashboardTab) => void;
  streamer: ApiMyStreamer;
}) {
  const items: { id: DashboardTab; label: string; hint?: string }[] = [
    { id: "overview", label: "Vue d’ensemble" },
    { id: "stream", label: "Stream", hint: "Titre + clés RTMP" },
    { id: "moderation", label: "Modération", hint: "Modos / bans / règles chat" },
    { id: "appearance", label: "Apparence", hint: "Chat DLive / couleurs / badges" },
    { id: "earnings", label: "Revenus", hint: "Subs / donos (plus tard)" },
    { id: "stats", label: "Stats", hint: "Analytics (MVP bientôt)" },
    { id: "settings", label: "Paramètres" },
  ];

  return (
    <aside className="panel" style={{ position: "sticky", top: 12 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>Menu</span>
        <span style={{ opacity: 0.7, fontSize: 12, fontWeight: 800 }}>
          @{streamer.slug}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {items.map((it) => {
          const active = it.id === tab;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className="btnGhostInline"
              style={{
                textAlign: "left",
                width: "100%",
                padding: "10px 12px",
                borderRadius: 14,
                border: active ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.08)",
                background: active ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
                fontWeight: 900,
              }}
            >
              <div style={{ fontSize: 14 }}>{it.label}</div>
              {it.hint ? <div style={{ marginTop: 2, fontSize: 12, opacity: 0.7 }}>{it.hint}</div> : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
