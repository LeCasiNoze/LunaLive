// web/src/pages/ShopPage.tsx
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
  { id: "subs", label: "Abonnements" },
  { id: "rubis", label: "Rubis" },
] as const;

const SKIN_CATS: Array<{ id: Kind; label: string }> = [
  { id: "username", label: "Pseudo" },
  { id: "badge", label: "Badges" },
  { id: "hat", label: "Chapeaux" },
  { id: "frame", label: "Cadrans message" },
  { id: "title", label: "Titres" },
];

const TITLE_LABELS: Record<string, string> = {
  title_ratus: "Ratus",
  title_ca_tourne: "Ça tourne !",
  title_vrai_viewer: "Vrai Viewer",
  title_no_life: "No Life",
  title_batman: "Batman",
  title_bigmoula: "BigMoula",
  title_lunaking: "LunaKing",
  title_allin_man: "All-in Man",
};

function titleLabelFromCode(code: string) {
  if (TITLE_LABELS[code]) return TITLE_LABELS[code];
  if (code.startsWith("title_")) return code.replace(/^title_/, "").replace(/_/g, " ");
  return code;
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
    const label = titleLabelFromCode(code);
    c.title = { text: label, label };
    (c as any).titleText = label;
    return;
  }
}

function rarityToTier(rarity: string) {
  const s = String(rarity || "").toLowerCase();
  if (s.includes("bronze")) return "bronze";
  if (s.includes("gold")) return "gold";
  if (s.includes("master") || s.includes("diamond")) return "master";
  return "silver";
}

function badgeTextFromCode(code: string) {
  if (code === "badge_luna") return "LUNA";
  if (code === "badge_777") return "777";
  return code.replace(/^badge_/, "").toUpperCase();
}

function renderItemTitle(it: ShopCosmeticItem) {
  if (it.kind === "badge") {
    const tier = rarityToTier((it as any).rarity);
    return (
      <span className="shopTitleBadgeRow">
        <span className="shopTitleKind">Badge</span>
        <span className={`chatBadge badge--${tier}`}>{badgeTextFromCode(it.code)}</span>
      </span>
    );
  }

  // default (pseudo / hat / frame / title)
  return <span className="shopTitleText">{it.name}</span>;
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
  const ar = a.priceRubis == null ? Number.POSITIVE_INFINITY : Number(a.priceRubis);
  const br = b.priceRubis == null ? Number.POSITIVE_INFINITY : Number(b.priceRubis);

  const ap = (a as any).pricePrestige == null ? Number.POSITIVE_INFINITY : Number((a as any).pricePrestige);
  const bp = (b as any).pricePrestige == null ? Number.POSITIVE_INFINITY : Number((b as any).pricePrestige);

  const aGroup = ar !== Number.POSITIVE_INFINITY ? 0 : ap !== Number.POSITIVE_INFINITY ? 1 : 2;
  const bGroup = br !== Number.POSITIVE_INFINITY ? 0 : bp !== Number.POSITIVE_INFINITY ? 1 : 2;

  if (aGroup !== bGroup) return aGroup - bGroup;

  const aPrice = aGroup === 0 ? ar : aGroup === 1 ? ap : Number.POSITIVE_INFINITY;
  const bPrice = bGroup === 0 ? br : bGroup === 1 ? bp : Number.POSITIVE_INFINITY;

  if (aPrice !== bPrice) return aPrice - bPrice;
  return a.name.localeCompare(b.name);
}

