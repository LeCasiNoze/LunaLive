import * as React from "react";
import { useAuth } from "../../auth/AuthProvider";
import { equipCosmetic, myCosmetics } from "../../lib/api";
import { ChatMessageBubble } from "../chat/ChatMessageBubble";
import type { ChatCosmetics } from "../../lib/cosmetics";
import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  type StreamerAppearance,
} from "../../lib/appearance";

type Kind = "username" | "badge" | "title" | "frame" | "hat";

type CatalogItem = {
  kind: Kind;
  code: string;
  name: string;
  icon: string;
  desc?: string;
  free?: boolean;
  // pour construire un ChatCosmetics preview
  apply?: (c: any) => void;
};

const CATALOG: CatalogItem[] = [
  // ===== USERNAME (skins pseudo)
  {
    kind: "username",
    code: "default",
    name: "Par défaut",
    icon: "🙂",
    free: true,
    desc: "Aucun skin pseudo.",
    apply: (c) => {
      if (!c.username) c.username = {};
      c.username.color = null;
      c.username.effect = "none";
    },
  },
  {
    kind: "username",
    code: "ghost_purple",
    name: "Ghost Purple",
    icon: "🟣",
    desc: "Couleur pseudo.",
    apply: (c) => {
      if (!c.username) c.username = {};
      c.username.color = "#7C4DFF";
      c.username.effect = "none";
    },
  },
  {
    kind: "username",
    code: "blue_lotus",
    name: "Blue Lotus",
    icon: "🔵",
    desc: "Couleur pseudo.",
    apply: (c) => {
      if (!c.username) c.username = {};
      c.username.color = "#3B82F6";
      c.username.effect = "none";
    },
  },

  // ===== BADGES (1 seul)
  { kind: "badge", code: "none", name: "Aucun badge", icon: "🚫", free: true, apply: (c) => (c.badges = []) },
  {
    kind: "badge",
    code: "diamant",
    name: "Diamant",
    icon: "💎",
    apply: (c) => {
      c.badges = [{ id: "diamant", label: "Diamant", icon: "💎", tier: "gold" }];
    },
  },
  {
    kind: "badge",
    code: "voleur",
    name: "Voleur",
    icon: "🥷",
    apply: (c) => {
      c.badges = [{ id: "voleur", label: "Voleur", icon: "🥷", tier: "silver" }];
    },
  },
  {
    kind: "badge",
    code: "machine_a_sous",
    name: "Machine à sous",
    icon: "🎰",
    apply: (c) => {
      c.badges = [{ id: "machine_a_sous", label: "Slot", icon: "🎰", tier: "silver" }];
    },
  },
  {
    kind: "badge",
    code: "dollar",
    name: "Dollar",
    icon: "💵",
    apply: (c) => {
      c.badges = [{ id: "dollar", label: "Dollar", icon: "💵", tier: "silver" }];
    },
  },
  {
    kind: "badge",
    code: "narine",
    name: "Narine",
    icon: "👃",
    apply: (c) => {
      c.badges = [{ id: "narine", label: "Narine", icon: "👃", tier: "silver" }];
    },
  },

  // ===== TITLES (1 seul)
  { kind: "title", code: "none", name: "Aucun titre", icon: "🚫", free: true, apply: (c) => (c.title = null) },
  {
    kind: "title",
    code: "card_shark",
    name: "Card Shark",
    icon: "🃏",
    apply: (c) => {
      c.title = { text: "Card Shark", tier: "silver", effect: "none" };
    },
  },
  {
    kind: "title",
    code: "luna_pioneer",
    name: "Luna Pioneer",
    icon: "🌙",
    apply: (c) => {
      c.title = { text: "Luna Pioneer", tier: "gold", effect: "none" };
    },
  },

  // ===== FRAME (cadran)
  { kind: "frame", code: "none", name: "Aucun cadran", icon: "🚫", free: true, apply: (c) => (c.frame = null) },
  {
    kind: "frame",
    code: "ghost_purple",
    name: "Ghost Frame",
    icon: "🟪",
    apply: (c) => {
      c.frame = { frameId: "ghost_purple" };
    },
  },
  {
    kind: "frame",
    code: "blue_lotus",
    name: "Lotus Frame",
    icon: "🟦",
    apply: (c) => {
      c.frame = { frameId: "blue_lotus" };
    },
  },

  // ===== HAT
  { kind: "hat", code: "none", name: "Aucun chapeau", icon: "🚫", free: true, apply: (c) => (c.avatar = { ...(c.avatar||{}), hatId: null }) },
  {
    kind: "hat",
    code: "luna_cap",
    name: "Luna Cap",
    icon: "🧢",
    apply: (c) => {
      if (!c.avatar) c.avatar = {};
      c.avatar.hatId = "luna_cap";
      c.avatar.hatEmoji = "🧢";
    },
  },
];

const CATS: Array<{ id: Kind; label: string }> = [
  { id: "username", label: "Pseudo" },
  { id: "badge", label: "Badges" },
  { id: "title", label: "Titres" },
  { id: "frame", label: "Cadrans" },
  { id: "hat", label: "Chapeaux" },
];

