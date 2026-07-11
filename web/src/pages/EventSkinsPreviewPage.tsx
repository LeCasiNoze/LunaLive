// Page de consultation des cosmétiques d'EVENT (demande Lucas) : tous les
// cadrans et titres de récompense rendus en conditions réelles (mêmes
// composants que le chat), avec leur mode d'obtention. Route utilitaire
// /skins-events — non listée dans la navigation ni le sitemap.
import * as React from "react";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import { TitlePill } from "../components/chat/TitlePill";
import { DEFAULT_APPEARANCE } from "../lib/appearance";

function mockMsg(frameId: string, username: string, body: string) {
  return {
    id: frameId,
    userId: 4,
    username,
    body,
    createdAt: new Date(0).toISOString(),
    cosmetics: {
      frame: { frameId },
      badges: [],
      username: {},
    } as any,
    role: "viewer",
  };
}

function SkinCard({
  title,
  how,
  rarity,
  children,
}: {
  title: string;
  how: string;
  rarity: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        padding: 16,
        background: "rgba(255,255,255,0.03)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{title}</strong>
        <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 800 }}>
          {how} · <span style={{ color: "#fde68a" }}>{rarity}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

export default function EventSkinsPreviewPage() {
  const titleEntry = (code: string, label: string, rarity: any = "legendary") =>
    ({ code, label, rarity, source: "achievement" } as any);

  return (
    <main className="container" style={{ maxWidth: 760, display: "grid", gap: 18, paddingBottom: 60 }}>
      <div>
        <h1 style={{ margin: "18px 0 4px", fontSize: 26 }}>🎪 Skins d'event</h1>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>
          Aperçu en conditions réelles (mêmes rendus que le chat). Page utilitaire non listée.
        </p>
      </div>

      <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>🎡 Roue</h2>
      <SkinCard title="Cadran « Roulette »" how="Top 1-3 · permanent" rarity="épique">
        <ChatMessageBubble
          msg={mockMsg("frame_wheel_roulette", "TopSpinner", "La roulette tourne au coin du cadre 🎡") as any}
          streamerAppearance={DEFAULT_APPEARANCE}
        />
      </SkinCard>
      <SkinCard title="Titre « Roi du Spin »" how="#1 · remis en jeu chaque édition" rarity="unique">
        <div style={{ fontSize: 22 }}>
          <TitlePill entry={titleEntry("title_wheel_king", "Roi du Spin")} size="md" />
        </div>
      </SkinCard>

      <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>🎁 Coffre commun</h2>
      <SkinCard title="Cadran « Coffre-Fort »" how="Top 1-3 contributeurs · permanent" rarity="épique">
        <ChatMessageBubble
          msg={mockMsg("frame_chest_vault", "GrosDonateur", "Il pleut des pièces d'or là-dedans 🪙") as any}
          streamerAppearance={DEFAULT_APPEARANCE}
        />
      </SkinCard>
      <SkinCard title="Titre « Baron du Coffre »" how="#1 · remis en jeu chaque édition" rarity="unique">
        <div style={{ fontSize: 22 }}>
          <TitlePill entry={titleEntry("title_chest_baron", "Baron du Coffre")} size="md" />
        </div>
      </SkinCard>

      <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>🔥 Boss</h2>
      <SkinCard title="Cadran « Champ de Bataille »" how="Top 1-3 dégâts (si le boss tombe) · permanent" rarity="légendaire">
        <ChatMessageBubble
          msg={mockMsg("frame_boss_flames", "TueurDeBoss", "Le champ de bataille brûle encore ⚔️") as any}
          streamerAppearance={DEFAULT_APPEARANCE}
        />
      </SkinCard>
      <SkinCard title="Titre « Boss Slayer »" how="TOUS les participants ≥ 50 dégâts (si le boss tombe)" rarity="commun de masse">
        <div style={{ fontSize: 22 }}>
          <TitlePill entry={titleEntry("boss_slayer_202607", "Boss Slayer", "epic")} size="md" />
        </div>
      </SkinCard>
      <SkinCard title="Titre « Bourreau »" how="#1 dégâts · permanent" rarity="légendaire">
        <div style={{ fontSize: 22 }}>
          <TitlePill entry={titleEntry("title_boss_bourreau", "Bourreau")} size="md" />
        </div>
      </SkinCard>

      <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>👁 Semaine du viewer</h2>
      <SkinCard title="Cadran « Roi des Viewers »" how="#1 du classement · permanent" rarity="légendaire">
        <ChatMessageBubble
          msg={mockMsg("frame_viewer_hearts", "RoiDesViewers", "Des cœurs qui montent, gonflés à l'hélium 💜") as any}
          streamerAppearance={DEFAULT_APPEARANCE}
        />
      </SkinCard>

      <p style={{ opacity: 0.6, fontSize: 12, marginTop: 8 }}>
        Titres streamers (Clip Race, Duo) : textuels simples pour l'instant — à décrire quand tu veux.
      </p>
    </main>
  );
}