function normalizeOwnedRecord(x: any): Record<string, string[]> {
  if (!x) return {};
  if (typeof x === "object" && !Array.isArray(x)) return x as Record<string, string[]>;
  return {};
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

  const [availableRubis, setAvailableRubis] = React.useState<number>(user?.rubis ?? 0);
  const [availablePrestige, setAvailablePrestige] = React.useState<number>(0);

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

      const rub =
        Number((j as any).availableRubis) ||
        Number((j as any).user?.rubis) ||
        Number(user?.rubis ?? 0);

      setAvailableRubis(Number.isFinite(rub) ? rub : 0);

      const pre = Number((j as any).availablePrestige) || 0;
      setAvailablePrestige(Number.isFinite(pre) ? pre : 0);

      setOwned(normalizeOwnedRecord((j as any).owned));
      setEquipped((j as any).equipped || { username: null, badge: null, title: null, frame: null, hat: null });

      const arr = Array.isArray((j as any).items) ? (j as any).items : [];
      setItems(arr.filter((x: any) => x && x.active));
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (user?.rubis != null) setAvailableRubis(user.rubis);
  }, [user?.rubis]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const effectiveRubis = Number.isFinite(availableRubis) ? availableRubis : 0;
  const effectivePrestige = Number.isFinite(availablePrestige) ? availablePrestige : 0;

  const visible = React.useMemo(() => {
    return items.filter((x) => x.kind === cat).slice().sort(sortByPriceAsc);
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

  function isOwnedItem(it: ShopCosmeticItem) {
    const ownedByBool = (it as any).owned === true;
    const ownedByMap = (owned?.[it.kind] || []).includes(it.code);
    return ownedByBool || ownedByMap;
  }

  function addOwnedLocal(kind: string, code: string) {
    setOwned((prev) => {
      const next = { ...(prev || {}) };
      const arr = Array.isArray(next[kind]) ? next[kind].slice() : [];
      if (!arr.includes(code)) arr.push(code);
      next[kind] = arr;
      return next;
    });

    setItems((prev) =>
      prev.map((x) => ((x.kind === kind && x.code === code) ? ({ ...(x as any), owned: true } as any) : x))
    );
  }

  async function buy(it: ShopCosmeticItem) {
    if (!token) return;
    if (it.unlock !== "shop") return;

    const pr = Number(it.priceRubis ?? 0);
    const pp = Number((it as any).pricePrestige ?? 0);

    const isRubis = Number.isFinite(pr) && pr > 0;
    const isPrestige = Number.isFinite(pp) && pp > 0;

    if (!isRubis && !isPrestige) return;

    setBuying(true);
    setErr(null);
    try {
      const j = await buyShopCosmetic(token, it.kind, it.code);
      if (!j?.ok) throw new Error((j as any)?.error || "buy_failed");

      const rub =
        Number((j as any).availableRubis) ||
        Number((j as any).user?.rubis) ||
        (isPrestige ? effectiveRubis : Math.max(0, effectiveRubis - pr));

      setAvailableRubis(Number.isFinite(rub) ? rub : 0);

      const pre = Number((j as any).availablePrestige);
      if (Number.isFinite(pre)) setAvailablePrestige(pre);

      if ((j as any).owned) {
        setOwned(normalizeOwnedRecord((j as any).owned));
      } else {
        addOwnedLocal(it.kind, it.code);
      }

      if ((j as any).user && typeof authAny.setUser === "function" && user) {
        authAny.setUser({ ...user, rubis: Number((j as any).user.rubis) });
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
  const previewUserId = user?.id ?? 999999;

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Shop</div>

      {!token ? <div className="muted">Connecte-toi pour accéder au shop.</div> : null}

      {err ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ⚠️ {err}
        </div>
      ) : null}

      {/* Top Tabs */}
      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
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

        <div style={{ marginLeft: "auto", opacity: 0.9, fontWeight: 900, display: "flex", gap: 14 }}>
          <span>💎 {Number(effectiveRubis).toLocaleString("fr-FR")} rubis</span>
          <span>🏆 {Number(effectivePrestige).toLocaleString("fr-FR")} prestige</span>
        </div>
      </div>

      {/* UPGRADES */}
      {topTab === "upgrades" ? (
        <div style={{ marginTop: 14 }}>
          <div className="muted">Bientôt : améliorations (boosts, features, etc.).</div>
        </div>
      ) : null}

      {/* SUBS */}
      {topTab === "subs" ? (
        <div style={{ marginTop: 14 }}>
          <div className="muted">Bientôt : abonnements (packs, avantages, etc.).</div>
        </div>
      ) : null}

      {/* RUBIS */}
      {topTab === "rubis" ? (
        <div style={{ marginTop: 14 }}>
          <div className="muted">Bientôt : achat de rubis (packs / top-up).</div>
        </div>
      ) : null}

      {/* SKINS */}
      {topTab === "skins" ? (
        <>
          {/* Preview global */}
          <div
            className="shopPreviewNoTruncate cosPreview"
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
            {/* Catégories */}
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
                className="cosGrid"
                style={{
                  marginTop: 12,
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 420px))",
                  justifyContent: "start",
                  alignItems: "start",
                }}
              >
                {visible.map((it) => {
                  const ownedNow = isOwnedItem(it);

                  const pr = Number(it.priceRubis ?? 0);
                  const pp = Number((it as any).pricePrestige ?? 0);

                  const isRubis = Number.isFinite(pr) && pr > 0;
                  const isPrestige = Number.isFinite(pp) && pp > 0;

                  const buyable = it.unlock === "shop" && (isRubis || isPrestige);
                  const canAfford = isPrestige ? pp <= effectivePrestige : pr <= effectiveRubis;

                  const selectedNow = selected?.kind === it.kind && selected?.code === it.code;

                  return (
                    <div
                      key={`${it.kind}:${it.code}`}
                      className={[
                        "cosCard",
                        `cosCard--${it.kind}`,
                        selectedNow ? "isSelected" : "",
                        ownedNow ? "isOwned" : "",
                      ].join(" ")}
                      onClick={() => setSelected({ kind: it.kind as Kind, code: it.code })}
                      style={{
                        cursor: "pointer",
                        border: selectedNow
                          ? "1px solid rgba(255,255,255,0.24)"
                          : "1px solid rgba(255,255,255,0.08)",
                      }}
                      title="Cliquer pour prévisualiser"
                    >
                      <div className="cosCardHead">
                        <div style={{ minWidth: 0 }}>
                          <div className="cosCardTitle">{renderItemTitle(it)}</div>

                          <div className="cosCardMeta">
                            <span className={`cosPill ${ownedNow ? "cosPillOwned" : ""}`}>
                              {ownedNow
                                ? "Possédé"
                                : it.unlock === "shop"
                                ? "Shop"
                                : it.unlock === "achievement"
                                ? "Succès"
                                : it.unlock === "system"
                                ? "Agenda"
                                : it.unlock}
                            </span>

                            {it.unlock === "shop" && isRubis ? (
                              <span className="cosPrice">{pr.toLocaleString("fr-FR")} rubis</span>
                            ) : null}

                            {it.unlock === "shop" && isPrestige ? (
                              <span className="cosPrice">🏆 {pp.toLocaleString("fr-FR")} prestige</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* preview */}
                      <div
                        className="cosPreview"
                        style={{
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
                      <div style={{ display: "flex", gap: 8 }}>
                        {buyable ? (
                          <button
                            className={
                              !token || buying || loading || ownedNow || !canAfford
                                ? "btnGhostSmall"
                                : "btnPrimarySmall"
                            }
                            disabled={!token || buying || loading || ownedNow || !canAfford}
                            onClick={(e) => {
                              e.stopPropagation();
                              buy(it);
                            }}
                          >
                            {ownedNow ? "Possédé" : !canAfford ? "Pas assez" : "Acheter"}
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
