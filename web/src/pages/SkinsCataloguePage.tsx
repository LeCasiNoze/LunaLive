// CATALOGUE des cosmétiques (demande Lucas) : tous les éléments de skins
// avec leur rendu réel, leur rareté et surtout leur OBTENTION — l'existant
// tel quel, et les PROPOSITIONS Claude (marquées) là où l'obtention reste
// à arbitrer. Règle : chaque drop vient d'un ÉVÉNEMENT, de la BOUTIQUE ou
// d'un SUCCÈS (condition précisée). Route utilitaire /skins-catalogue.
import type { ReactNode } from "react";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import { TitlePill } from "../components/chat/TitlePill";
import type { ChatTitleEntry } from "../lib/cosmetics";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
import AnimatedUsername from "../fx/username/AnimatedUsername";
import type { FxRarity } from "../fx/username/types";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

const RARITY_META: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Commun", color: "#9ca3af" },
  uncommon: { label: "Peu commun", color: "#4ade80" },
  rare: { label: "Rare", color: "#60a5fa" },
  epic: { label: "Épique", color: "#c084fc" },
  legendary: { label: "Légendaire", color: "#fbbf24" },
  mythic: { label: "Mythique", color: "#fb7185" },
};

type Entry = {
  code: string;
  name: string;
  rarity: Rarity;
  /** obtention EXISTANTE (déjà câblée) */
  how?: string;
  /** PROPOSITION Claude (pas encore câblée — à arbitrer) */
  proposal?: string;
};

// ── CADRANS ──────────────────────────────────────────────────
const FRAMES: Entry[] = [
  { code: "frame_wheel_roulette", name: "Roulette", rarity: "epic", how: "Event Roue · top 1-3 · permanent" },
  { code: "frame_chest_vault", name: "Coffre-Fort", rarity: "epic", how: "Event Coffre · top 1-3 · permanent" },
  { code: "frame_boss_flames", name: "Champ de Bataille", rarity: "legendary", how: "Event Boss · top 1-3 dégâts (si le boss tombe)" },
  { code: "frame_viewer_hearts", name: "Roi des Viewers", rarity: "legendary", how: "Semaine du viewer · #1 · permanent" },
  { code: "mframe_gold", name: "Gold", rarity: "legendary", how: "Boutique · 3 000 rubis" },
  { code: "mframe_lotus_crown", name: "Lotus Crown", rarity: "mythic", how: "Succès « Archiviste » (caché) : 10 000 messages dans le chat" },
  { code: "mframe_eclipse", name: "Eclipse", rarity: "mythic", how: "Succès « Jour et nuit » : connexion matin ET soir sur une même journée, 60 journées différentes" },
  { code: "mframe_neon_rainbow", name: "Néon Rainbow", rarity: "mythic", how: "Boutique · 5 000 rubis" },
  { code: "mframe_glitch", name: "Glitch", rarity: "legendary", proposal: "Succès « Anomalie » (master) : 8 victoires consécutives au blackjack" },
  { code: "mframe_diamond", name: "Diamant", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "mframe_phoenix", name: "Phénix", rarity: "legendary", how: "Succès « De ses cendres » : revenir après 30 jours d'absence puis série de 7 jours — VALIDÉ" },
  { code: "mframe_void", name: "Void", rarity: "mythic", how: "Boutique · 5 000 rubis" },
  { code: "mframe_galaxy", name: "Galaxy", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "mframe_blood", name: "Blood", rarity: "legendary", how: "Succès event « DPS » : 10 000 dégâts cumulés sur les boss — VALIDÉ" },
  { code: "mframe_royal", name: "Royal", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "mframe_ice", name: "Glace", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "mframe_fest_eclair", name: "Éclair", rarity: "legendary", proposal: "Succès event « Éclair » : 100 tours de roue pendant une seule édition de l'event Roue" },
  { code: "mframe_aurora", name: "Aurora", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "mframe_neon_pink", name: "Néon Rose", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "mframe_neon_cyan", name: "Néon Cyan", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "mframe_emerald", name: "Émeraude", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "mframe_sakura", name: "Sakura", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "mframe_carbon", name: "Carbone", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "mframe_paper", name: "Papier", rarity: "common", how: "Boutique · 500 rubis" },
];

// ── EFFETS PSEUDO CSS (actifs) ───────────────────────────────
const USERNAMES_CSS: Entry[] = [
  { code: "uanim_gradient_sunset", name: "Sunset gradient", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "uanim_ocean", name: "Océan", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "uanim_mint", name: "Menthe givrée", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "uanim_amber", name: "Ambre", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "uanim_steel", name: "Acier", rarity: "rare", proposal: "Succès « Inoxydable » : 50 jours de connexion cumulés" },
  { code: "uanim_frost", name: "Frost (glacé)", rarity: "rare", how: "Boutique · 1 000 rubis" },
];

