// Outils du chat détaché : alignement de la colonne + boutons rapides qui
// envoient une commande perso du bot (!discord, !youtube…) en un clic.
import * as React from "react";
import { Globe, Instagram, Plus, Settings, Trash2, Twitch, X as Close, Youtube } from "lucide-react";
import "./detachedChatTools.css";

export type PopupAlign = "left" | "center" | "right";
export type QuickIcon = "discord" | "youtube" | "instagram" | "website" | "tiktok" | "x" | "kick" | "twitch" | "rumble" | "emoji";
export type QuickAction = { id: string; icon: QuickIcon; emoji?: string; trigger: string };

const DiscordGlyph = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
    <path d="M19.3 5.3A16.5 16.5 0 0 0 15.2 4l-.5 1a15 15 0 0 0-5.4 0l-.5-1a16.5 16.5 0 0 0-4.1 1.3C2.1 9.2 1.4 13 1.7 16.7A16.6 16.6 0 0 0 6.8 19.3l1-1.6a10.5 10.5 0 0 1-1.6-.8l.4-.3a11.8 11.8 0 0 0 10.8 0l.4.3c-.5.3-1 .6-1.6.8l1 1.6a16.6 16.6 0 0 0 5.1-2.6c.4-4.3-.7-8-3-11.4ZM8.7 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
  </svg>
);
const TikTokGlyph = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M16.6 3c.4 2.3 1.8 3.8 4.1 4v3.2a8 8 0 0 1-4-1.2v6.5a6 6 0 1 1-6-6h.6v3.3a2.8 2.8 0 1 0 2.2 2.7V3h3.1Z" />
  </svg>
);
const Letter = ({ c }: { c: string }) => <span className="lldc-letter" aria-hidden="true">{c}</span>;

export const QUICK_ICONS: Record<Exclude<QuickIcon, "emoji">, { label: string; bg: string; render: () => React.ReactNode }> = {
  discord: { label: "Discord", bg: "#5865F2", render: () => <DiscordGlyph /> },
  youtube: { label: "YouTube", bg: "#FF0033", render: () => <Youtube size={17} /> },
  instagram: { label: "Instagram", bg: "linear-gradient(135deg,#f58529,#dd2a7b 50%,#8134af)", render: () => <Instagram size={16} /> },
  website: { label: "Site web", bg: "#334155", render: () => <Globe size={16} /> },
  tiktok: { label: "TikTok", bg: "#111111", render: () => <TikTokGlyph /> },
  x: { label: "X", bg: "#000000", render: () => <Letter c="𝕏" /> },
  kick: { label: "Kick", bg: "#53FC18", render: () => <Letter c="K" /> },
  twitch: { label: "Twitch", bg: "#9146FF", render: () => <Twitch size={16} /> },
  rumble: { label: "Rumble", bg: "#85C742", render: () => <Letter c="▶" /> },
};

export function QuickIconTile({ action, size = 32 }: { action: Pick<QuickAction, "icon" | "emoji">; size?: number }) {
  if (action.icon === "emoji") {
    return <span className="lldc-tile lldc-tile--emoji" style={{ width: size, height: size }}>{action.emoji || "⭐"}</span>;
  }
  const meta = QUICK_ICONS[action.icon] ?? QUICK_ICONS.website;
  return (
    <span className={`lldc-tile lldc-tile--${action.icon}`} style={{ width: size, height: size, background: meta.bg }}>
      {meta.render()}
    </span>
  );
}

/** Rangée de boutons au-dessus de la zone d'envoi. */
export function QuickActionsBar({
  actions,
  disabled,
  onSend,
}: {
  actions: QuickAction[];
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  if (!actions.length) return null;
  return (
    <div className="lldc-bar" role="toolbar" aria-label="Commandes rapides">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className="lldc-bar__btn"
          disabled={disabled}
          title={`Envoyer !${a.trigger}`}
          aria-label={`Envoyer !${a.trigger}`}
          onClick={() => onSend(`!${a.trigger}`)}
        >
          <QuickIconTile action={a} size={30} />
          <span className="lldc-bar__cmd">!{a.trigger}</span>
        </button>
      ))}
    </div>
  );
}

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

