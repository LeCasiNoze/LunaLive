import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import type { ChatCosmetics } from "../lib/cosmetics";
import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  type StreamerAppearance,
} from "../lib/appearance";
import { buyShopCosmetic, shopCosmetics, type ShopCosmeticItem } from "../lib/api";

type Kind = "username" | "badge" | "title" | "frame" | "hat";

const TOP_TABS = [
  { id: "skins", label: "Skins" },
  { id: "upgrades", label: "Améliorations" },
] as const;

const SKIN_CATS: Array<{ id: Kind; label: string }> = [
  { id: "username", label: "Pseudo" },
  { id: "badge", label: "Badges" },
  { id: "hat", label: "Chapeaux" },
  { id: "frame", label: "Cadrans message" },
  { id: "title", label: "Titres" },
];

function iconFor(kind: Kind) {
  if (kind === "badge") return "🏷️";
  if (kind === "hat") return "🧢";
  if (kind === "username") return "✨";
  if (kind === "frame") return "🖼️";
  return "🔖";
}

/** mêmes mappings que PersonalisationSection (v1) */
function applyPreview(kind: Kind, code: string | null, c: any) {
  if (!code) return;

  if (!c.avatar) c.avatar = {};
  if (!c.username) c.username = {};
  if (!Array.isArray(c.badges)) c.badges = [];
  if (c.title === undefined) c.title = null;

  if (kind === "badge") {
    const txt = code === "badge_luna" ? "LUNA" : code === "badge_777" ? "777" : code;
    c.badges = [{ id: txt, code: txt, text: txt, label: txt }];
    (c as any).badge = txt;
    (c as any).badgeText = txt;
    (c as any).badgeLabel = txt;
    return;
  }

  if (kind === "hat") {
    const map: Record<string, string> = {
      hat_luna_cap: "luna_cap",
      hat_carton_crown: "carton_crown",
      hat_demon_horn: "demon_horn",
      hat_eclipse_halo: "eclipse_halo",
      hat_astral_helmet: "astral_helmet",
      hat_lotus_aureole: "lotus_aureole",
    };
    const hatId = map[code] ?? code;
    c.avatar.hatId = hatId;

    const EMOJI: Record<string, string> = {
      luna_cap: "🧢",
      carton_crown: "👑",
      demon_horn: "😈",
      eclipse_halo: "⭕",
      astral_helmet: "🪖",
      lotus_aureole: "🪷",
    };
    c.avatar.hatEmoji = EMOJI[hatId] ?? "🧢";
    return;
  }

  if (kind === "username") {
    const map: Record<string, string> = {
      uanim_chroma_toggle: "chroma",
      uanim_gold_toggle: "gold",
      uanim_rainbow_scroll: "rainbow_scroll",
      uanim_neon_underline: "neon_underline",
    };
    const effect = map[code] ?? code;
    c.username.effect = effect;
    c.username.animId = effect;
    c.username.anim = effect;
    return;
  }

  if (kind === "frame") {
    const frameId = code.replace(/^frame_/, "").replace(/_(shop|event|master)$/, "");
    c.frame = { frameId };
    return;
  }

  if (kind === "title") {
    c.title = { text: code, label: code };
    (c as any).titleText = code;
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
  const c: any = { badges: [], title: null, frame: null, avatar: { hatId: null }, username: {} };
  applyPreview("username", equipped?.username ?? null, c);
  applyPreview("badge", equipped?.badge ?? null, c);
  applyPreview("title", equipped?.title ?? null, c);
  applyPreview("frame", equipped?.frame ?? null, c);
  applyPreview("hat", equipped?.hat ?? null, c);
  return c as ChatCosmetics;
}

function sortByPriceAsc(a: ShopCosmeticItem, b: ShopCosmeticItem) {
  const pa = a.priceRubis == null ? Number.POSITIVE_INFINITY : Number(a.priceRubis);
  const pb = b.priceRubis == null ? Number.POSITIVE_INFINITY : Number(b.priceRubis);
  if (pa !== pb) return pa - pb;
  return a.name.localeCompare(b.name);
}

export function ShopPage({
  streamerAppearance = DEFAULT_STREAMER_APPEARANCE,
}: {
  streamerAppearance?: StreamerAppearance;
}) {
  const authAny = useAuth() as any;
  const token: string | null = authAny.token ?? null;
  const user = authAny.user as { id: number; username: string; rubis: number } | null;

  const [topTab, setTopTab] = React.useState<(typeof TOP_TABS)[number]["id"]>("skins");
  const [cat, setCat] = React.useState<Kind>("username");

  const [loading, setLoading] = React.useState(false);
  const [buying, setBuying] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [availableRubis, setAvailableRubis] = React.useState(0);
  const [items, setItems] = React.useState<ShopCosmeticItem[]>([]);
  const [owned, setOwned] = React.useState<Record<string, string[]>>({});
  const [equipped, setEquipped] = React.useState<{
    username: string | null;
    badge: string | null;
    title: string | null;
    frame: string | null;
    hat: string | null;
  }>({ username: null, badge: null, title: null, frame: null, hat: null });

  const [selected, setSelected] = React.useState<{ kind: Kind; code: string } | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const j = await shopCosmetics(token);
      if (!j?.ok) throw new Error((j as any)?.error || "load_failed");
      setAvailableRubis(Number(j.availableRubis || 0));
      setOwned(j.owned || {});
      setEquipped(j.equipped || { username: null, badge: null, title: null, frame: null, hat: null });
      setItems((j.items || []).filter((x: any) => x && x.active));
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const visible = React.useMemo(() => {
    return items
      .filter((x) => x.kind === cat)
      .slice()
      .sort(sortByPriceAsc);
  }, [items, cat]);

  const selectedPreviewCosmetics = React.useMemo(() => {
    const base = { ...equipped };
    if (selected) (base as any)[selected.kind] = selected.code;
    return buildCosmeticsPreview(base);
  }, [equipped, selected]);

  function previewForItem(it: ShopCosmeticItem): ChatCosmetics | null {
    const base = { ...equipped };
    (base as any)[it.kind] = it.code;
    return buildCosmeticsPreview(base);
  }

  async function buy(it: ShopCosmeticItem) {
    if (!token) return;
    if (it.unlock !== "shop") return;
    if (!it.priceRubis || it.priceRubis <= 0) return;

    setBuying(true);
    setErr(null);
    try {
      const j = await buyShopCosmetic(token, it.kind, it.code);
      if (!j?.ok) throw new Error((j as any)?.error || "buy_failed");

      setAvailableRubis(Number(j.availableRubis || 0));
      setOwned(j.owned || {});

      // ✅ si ton AuthProvider expose setUser/refreshMe, on le prend sans casser ton typage
      if (j.user && typeof authAny.setUser === "function" && user) {
        authAny.setUser({ ...user, rubis: Number(j.user.rubis) });
      } else if (typeof authAny.refreshMe === "function") {
        authAny.refreshMe();
      }
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBuying(false);
    }
  }

  const username = user?.username ?? "Invité";
  const previewUserId = user?.id ?? 999999; // ✅ important: permet à ChatMessageBubble d’afficher ton avatar custom

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Shop</div>

      {!token ? <div className="muted">Connecte-toi pour accéder au shop.</div> : null}
      {err ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ⚠️ {err}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {TOP_TABS.map((t) => (
          <button
            key={t.id}
            className={topTab === t.id ? "btnPrimary" : "btnGhost"}
            onClick={() => setTopTab(t.id)}
            disabled={loading || buying}
          >
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", opacity: 0.9, fontWeight: 900 }}>
          💎 {Number(availableRubis).toLocaleString("fr-FR")} rubis
        </div>
      </div>

      {topTab === "upgrades" ? (
        <div style={{ marginTop: 14 }} className="muted">
          Bientôt : améliorations (boosts, features, etc.).
        </div>
      ) : null}

      {topTab === "skins" ? (
        <>
          {/* ✅ Preview global (pas tronqué) */}
          <div
            className="shopPreviewNoTruncate"
            style={{
              marginTop: 12,
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
            <div style={{ fontWeight: 950 }}>Aperçu</div>
            <div style={{ marginTop: 10 }}>
              <ChatMessageBubble
                streamerAppearance={streamerAppearance}
                msg={{
                  id: "shop-preview",
                  userId: previewUserId,
                  username,
                  body: "Exemple de message — “ça rend comment ?”",
                  createdAt: new Date().toISOString(),
                  cosmetics: selectedPreviewCosmetics,
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 14, marginTop: 14 }}>
            {/* Menu catégories */}
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
                {SKIN_CATS.map((c) => (
                  <button
                    key={c.id}
                    className={cat === c.id ? "btnPrimary" : "btnGhost"}
                    onClick={() => setCat(c.id)}
                    disabled={loading || buying}
                    style={{ textAlign: "left" }}
                  >
                    {c.label}
                  </button>
                ))}
                <button className="btnGhost" onClick={load} disabled={loading || buying}>
                  {loading ? "Chargement…" : "Recharger"}
                </button>
              </div>
            </div>

            {/* Items */}
            <div
              style={{
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
                padding: 12,
                minHeight: 240,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 950 }}>{SKIN_CATS.find((x) => x.id === cat)?.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {buying ? "Achat…" : ""}
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                  gap: 12,
                }}
              >
                {visible.map((it) => {
                  const isOwned = (owned?.[it.kind] || []).includes(it.code);
                  const buyable = it.unlock === "shop" && (it.priceRubis ?? 0) > 0;
                  const price = Number(it.priceRubis || 0);
                  const canAfford = price <= availableRubis;

                  return (
                    <div
                      key={`${it.kind}:${it.code}`}
                      style={{
                        borderRadius: 16,
                        border:
                          selected?.kind === it.kind && selected?.code === it.code
                            ? "1px solid rgba(255,255,255,0.24)"
                            : "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.04)",
                        padding: 12,
                      }}
                    >
                      <button
                        className="btnGhostSmall"
                        style={{ width: "100%", textAlign: "left" }}
                        onClick={() => setSelected({ kind: it.kind, code: it.code })}
                        disabled={loading || buying}
                        title="Cliquer pour prévisualiser"
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 18 }}>{iconFor(it.kind)}</div>
                          <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.9 }}>
                            {isOwned
                              ? "Possédé"
                              : it.unlock === "shop"
                              ? "Shop"
                              : it.unlock === "achievement"
                              ? "Succès"
                              : it.unlock === "system"
                              ? "Agenda"
                              : it.unlock}
                          </div>
                        </div>

                        <div style={{ marginTop: 8, fontWeight: 950 }}>{it.name}</div>
                        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                          {it.unlock === "shop" && it.priceRubis != null
                            ? `${price.toLocaleString("fr-FR")} rubis`
                            : it.unlock === "achievement"
                            ? "Débloqué via succès"
                            : it.unlock === "system"
                            ? "Débloqué via agenda"
                            : "Non achetable"}
                        </div>
                      </button>

                      {/* mini preview */}
                      <div
                        style={{
                          marginTop: 10,
                          pointerEvents: "none",
                          opacity: 0.95,
                          transform: "scale(0.92)",
                          transformOrigin: "top left",
                          ...({
                            ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor,
                            ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor,
                          } as any),
                        }}
                      >
                        <ChatMessageBubble
                          streamerAppearance={streamerAppearance}
                          msg={{
                            id: `shop-card:${it.kind}:${it.code}`,
                            userId: previewUserId,
                            username,
                            body: "…",
                            createdAt: new Date().toISOString(),
                            cosmetics: previewForItem(it),
                          }}
                        />
                      </div>

                      {/* buy */}
                      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                        {buyable ? (
                          <button
                            className={(!token || buying || loading || isOwned || !canAfford) ? "btnGhostSmall" : "btnPrimarySmall"}
                            disabled={!token || buying || loading || isOwned || !canAfford}
                            onClick={() => buy(it)}
                          >
                            {isOwned ? "Déjà possédé" : !canAfford ? "Pas assez" : "Acheter"}
                          </button>
                        ) : (
                          <button className="btnGhostSmall" disabled>
                            Indisponible
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
