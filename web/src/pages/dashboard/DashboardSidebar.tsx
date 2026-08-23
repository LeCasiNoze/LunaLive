import * as React from "react";
import {
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clapperboard,
  Handshake,
  LayoutDashboard,
  MessageCircleMore,
  Palette,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { ApiMyStreamer } from "../../lib/api";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "S";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first}${last ?? ""}`.toUpperCase();
}

function absoluteAvatarUrl(streamer: ApiMyStreamer) {
  const raw = streamer.avatarUrl || (streamer.ownerUserId ? `/avatars/u/${streamer.ownerUserId}` : "");
  if (!raw) return null;
  const absolute = /^https?:\/\//i.test(raw) ? raw : raw.startsWith("/") ? `${API_BASE}${raw}` : raw;
  if (/\/avatars\/u\/\d+$/i.test(absolute)) return `${absolute}?v=${Math.floor(Date.now() / 60_000)}`;
  return absolute;
}

export function DashboardAvatar({ streamer, className = "" }: { streamer: ApiMyStreamer; className?: string }) {
  const src = absoluteAvatarUrl(streamer);
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

  return (
    <span className={`studio-avatar ${className}`.trim()}>
      {src && failedSrc !== src ? (
        <img src={src} alt={`Avatar de ${streamer.displayName}`} onError={() => setFailedSrc(src)} />
      ) : (
        <span aria-hidden>{initials(streamer.displayName)}</span>
      )}
    </span>
  );
}

export type DashboardTab =
  | "overview"
  | "agency"
  | "lunabot"
  | "stream"
  | "moderation"
  | "appearance"
  | "emotes"
  | "earnings"
  | "stats"
  | "settings";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: DashboardTab; label: string; hint: string; icon: typeof LayoutDashboard }>;
}> = [
  {
    label: "Piloter",
    items: [
      { id: "overview", label: "Vue d'ensemble", hint: "Etat de la chaine", icon: LayoutDashboard },
      { id: "stream", label: "Diffusion", hint: "Titre et connexion", icon: Clapperboard },
      { id: "lunabot", label: "LunaBot", hint: "Automatisations", icon: Bot },
    ],
  },
  {
    label: "Communaute",
    items: [
      { id: "moderation", label: "Moderation", hint: "Equipe et securite", icon: ShieldCheck },
      { id: "appearance", label: "Apparence", hint: "Identite de chaine", icon: Palette },
      { id: "emotes", label: "Emojis & GIFs", hint: "Bibliotheque chat", icon: MessageCircleMore },
    ],
  },
  {
    label: "Activite",
    items: [
      { id: "agency", label: "Agence", hint: "Affiliation", icon: Handshake },
      { id: "earnings", label: "Revenus", hint: "Soldes et retraits", icon: CircleDollarSign },
      { id: "stats", label: "Statistiques", hint: "Tendances et audience", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Systeme",
    items: [{ id: "settings", label: "Parametres", hint: "Gestion de la chaine", icon: Settings }],
  },
];

export function DashboardSidebar({
  tab,
  setTab,
  streamer,
}: {
  tab: DashboardTab;
  setTab: (t: DashboardTab) => void;
  streamer: ApiMyStreamer;
}) {
  return (
    <aside className="studio-nav" aria-label="Navigation du dashboard">
      <div className="studio-nav-brand">
        <DashboardAvatar streamer={streamer} className="studio-nav-avatar" />
        <span>
          <strong>{streamer.displayName}</strong>
          <small>@{streamer.slug}</small>
        </span>
      </div>

      <div className="studio-nav-groups">
        {NAV_GROUPS.map((group) => (
          <section className="studio-nav-group" key={group.label}>
            <div className="studio-nav-group-label">{group.label}</div>
            <div className="studio-nav-list">
              {group.items.map((item) => {
                const active = item.id === tab;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`studio-nav-item${active ? " is-active" : ""}`}
                    onClick={() => setTab(item.id)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="studio-nav-icon"><Icon size={17} strokeWidth={1.8} /></span>
                    <span className="studio-nav-copy">
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