/** Boutons rapides du streamer, stockés côté serveur (suivent ses appareils). */
export function useQuickActions(token: string | null) {
  const [actions, setActions] = React.useState<QuickAction[]>([]);
  React.useEffect(() => {
    if (!token) { setActions([]); return; }
    let alive = true;
    fetch(`${apiBase()}/me/overlay/widgets-config`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => {
        const list = j?.config?.popoutChat?.quickActions;
        if (alive && Array.isArray(list)) setActions(list.filter((a: any) => a && typeof a.trigger === "string"));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);
  const save = React.useCallback(async (next: QuickAction[]) => {
    setActions(next);
    if (!token) return;
    await fetch(`${apiBase()}/me/overlay/widgets-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ popoutChat: { quickActions: next } }),
    }).catch(() => {
      window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind: "error", title: "Boutons rapides", message: "Sauvegarde impossible." } }));
    });
  }, [token]);
  return [actions, save] as const;
}

const ALIGN_KEY = (slug: string) => `lunalive_popout_align_${slug.toLowerCase()}`;
export function usePopupAlign(slug: string) {
  const [align, setAlign] = React.useState<PopupAlign>(() => {
    try {
      const v = window.localStorage.getItem(ALIGN_KEY(slug));
      return v === "left" || v === "right" ? v : "center";
    } catch { return "center"; }
  });
  const update = React.useCallback((v: PopupAlign) => {
    setAlign(v);
    try { window.localStorage.setItem(ALIGN_KEY(slug), v); } catch { /* stockage indisponible */ }
  }, [slug]);
  return [align, update] as const;
}

/** Engrenage du chat détaché + panneau de réglages. */
export function DetachedChatSettings({
  align,
  onAlign,
  canEditActions,
  token,
  actions,
  onActions,
}: {
  align: PopupAlign;
  onAlign: (v: PopupAlign) => void;
  canEditActions: boolean;
  token: string | null;
  actions: QuickAction[];
  onActions: (next: QuickAction[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [commands, setCommands] = React.useState<string[] | null>(null);
  const [draft, setDraft] = React.useState<{ icon: QuickIcon; emoji: string; trigger: string }>({ icon: "discord", emoji: "⭐", trigger: "" });
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  React.useEffect(() => {
    if (!open || !canEditActions || !token || commands) return;
    fetch(`${apiBase()}/me/bot/commands`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => setCommands(Array.isArray(j?.commands) ? j.commands.filter((c: any) => c.enabled !== false).map((c: any) => String(c.trigger)) : []))
      .catch(() => setCommands([]));
  }, [open, canEditActions, token, commands]);

  const addAction = () => {
    const trigger = draft.trigger.trim().replace(/^!/, "");
    if (!trigger) return;
    onActions([...actions, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, icon: draft.icon, emoji: draft.icon === "emoji" ? draft.emoji || "⭐" : undefined, trigger }]);
    setAdding(false);
    setDraft({ icon: "discord", emoji: "⭐", trigger: "" });
  };

  return (
    <div className="lldc-gear" ref={panelRef}>
      <button type="button" className="lldc-gear__btn" aria-label="Réglages du chat détaché" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Settings size={16} />
      </button>
      {open ? (
        <div className="lldc-panel" role="dialog" aria-label="Réglages du chat détaché">
          <div className="lldc-panel__head">
            <span>Réglages</span>
            <button type="button" className="lldc-icon-btn" aria-label="Fermer" onClick={() => setOpen(false)}><Close size={14} /></button>
          </div>

          <div className="lldc-section">
            <div className="lldc-section__t">Position du chat</div>
            <div className="lldc-seg">
              {(["left", "center", "right"] as const).map((v) => (
                <button key={v} type="button" className={align === v ? "is-on" : ""} onClick={() => onAlign(v)}>
                  {v === "left" ? "Gauche" : v === "center" ? "Centre" : "Droite"}
                </button>
              ))}
            </div>
          </div>

          {canEditActions ? (
            <div className="lldc-section">
              <div className="lldc-section__t">Boutons rapides</div>
              <div className="lldc-list">
                {actions.map((a) => (
                  <div key={a.id} className="lldc-row">
                    <QuickIconTile action={a} size={26} />
                    <span className="lldc-row__cmd">!{a.trigger}</span>
                    <button type="button" className="lldc-icon-btn" aria-label={`Retirer !${a.trigger}`} onClick={() => onActions(actions.filter((x) => x.id !== a.id))}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {adding ? (
                <div className="lldc-add">
                  <div className="lldc-icons">
                    {(Object.keys(QUICK_ICONS) as Exclude<QuickIcon, "emoji">[]).map((k) => (
                      <button key={k} type="button" title={QUICK_ICONS[k].label} aria-label={QUICK_ICONS[k].label}
                        className={draft.icon === k ? "is-on" : ""} onClick={() => setDraft((d) => ({ ...d, icon: k }))}>
                        <QuickIconTile action={{ icon: k }} size={26} />
                      </button>
                    ))}
                    <button type="button" title="Emoji" aria-label="Emoji" className={draft.icon === "emoji" ? "is-on" : ""}
                      onClick={() => setDraft((d) => ({ ...d, icon: "emoji" }))}>
                      <QuickIconTile action={{ icon: "emoji", emoji: draft.emoji }} size={26} />
                    </button>
                  </div>
                  {draft.icon === "emoji" ? (
                    <input className="lldc-input" value={draft.emoji} maxLength={4} aria-label="Emoji du bouton"
                      onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} />
                  ) : null}
                  <select className="lldc-input" value={draft.trigger} aria-label="Commande à envoyer"
                    onChange={(e) => setDraft((d) => ({ ...d, trigger: e.target.value }))}>
                    <option value="">{commands == null ? "Chargement des commandes…" : commands.length ? "Choisis une commande" : "Aucune commande perso"}</option>
                    {(commands ?? []).map((c) => <option key={c} value={c}>!{c}</option>)}
                  </select>
                  <div className="lldc-add__actions">
                    <button type="button" className="lldc-ghost" onClick={() => setAdding(false)}>Annuler</button>
                    <button type="button" className="lldc-primary" disabled={!draft.trigger} onClick={addAction}>Ajouter</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="lldc-plus" onClick={() => setAdding(true)}>
                  <Plus size={14} /> Ajouter un bouton
                </button>
              )}

              <a className="lldc-link" href="/dashboard?tab=lunabot&module=commands" target="_blank" rel="noreferrer">
                Modifier mes commandes ↗
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
