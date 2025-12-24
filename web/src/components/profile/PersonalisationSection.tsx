// web/src/components/profile/PersonalisationSection.tsx
import * as React from "react";
import { useAuth } from "../../auth/AuthProvider";
import { cosmeticsCatalog, equipCosmetic, myCosmetics } from "../../lib/api";
import { ChatMessageBubble } from "../chat/ChatMessageBubble";
import type { ChatCosmetics } from "../../lib/cosmetics";
import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  type StreamerAppearance,
} from "../../lib/appearance";

type Kind = "username" | "badge" | "title" | "frame" | "hat";

type ApiCatalogItem = {
  kind: Kind;
  code: string;
  name: string;
  rarity: string;
  unlock: string;
  priceRubis: number | null;
  active: boolean;
  meta?: any;
};

type UiItem = {
  kind: Kind;
  code: string | null; // null = retirer
  name: string;
  desc?: string;
  icon: string;
  free?: boolean;
  priceRubis?: number | null;
  rarity?: string;
  unlock?: string;
};

const CATS: Array<{ id: Kind; label: string }> = [
  { id: "username", label: "Pseudo" },
  { id: "badge", label: "Badges" },
  { id: "hat", label: "Chapeaux" },
  { id: "frame", label: "Cadrans message" },
  // Titres: tu as dit "via succès" → on l'affiche mais souvent vide au début
  { id: "title", label: "Titres" },
];

function iconFor(kind: Kind, code: string | null) {
  if (code == null) return "🚫";
  if (kind === "badge") return "🏷️";
  if (kind === "hat") return "🧢";
  if (kind === "username") return "✨";
  if (kind === "frame") return "🖼️";
  return "🔖";
}

function niceUnlock(u?: string) {
  if (!u) return "";
  if (u === "shop") return "Shop";
  if (u === "achievement") return "Succès";
  if (u === "role") return "Rôle";
  if (u === "event") return "Event";
  if (u === "system") return "Système";
  return u;
}

/**
 * Preview mapping : on traduit tes codes (DB/catalogue)
 * -> en cosmetics compréhensibles par ChatMessageBubble.
 *
 * IMPORTANT:
 * - Ici on ne cherche pas la perfection, juste un rendu "ok".
 * - Le vrai rendu en chat viendra quand le backend enverra cosmetics sur les messages.
 */
function applyPreview(kind: Kind, code: string | null, c: any) {
  if (!code) return;

  // init safe
  if (!c.avatar) c.avatar = {};
  if (!c.username) c.username = {};
  if (!Array.isArray(c.badges)) c.badges = [];
  if (c.title === undefined) c.title = null;

  // BADGES: tu veux rectangles lettres -> on envoie juste un token simple
  if (kind === "badge") {
    if (code === "badge_luna") c.badges = ["LUNA"];
    else if (code === "badge_777") c.badges = ["777"];
    else c.badges = [code];
    return;
  }

  // HATS: on mappe vers des ids "assets" simplifiés (ce que ton bubble connaît déjà souvent)
  if (kind === "hat") {
    const map: Record<string, string> = {
      hat_luna_cap: "luna_cap",
      hat_carton_crown: "carton_crown",
      hat_demon_horn: "demon_horn",
      hat_eclipse_halo: "eclipse_halo",
      hat_astral_helmet: "astral_helmet",
      hat_lotus_aureole: "lotus_aureole",
    };
    c.avatar.hatId = map[code] ?? code;
    return;
  }

  // USERNAME: tu as 2 shop (chroma toggle + gold toggle),
  // et 2 succès (rainbow_scroll + neon_underline)
  if (kind === "username") {
    const map: Record<string, string> = {
      uanim_chroma_toggle: "chroma",
      uanim_gold_toggle: "gold",
      uanim_rainbow_scroll: "rainbow_scroll",
      uanim_neon_underline: "neon_underline",
    };
    c.username.animId = map[code] ?? code;
    return;
  }

  // FRAME (cadran message)
  if (kind === "frame") {
    // on garde le code brut, ça laisse le mapping côté bubble/ CSS plus tard
    c.frame = { frameId: code };
    // compat si un jour tu utilises un autre champ
    (c as any).messageFrameId = code;
    return;
  }

  // TITLE (tu as dit: via succès, pas shop)
  if (kind === "title") {
    c.title = { text: code };
    return;
  }
}