// ── EFFETS PSEUDO MOTEUR ─────────────────────────────────────
const USERNAMES_ENGINE: Entry[] = [
  { code: "garden-of-ashes", name: "Jardin des Cendres", rarity: "mythic", proposal: "Succès event « Maître des Cendres » : podium (top 3) des 4 types d'event — Roue, Coffre, Boss, Semaine du viewer" },
  { code: "jackpot-divin", name: "Jackpot Divin", rarity: "mythic", how: "Succès « Jackpot Divin » : décrocher 3 fois le gain maximal de la roue — VALIDÉ" },
  { code: "leviathan-abyssal", name: "Léviathan Abyssal", rarity: "mythic", proposal: "Succès event « Abysses » : 50 000 rubis contribués cumulés aux Coffres communs" },
  { code: "forge-celeste", name: "Forge Céleste", rarity: "mythic", proposal: "Succès event « Forge Céleste » : 50 000 dégâts cumulés sur les boss" },
  { code: "nuee-obsidienne", name: "Nuée d'Obsidienne", rarity: "mythic", proposal: "Succès « Noctambule ultime » : 60 nuits distinctes avec ≥ 30 min de watch entre minuit et 4 h" },
  { code: "sablier-eternite", name: "Sablier d'Éternité", rarity: "mythic", how: "Succès : 365 jours de connexion cumulés — VALIDÉ" },
  { code: "coeur-du-reacteur", name: "Cœur du Réacteur", rarity: "mythic", how: "Récompense event : 3 victoires cumulées à la Semaine du viewer — VALIDÉ" },
  { code: "eveil-lunaire", name: "Éveil Lunaire", rarity: "legendary", proposal: "Succès : 100 jours de connexion cumulés" },
  { code: "orage-interieur", name: "Orage Intérieur", rarity: "legendary", proposal: "Succès event « Orage Intérieur » : top 10 sur chaque type d'event classé (Roue, Coffre, Boss, Semaine du viewer)" },
  { code: "spectre", name: "Spectre", rarity: "legendary", how: "Succès : 100 h de présence live sans écrire un message — VALIDÉ (heures montées)" },
  { code: "cristallisation", name: "Cristallisation", rarity: "legendary", proposal: "Succès « Hibernation » : 40 h de watch en période hivernale (déc → fév)" },
  { code: "ufx-chroma", name: "Chroma", rarity: "legendary", how: "Hérite du succès « Parfait » : 30 bonus quotidiens/mois — VALIDÉ" },
  { code: "ufx-glitch", name: "Glitch", rarity: "legendary", how: "Succès : 500 messages chat en une seule journée — VALIDÉ" },
  { code: "ufx-galaxy", name: "Galaxy", rarity: "legendary", how: "Succès : 50 h de watch sur un mois — VALIDÉ" },
  { code: "ufx-ice", name: "Glace", rarity: "legendary", how: "Boutique · 3 000 rubis" },
  { code: "ufx-fire", name: "Feu", rarity: "epic", proposal: "Succès : série de connexion de 14 jours" },
  { code: "ufx-gold", name: "Gold", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "ufx-pulse-red", name: "Pulse Rouge", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "ufx-pulse-blue", name: "Pulse Bleu", rarity: "epic", how: "Boutique · 1 500 rubis" },
  { code: "ufx-rainbow", name: "Arc-en-ciel", rarity: "epic", proposal: "Hérite du succès « Ultime » : 20 succès débloqués" },
  { code: "ufx-silver", name: "Argenté", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "ufx-purple", name: "Pourpre royal", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "ufx-crimson", name: "Crimson", rarity: "rare", how: "Boutique · 1 000 rubis" },
  { code: "ufx-neon", name: "Néon", rarity: "rare", proposal: "Système : agenda 30 jours (comme l'actuel)" },
];

