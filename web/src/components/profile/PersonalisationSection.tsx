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
import { getInitials } from "../../lib/cosmetics";

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

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

const CATS: Array<{ id: Kind; label: string }> = [
  { id: "username", label: "Pseudo" },
  { id: "badge", label: "Badges" },
  { id: "hat", label: "Chapeaux" },
  { id: "frame", label: "Cadrans message" },
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

// ─────────────────────────────────────────────
// Avatar helpers (compact upload)
// ─────────────────────────────────────────────
function parseJwt(token: string): any | null {
  try {
    const p = token.split(".")[1];
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function makeSquareAvatar(file: File, size = 128): Promise<{ mime: string; b64: string; previewUrl: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image_load_failed"));
  });

  const s = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - s) / 2);
  const sy = Math.floor((img.height - s) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

  const blob: Blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), "image/webp", 0.82);
  });

  const finalBlob =
    blob && blob.size > 0
      ? blob
      : await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b || new Blob()), "image/jpeg", 0.85);
        });

  URL.revokeObjectURL(url);

  const mime = finalBlob.type || "image/webp";
  const b64 = await blobToBase64(finalBlob);
  const previewUrl = URL.createObjectURL(finalBlob);

  return { mime, b64, previewUrl };
}

/**
 * Preview mapping : on traduit tes codes (DB/catalogue)
 * -> en cosmetics compréhensibles par ChatMessageBubble.
 */
function applyPreview(kind: Kind, code: string | null, c: any) {
  if (!code) return;

  // init safe
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

  const me = React.useMemo(() => (token ? parseJwt(token) : null), [token]);
  const myUserId = Number(me?.id || 0);

  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [avatarPayload, setAvatarPayload] = React.useState<{ mime: string; b64: string } | null>(null);
  const [avatarBusy, setAvatarBusy] = React.useState(false);

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

  React.useEffect(() => {
    if (!myUserId) return;
    // on affiche direct l’endpoint public (si 404 => ça sera juste les initiales dans l’UI)
    setAvatarUrl(`${API_BASE}/avatars/u/${myUserId}`);
  }, [myUserId]);

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
      const cur = (equipped as any)?.[kind] ?? null;
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

  function previewForItem(it: UiItem): ChatCosmetics | null {
    const simulated = {
      username: tab === "username" ? it.code : equipped.username,
      badge: tab === "badge" ? it.code : equipped.badge,
      title: tab === "title" ? it.code : equipped.title,
      frame: tab === "frame" ? it.code : equipped.frame,
      hat: tab === "hat" ? it.code : equipped.hat,
    };
    return buildCosmeticsPreview(simulated);
  }

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
          {/* ✅ Avatar section (compact) */}
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              padding: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 950, marginBottom: 8 }}>Avatar</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="chatAvatarBorder" style={{ width: 44, height: 44 }}>
                {(avatarPreview || avatarUrl) ? (
                  <img
                    className="chatAvatarImg"
                    src={avatarPreview || `${avatarUrl}`}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
                <div className="chatAvatarCircle" style={{ width: 38, height: 38 }}>
                  {getInitials(username)}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
                <button
                  className="btnGhostSmall"
                  disabled={!token || avatarBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  {avatarPayload ? "Changer l’image" : "Uploader une image"}
                </button>

                {avatarPayload ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btnPrimarySmall"
                      disabled={!token || avatarBusy}
                      onClick={async () => {
                        if (!token || !avatarPayload) return;
                        setAvatarBusy(true);
                        setErr(null);
                        try {
                          const r = await fetch(`${API_BASE}/me/avatar`, {
                            method: "PUT",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ mime: avatarPayload.mime, data: avatarPayload.b64 }),
                          });
                          const j = await r.json();
                          if (!j?.ok) throw new Error(j?.error || "upload_failed");

                          const bust = Date.now();
                          setAvatarUrl(`${API_BASE}/avatars/u/${myUserId}?v=${bust}`);

                          setAvatarPayload(null);
                          if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                          setAvatarPreview(null);
                        } catch (e: any) {
                          setErr(String(e?.message || "Erreur"));
                        } finally {
                          setAvatarBusy(false);
                        }
                      }}
                    >
                      {avatarBusy ? "Upload…" : "Valider"}
                    </button>

                    <button
                      className="btnGhostSmall"
                      disabled={avatarBusy}
                      onClick={() => {
                        setAvatarPayload(null);
                        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                        setAvatarPreview(null);
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    className="btnGhostSmall"
                    disabled={!token || avatarBusy}
                    onClick={async () => {
                      if (!token) return;
                      setAvatarBusy(true);
                      setErr(null);
                      try {
                        const r = await fetch(`${API_BASE}/me/avatar`, {
                          method: "DELETE",
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        const j = await r.json().catch(() => ({}));
                        if (j?.ok !== true) throw new Error(j?.error || "delete_failed");

                        setAvatarUrl(null);
                      } catch (e: any) {
                        setErr(String(e?.message || "Erreur"));
                      } finally {
                        setAvatarBusy(false);
                      }
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setErr(null);
                setAvatarBusy(true);
                try {
                  const { mime, b64, previewUrl } = await makeSquareAvatar(f, 128);
                  setAvatarPayload({ mime, b64 });
                  if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                  setAvatarPreview(previewUrl);
                } catch (err: any) {
                  setErr(String(err?.message || "avatar_prepare_failed"));
                } finally {
                  setAvatarBusy(false);
                }
              }}
            />
          </div>

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
              const isOwned = !!it.free || (it.code != null && ownedSet.has(it.code));
              const cardPreviewCosmetics = previewForItem(it);

              return (
                <button
                  key={`${it.kind}:${String(it.code)}`}
                  onClick={() => (isOwned ? doEquip(it.kind, it.code) : null)}
                  disabled={!token || loading || saving || !isOwned}
                  title={
                    !isOwned ? "Non possédé" : isEquipped ? "Cliquer pour retirer" : "Cliquer pour équiper"
                  }
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

                  {/* Mini preview "comme en chat" */}
                  <div
                    style={{
                      marginTop: 10,
                      pointerEvents: "none",
                      opacity: !isOwned ? 0.8 : 0.95,
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
                        id: `cardpreview:${it.kind}:${String(it.code)}`,
                        userId: 999999,
                        username,
                        body: "…",
                        createdAt: new Date().toISOString(),
                        cosmetics: cardPreviewCosmetics,
                      }}
                    />
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