function buildCosmeticsPreview(equipped: {
  username: string | null;
  badge: string | null;
  title: string | null;
  frame: string | null;
  hat: string | null;
}): ChatCosmetics | null {
  const c: any = {
    badges: [],
    title: null,
    frame: null,
    avatar: { hatId: null },
    username: {},
  };

  applyPreview("username", equipped?.username ?? null, c);
  applyPreview("badge", equipped?.badge ?? null, c);
  applyPreview("title", equipped?.title ?? null, c);
  applyPreview("frame", equipped?.frame ?? null, c);
  applyPreview("hat", equipped?.hat ?? null, c);

  return c as ChatCosmetics;
}

function byOwnedFirst(ownedSet: Set<string>, a: UiItem, b: UiItem) {
  const ao = a.free || (a.code != null && ownedSet.has(a.code));
  const bo = b.free || (b.code != null && ownedSet.has(b.code));
  if (ao !== bo) return ao ? -1 : 1;
  return a.name.localeCompare(b.name);
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

  const [catalog, setCatalog] = React.useState<ApiCatalogItem[]>([]);
  const [owned, setOwned] = React.useState<Record<string, string[]>>({});
  const [free, setFree] = React.useState<Record<string, string[]>>({});
  const [equipped, setEquipped] = React.useState<{
    username: string | null;
    badge: string | null;
    title: string | null;
    frame: string | null;
    hat: string | null;
  }>({
    username: null,
    badge: null,
    title: null,
    frame: null,
    hat: null,
  });

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [c, m] = await Promise.all([cosmeticsCatalog(), myCosmetics(token)]);
      if (!c?.ok) throw new Error("catalog_failed");
      if (!m?.ok) throw new Error((m as any)?.error || "load_failed");

      setCatalog((c.items || []).filter((x: any) => x && x.active));
      setOwned(m.owned || {});
      setFree(m.free || {});
      setEquipped(m.equipped || {});
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  async function doEquip(kind: Kind, code: string | null) {
    if (!token) return;
    setSaving(true);
    setErr(null);
    try {
      const cur = equipped?.[kind] ?? null;
      const next = cur === code ? null : code;

      const j = await equipCosmetic(token, kind, next);
      if (!j?.ok) throw new Error(j?.error || "equip_failed");

      setEquipped((prev) => ({ ...(prev || {}), ...(j.equipped || {}) }));
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

  const ownedSet = new Set<string>([...(owned?.[tab] || []), ...(free?.[tab] || [])]);

  // UI items = (un "retirer") + items du catalog pour cette catégorie
  const items: UiItem[] = [
    {
      kind: tab,
      code: null,
      name: tab === "username" ? "Par défaut" : "Aucun",
      icon: iconFor(tab, null),
      free: true,
      desc: "Retirer l’élément équipé.",
    },
    ...catalog
      .filter((x) => x.kind === tab)
      .map((x) => ({
        kind: x.kind,
        code: x.code,
        name: x.name,
        icon: iconFor(x.kind, x.code),
        desc:
          x.unlock === "shop" && x.priceRubis
            ? `${niceUnlock(x.unlock)} — ${Number(x.priceRubis).toLocaleString("fr-FR")} rubis`
            : `${niceUnlock(x.unlock)}${x.rarity ? ` — ${x.rarity}` : ""}`,
        priceRubis: x.priceRubis,
        rarity: x.rarity,
        unlock: x.unlock,
      })),
  ].sort((a, b) => byOwnedFirst(ownedSet, a, b));

  const previewCosmetics = buildCosmeticsPreview(equipped);

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Personnalisation</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Équipe tes cosmétiques. Les items non possédés sont verrouillés (sauf “Par défaut / Aucun”).
      </div>

      {!token ? <div className="muted">Connecte-toi pour gérer tes skins.</div> : null}

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
          ...({
            ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor,
            ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor,
          } as any),
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

      {/* Layout */}
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
              const isEquipped = (equipped as any)?.[tab] === it.code;
              const isOwned =
                !!it.free || (it.code != null && ownedSet.has(it.code));

              return (
                <button
                  key={`${it.kind}:${String(it.code)}`}
                  onClick={() => (isOwned ? doEquip(it.kind, it.code) : null)}
                  disabled={!token || loading || saving || !isOwned}
                  title={
                    !isOwned
                      ? "Non possédé"
                      : isEquipped
                      ? "Cliquer pour retirer"
                      : "Cliquer pour équiper"
                  }
                  style={{
                    textAlign: "left",
                    borderRadius: 16,
                    border: isEquipped
                      ? "1px solid rgba(255,255,255,0.22)"
                      : "1px solid rgba(255,255,255,0.08)",
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