// ── BADGES ───────────────────────────────────────────────────
const BADGES: Entry[] = [
  { code: "badge_luna", name: "LUNA", rarity: "uncommon", how: "Boutique · 200 rubis" },
  { code: "badge_777", name: "777", rarity: "legendary", how: "Boutique · 750 rubis" },
  { code: "badge_chef", name: "CHEF", rarity: "rare", how: "Boutique · 300 rubis" },
  { code: "badge_skull", name: "💀", rarity: "epic", how: "Boutique · 500 rubis" },
  { code: "badge_heart", name: "❤️", rarity: "uncommon", how: "Boutique · 200 rubis" },
  { code: "badge_star", name: "⭐", rarity: "uncommon", how: "Boutique · 200 rubis" },
  { code: "badge_lightning", name: "⚡", rarity: "rare", how: "Boutique · 300 rubis" },
  { code: "badge_discord", name: "🤖", rarity: "rare", how: "Succès « Connecté » : lier son compte Discord à LunaLive" },
  { code: "badge_og", name: "OG", rarity: "legendary", proposal: "Succès « OG » : compte créé avant le lancement officiel" },
  { code: "badge_rich", name: "$$", rarity: "epic", proposal: "Succès « Crésus » : 100 000 rubis gagnés cumulés" },
];

// ── CHAPEAUX ─────────────────────────────────────────────────
const HATS: Entry[] = [
  { code: "hat_luna_cap", name: "Luna Cap", rarity: "rare", how: "Boutique · 500 rubis" },
  { code: "hat_carton_crown", name: "Carton Crown", rarity: "epic", how: "Succès « Marathon » : 10 h de watch sur un mois" },
  { code: "hat_demon_horn", name: "Demon Horn", rarity: "epic", how: "Succès « Prêtre de la roue » (caché) : 200 tours de roue" },
  { code: "hat_eclipse_halo", name: "Eclipse Halo", rarity: "legendary", how: "Succès « Pilier » (caché) : soutenir 20 streamers différents" },
  { code: "hat_astral_helmet", name: "Astral Helmet", rarity: "legendary", how: "Boutique · 1 500 rubis" },
  { code: "hat_lotus_aureole", name: "Lotus Aureole", rarity: "mythic", how: "Boutique · 2 500 rubis" },
  { code: "hat_top_hat", name: "Top Hat", rarity: "epic", how: "Boutique · 800 rubis" },
  { code: "hat_santa", name: "Bonnet de Noël", rarity: "rare", how: "Boutique · 500 rubis" },
  { code: "hat_witch", name: "Chapeau Sorcière", rarity: "rare", how: "Boutique · 500 rubis" },
  { code: "hat_propeller", name: "Beanie Hélice", rarity: "uncommon", how: "Boutique · 300 rubis" },
  { code: "hat_pirate", name: "Bandeau Pirate", rarity: "epic", proposal: "Succès « Flibustier » : ouvrir 30 coffres quotidiens" },
  { code: "hat_viking", name: "Casque Viking", rarity: "legendary", proposal: "Succès event « Berserker » : 5 000 dégâts au boss sur une seule édition" },
];

// ── TITRES SPÉCIAUX D'EVENT ──────────────────────────────────
const EVENT_TITLES: (Entry & { label: string })[] = [
  { code: "title_wheel_king", label: "Roi du Spin", name: "Roi du Spin", rarity: "mythic", how: "Event Roue · #1 · remis en jeu à chaque édition" },
  { code: "title_chest_baron", label: "Baron du Coffre", name: "Baron du Coffre", rarity: "mythic", how: "Event Coffre · #1 · remis en jeu à chaque édition" },
  { code: "boss_slayer_202607", label: "Boss Slayer", name: "Boss Slayer", rarity: "epic", how: "Event Boss · tous les participants ≥ 50 dégâts (si le boss tombe)" },
  { code: "title_boss_bourreau", label: "Bourreau", name: "Bourreau", rarity: "legendary", how: "Event Boss · #1 dégâts · permanent" },
];

