import type { LucideIcon } from "lucide-react";
import { BarChart3, Bot, Clapperboard, Coins, Gauge, Image, Settings, Shield, SmilePlus } from "lucide-react";
import type { ApiMyStreamer } from "../../lib/api";

export type DashboardTab = "overview" | "lunabot" | "stream" | "moderation" | "appearance" | "emotes" | "earnings" | "stats" | "settings";
type Meta = { title: string; short: string; kicker: string; description: string; icon: LucideIcon };

export const DASHBOARD_META: Record<DashboardTab, Meta> = {
  overview: { title: "Vue d’ensemble", short: "Accueil", kicker: "CENTRE DE COMMANDE", description: "L’essentiel de ta chaîne, en un seul regard.", icon: Gauge },
  stream: { title: "Diffusion", short: "Stream", kicker: "EN DIRECT", description: "Prépare ton titre et configure tes accès de diffusion.", icon: Clapperboard },
  stats: { title: "Statistiques", short: "Analytics", kicker: "PERFORMANCES", description: "Comprends ton audience et mesure ta progression.", icon: BarChart3 },
  earnings: { title: "Revenus", short: "Revenus", kicker: "MONÉTISATION", description: "Suis tes gains, leur provenance et tes versements.", icon: Coins },
  moderation: { title: "Modération", short: "Modération", kicker: "COMMUNAUTÉ", description: "Protège ton chat et pilote ton équipe de modération.", icon: Shield },
  lunabot: { title: "LunaBot", short: "LunaBot", kicker: "AUTOMATISATIONS", description: "Configure les outils qui donnent vie à ton stream.", icon: Bot },
  appearance: { title: "Apparence", short: "Apparence", kicker: "IDENTITÉ VISUELLE", description: "Façonne une expérience reconnaissable au premier regard.", icon: Image },
  emotes: { title: "Emojis & GIFs", short: "Emotes", kicker: "EXPRESSION", description: "Crée le langage visuel propre à ta communauté.", icon: SmilePlus },
  settings: { title: "Paramètres", short: "Réglages", kicker: "CONFIGURATION", description: "Gère les informations et préférences de ta chaîne.", icon: Settings },
};

const GROUPS: { label: string; items: DashboardTab[] }[] = [
  { label: "Pilotage", items: ["overview", "stream", "stats", "earnings"] },
  { label: "Communauté", items: ["moderation", "lunabot", "appearance", "emotes"] },
  { label: "Compte", items: ["settings"] },
];

export function DashboardSidebar({ tab, setTab, streamer }: { tab: DashboardTab; setTab: (t: DashboardTab) => void; streamer: ApiMyStreamer }) {
  return (
    <aside className="dashSidebar">
      <div className="dashSidebarBrand"><span>STUDIO</span><strong>@{streamer.slug}</strong></div>
      <nav aria-label="Navigation du dashboard">
        {GROUPS.map(group => (
          <div className="dashNavGroup" key={group.label}>
            <span className="dashNavLabel">{group.label}</span>
            {group.items.map(id => {
              const item = DASHBOARD_META[id]; const Icon = item.icon; const active = tab === id;
              return <button key={id} className={`dashNavItem ${active ? "isActive" : ""}`} onClick={() => setTab(id)} aria-current={active ? "page" : undefined}><Icon size={18} /><span>{item.short}</span>{active && <i />}</button>;
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