function byOwnedFirst(ownedSet: Set<string>) {
  return (a: CatalogItem, b: CatalogItem) => {
    const ao = a.free || ownedSet.has(a.code);
    const bo = b.free || ownedSet.has(b.code);
    if (ao !== bo) return ao ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
}

function buildCosmeticsPreview(equipped: any): ChatCosmetics | null {
  const c: any = {};

  // start clean
  c.badges = [];
  c.title = null;
  c.frame = null;
  c.avatar = { hatId: null };

  const applyOne = (kind: Kind, code: string | null) => {
    if (!code) return;
    const item = CATALOG.find((x) => x.kind === kind && x.code === code);
    if (!item?.apply) return;
    item.apply(c);
  };

  applyOne("username", equipped?.username ?? null);
  applyOne("badge", equipped?.badge ?? null);
  applyOne("title", equipped?.title ?? null);
  applyOne("frame", equipped?.frame ?? null);
  applyOne("hat", equipped?.hat ?? null);

  return c as ChatCosmetics;
}

export function PersonalisationSection({
  username,
  streamerAppearance = DEFAULT_STREAMER_APPEARANCE,
}: {
  username: string;
  streamerAppearance?: StreamerAppearance;
}) {
  const { token } = useAuth();

  const [tab, setTab] = React.useState<Kind>("username");

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [owned, setOwned] = React.useState<Record<string, string[]>>({});
  const [equipped, setEquipped] = React.useState<any>({
    username: "default",
    badge: "none",
    title: "none",
    frame: "none",
    hat: "none",
  });

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const j = await myCosmetics(token);
      if (!j?.ok) throw new Error((j as any)?.error || "load_failed");
      setOwned(j.owned || {});
      setEquipped(j.equipped || {});
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  async function doEquip(kind: Kind, code: string) {
    if (!token) return;
    setSaving(true);
    setErr(null);
    try {
      // si déjà équipé => toggle off
      const cur = String(equipped?.[kind] ?? "");
      const next = cur === code ? null : code;

      const j = await equipCosmetic(token, kind, next);
      if (!j?.ok) throw new Error(j?.error || "equip_failed");
      setEquipped((prev: any) => ({ ...(prev || {}), ...(j.equipped || {}) }));
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const ownedSet = new Set<string>([...(owned?.[tab] || [])]);
  const items = CATALOG.filter((x) => x.kind === tab).sort(byOwnedFirst(ownedSet));

  const previewCosmetics = buildCosmeticsPreview(equipped);

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Personnalisation</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Équipe tes skins (1 badge + 1 titre). Les items non possédés sont verrouillés.
      </div>

      {!token ? (
        <div className="muted">Connecte-toi pour gérer tes skins.</div>
      ) : null}

      {err ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ⚠️ {err}
        </div>
      ) : null}

      {/* Preview */}
      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.18)",
          ...( { ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor } as any ),
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 10 }}>Aperçu</div>
        <ChatMessageBubble
          streamerAppearance={streamerAppearance}
          msg={{
            id: "preview",
            userId: 999999,
            username,
            body: "Exemple de message — “ça rend comment ?”",
            createdAt: new Date().toISOString(),
            cosmetics: previewCosmetics,
          }}
        />
      </div>

      {/* Layout: sidebar + grid */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 14, marginTop: 14 }}>
        {/* Sidebar */}
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.18)",
            padding: 10,
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Catégories</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CATS.map((c) => (
              <button
                key={c.id}
                className={tab === c.id ? "btnPrimary" : "btnGhost"}
                onClick={() => setTab(c.id)}
                disabled={loading || saving}
                style={{ textAlign: "left" }}
              >
                {c.label}
              </button>
            ))}

            <button className="btnGhost" onClick={load} disabled={loading || saving}>
              {loading ? "Chargement…" : "Recharger"}
            </button>
          </div>
        </div>

        {/* Items grid */}
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.18)",
            padding: 12,
            minHeight: 220,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 950 }}>{CATS.find((x) => x.id === tab)?.label}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {saving ? "Enregistrement…" : ""}
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 12,
            }}
          >
            {items.map((it) => {
              const isOwned = !!it.free || (owned?.[tab] || []).includes(it.code);
              const isEquipped = String(equipped?.[tab] ?? "") === it.code;

              return (
                <button
                  key={`${it.kind}:${it.code}`}
                  onClick={() => isOwned && doEquip(it.kind, it.code)}
                  disabled={!token || loading || saving || !isOwned}
                  title={!isOwned ? "Non possédé" : isEquipped ? "Cliquer pour retirer" : "Cliquer pour équiper"}
                  style={{
                    textAlign: "left",
                    borderRadius: 16,
                    border: isEquipped ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.08)",
                    background: isOwned ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.45)",
                    color: "white",
                    padding: 12,
                    cursor: !isOwned ? "not-allowed" : "pointer",
                    opacity: !isOwned ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 22 }}>{it.icon}</div>
                    {isEquipped ? (
                      <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.95 }}>Équipé</span>
                    ) : !isOwned ? (
                      <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.75 }}>🔒</span>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 8, fontWeight: 950 }}>{it.name}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    {it.desc || (isOwned ? "Cliquer pour équiper" : "À débloquer")}
                  </div>

                  {isOwned ? (
                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          padding: "4px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: isEquipped ? "rgba(124,77,255,0.18)" : "rgba(255,255,255,0.06)",
                        }}
                      >
                        {isEquipped ? "Retirer" : "Équiper"}
                      </span>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