function mockFrameMsg(code: string, name: string) {
  return {
    id: code,
    userId: 4,
    username: "LunaTesteur",
    body: `Cadran ${name} en conditions réelles.`,
    createdAt: new Date(0).toISOString(),
    cosmetics: { frame: { frameId: code }, badges: [], username: {} },
    role: "viewer",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function HowLine({ e }: { e: Entry }) {
  return (
    <div style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
      <span style={{ color: RARITY_META[e.rarity].color, fontWeight: 800 }}>{RARITY_META[e.rarity].label}</span>
      {e.how ? <span style={{ opacity: 0.8 }}>{e.how}</span> : null}
      {e.proposal ? (
        <span style={{ color: "#67e8f9" }}>
          <b style={{ background: "rgba(103,232,249,0.12)", borderRadius: 6, padding: "1px 6px", marginRight: 6 }}>PROPOSITION</b>
          {e.proposal}
        </span>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={{ margin: "22px 0 4px", fontSize: 19 }}>{children}</h2>;
}

export default function SkinsCataloguePage() {
  return (
    <main className="container" style={{ maxWidth: 860, display: "grid", gap: 12, paddingBottom: 80 }}>
      <div>
        <h1 style={{ margin: "18px 0 4px", fontSize: 26 }}>📖 Catalogue des skins</h1>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>
          Tous les cosmétiques, leur rareté et leur obtention. Les lignes{" "}
          <b style={{ color: "#67e8f9" }}>PROPOSITION</b> ne sont pas encore câblées — à arbitrer
          (règle : chaque drop vient d'un événement, de la boutique ou d'un succès).
        </p>
      </div>

      <SectionTitle>🖼 Cadrans ({FRAMES.length})</SectionTitle>
      {FRAMES.map((e) => (
        <div key={e.code} style={{ display: "grid", gap: 6, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>{e.name}</strong>
            <HowLine e={e} />
          </div>
          <div style={{ position: "relative" }}>
            {/* ChatMessageBubble rend lui-même FrameFxOverlay */}
            <ChatMessageBubble msg={mockFrameMsg(e.code, e.name)} streamerAppearance={DEFAULT_APPEARANCE} />
          </div>
        </div>
      ))}

      <SectionTitle>🚀 Effets pseudo — moteur ({USERNAMES_ENGINE.length})</SectionTitle>
      {USERNAMES_ENGINE.map((e) => (
        <div key={e.code} style={{ display: "grid", gap: 6, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>{e.name}</strong>
            <HowLine e={e} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ background: "#0b0b12", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "18px 12px", display: "flex", justifyContent: "center" }}>
              <AnimatedUsername username="LeCasiNoze" effectId={e.code} rarity={e.rarity as FxRarity} context="shop" intensity={1} size={24} />
            </div>
            {/* rendu réel dans la bulle de chat (chemin de prod) */}
            <ChatMessageBubble
              msg={{
                id: `chat-${e.code}`,
                userId: 4,
                username: "LeCasiNoze",
                body: "Rendu réel dans le chat.",
                createdAt: new Date(0).toISOString(),
                cosmetics: { frame: null, badges: [], username: { effect: e.code } },
                role: "viewer",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any}
              streamerAppearance={DEFAULT_APPEARANCE}
            />
          </div>
        </div>
      ))}

      <SectionTitle>✍️ Effets pseudo — CSS ({USERNAMES_CSS.length})</SectionTitle>
      {USERNAMES_CSS.map((e) => (
        <div key={e.code} style={{ display: "grid", gap: 6, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>{e.name}</strong>
            <HowLine e={e} />
          </div>
          <ChatMessageBubble
            msg={{
              id: e.code,
              userId: 4,
              username: e.name.replace(/[\s()]+/g, ""),
              body: "Aperçu de l'effet pseudo.",
              createdAt: new Date(0).toISOString(),
              cosmetics: { frame: null, badges: [], username: { effect: e.code } },
              role: "viewer",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any}
            streamerAppearance={DEFAULT_APPEARANCE}
          />
        </div>
      ))}

      <SectionTitle>🎖 Badges ({BADGES.length})</SectionTitle>
      {BADGES.map((e) => (
        <div key={e.code} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 900 }}>{e.name}</span>
          <HowLine e={e} />
        </div>
      ))}

      <SectionTitle>🎩 Chapeaux ({HATS.length})</SectionTitle>
      {HATS.map((e) => (
        <div key={e.code} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={`/Hats/${e.code}.png`} alt="" width={28} height={28} style={{ objectFit: "contain" }} onError={(ev) => ((ev.target as HTMLImageElement).style.display = "none")} />
            <strong style={{ fontSize: 13 }}>{e.name}</strong>
          </span>
          <HowLine e={e} />
        </div>
      ))}

      <SectionTitle>🏷 Titres spéciaux d'event ({EVENT_TITLES.length})</SectionTitle>
      {EVENT_TITLES.map((e) => (
        <div key={e.code} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 20 }}>
            <TitlePill
              entry={{ code: e.code, label: e.label, rarity: e.rarity, source: "achievement" } as unknown as ChatTitleEntry}
              size="md"
            />
          </span>
          <HowLine e={e} />
        </div>
      ))}

      <SectionTitle>📜 Titres classiques</SectionTitle>
      <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
        ~120 titres textuels débloqués par les succès existants (tiers bronze → master : « Premier
        pas », « Habitué », « Marathon », « Légende du chat »…). Chacun est déjà lié à un succès
        précis dans le système — pas de changement proposé. Les titres event datés (Boss Slayer,
        vainqueurs d'édition) sont gérés par les récompenses d'event.
      </p>
    </main>
  );
}
