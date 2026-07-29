import * as React from "react";
import {
  listRumbleOutreach,
  logRumbleOutreachActivity,
  updateRumbleOutreach,
  type RumbleOutreachChannel,
  type RumbleOutreachContact,
  type RumbleOutreachPatch,
  type RumbleOutreachStats,
  type RumbleOutreachStatus,
} from "../../lib/api_rumble_outreach";

const STATUS_LABELS: Record<RumbleOutreachStatus, string> = {
  new: "À qualifier",
  ready: "Prêt",
  drafted: "Brouillon prêt",
  contacted: "Contacté",
  replied: "A répondu",
  interested: "Intéressé",
  onboarded: "Inscrit",
  declined: "Refus",
  do_not_contact: "Ne plus contacter",
  skipped: "Ignoré",
};

const CHANNEL_LABELS: Record<RumbleOutreachChannel, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  email: "E-mail",
  discord: "Discord",
  twitter: "X / Twitter",
  rumble: "Rumble",
};

const CHANNEL_COLORS: Record<RumbleOutreachChannel, string> = {
  instagram: "#f472b6",
  telegram: "#38bdf8",
  email: "#fbbf24",
  discord: "#818cf8",
  twitter: "#cbd5e1",
  rumble: "#85c742",
};

type EditorState = {
  displayName: string;
  instagram: string;
  instagramConfidence: "high" | "medium" | "low" | "";
  telegram: string;
  telegramUrl: string;
  email: string;
  twitter: string;
  discord: string;
  website: string;
  status: RumbleOutreachStatus;
  preferredChannel: RumbleOutreachChannel | "";
  draftSubject: string;
  draftMessage: string;
  notes: string;
  nextFollowUpAt: string;
};

function editorState(contact: RumbleOutreachContact): EditorState {
  return {
    displayName: contact.displayName,
    instagram: contact.instagram || "",
    instagramConfidence: (contact.instagramConfidence as EditorState["instagramConfidence"]) || "",
    telegram: contact.telegram || "",
    telegramUrl: contact.telegramUrl || "",
    email: contact.email || "",
    twitter: contact.twitter || "",
    discord: contact.discord || "",
    website: contact.website || "",
    status: contact.status,
    preferredChannel: contact.preferredChannel || preferredChannel(contact) || "",
    draftSubject: contact.draftSubject || "",
    draftMessage: contact.draftMessage || "",
    notes: contact.notes || "",
    nextFollowUpAt: contact.nextFollowUpAt ? contact.nextFollowUpAt.slice(0, 16) : "",
  };
}

function preferredChannel(contact: RumbleOutreachContact): RumbleOutreachChannel | null {
  if (contact.email) return "email";
  if (contact.telegram) return "telegram";
  if (contact.instagram) return "instagram";
  if (contact.discord) return "discord";
  if (contact.twitter) return "twitter";
  return "rumble";
}

function channelHref(contact: RumbleOutreachContact, channel: RumbleOutreachChannel) {
  if (channel === "email" && contact.email) {
    const params = new URLSearchParams();
    if (contact.draftSubject) params.set("subject", contact.draftSubject);
    if (contact.draftMessage) params.set("body", contact.draftMessage);
    return `mailto:${contact.email}${params.size ? `?${params.toString()}` : ""}`;
  }
  if (channel === "telegram" && contact.telegram) {
    return contact.telegramUrl || `https://t.me/${contact.telegram.replace(/^@/, "")}`;
  }
  if (channel === "instagram" && contact.instagram) {
    return `https://instagram.com/${contact.instagram.replace(/^@/, "")}`;
  }
  if (channel === "discord" && contact.discord) return contact.discord;
  if (channel === "twitter" && contact.twitter) return `https://x.com/${contact.twitter.replace(/^@/, "")}`;
  return contact.rumbleUrl;
}

function channelAvailable(contact: RumbleOutreachContact, channel: RumbleOutreachChannel) {
  if (channel === "email") return !!contact.email;
  if (channel === "telegram") return !!contact.telegram;
  if (channel === "instagram") return !!contact.instagram;
  if (channel === "discord") return !!contact.discord;
  if (channel === "twitter") return !!contact.twitter;
  return true;
}

function statusClass(status: RumbleOutreachStatus) {
  if (["onboarded", "interested", "replied"].includes(status)) return "fsb-tag-done";
  if (["declined", "do_not_contact"].includes(status)) return "fsb-tag-error";
  if (["ready", "drafted"].includes(status)) return "fsb-tag-scheduled";
  return "";
}

function fmt(value: number) {
  return new Intl.NumberFormat("fr-FR", { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
}

function ContactChip({ channel, value }: { channel: RumbleOutreachChannel; value: string }) {
  return (
    <span
      className="fsb-tag"
      title={value}
      style={{
        color: CHANNEL_COLORS[channel],
        borderColor: `${CHANNEL_COLORS[channel]}44`,
        background: `${CHANNEL_COLORS[channel]}12`,
      }}
    >
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

export function FsbRumbleOutreachSection() {
  const [contacts, setContacts] = React.useState<RumbleOutreachContact[]>([]);
  const [stats, setStats] = React.useState<RumbleOutreachStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | RumbleOutreachStatus>("all");
  const [channelFilter, setChannelFilter] = React.useState<"all" | RumbleOutreachChannel>("all");
  const [hideContacted, setHideContacted] = React.useState(true);
  const [editing, setEditing] = React.useState<RumbleOutreachContact | null>(null);
  const [form, setForm] = React.useState<EditorState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState("");

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listRumbleOutreach();
      setContacts(data.contacts);
      setStats(data.stats);
    } catch (err: any) {
      setError(String(err?.message || "Chargement impossible."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void reload(); }, [reload]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (hideContacted && ["contacted", "replied", "interested", "onboarded", "declined", "do_not_contact", "skipped"].includes(contact.status)) return false;
      if (statusFilter !== "all" && contact.status !== statusFilter) return false;
      if (channelFilter !== "all" && !channelAvailable(contact, channelFilter)) return false;
      if (!q) return true;
      return [
        contact.slug, contact.displayName, contact.instagram, contact.telegram,
        contact.email, contact.twitter, contact.about,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [contacts, hideContacted, search, statusFilter, channelFilter]);

  function replaceContact(next: RumbleOutreachContact) {
    setContacts((current) => current.map((item) => item.id === next.id ? next : item));
  }

  function openEditor(contact: RumbleOutreachContact) {
    setEditing(contact);
    setForm(editorState(contact));
  }

  async function saveEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !form) return;
    setSaving(true);
    setError("");
    try {
      const patch: RumbleOutreachPatch = {
        displayName: form.displayName.trim(),
        instagram: form.instagram.trim() || null,
        instagramConfidence: form.instagramConfidence || null,
        telegram: form.telegram.trim() || null,
        telegramUrl: form.telegramUrl.trim() || null,
        email: form.email.trim() || null,
        twitter: form.twitter.trim() || null,
        discord: form.discord.trim() || null,
        website: form.website.trim() || null,
        status: form.status,
        preferredChannel: form.preferredChannel || null,
        draftSubject: form.draftSubject.trim() || null,
        draftMessage: form.draftMessage.trim() || null,
        notes: form.notes.trim() || null,
        nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : null,
      };
      if (patch.draftMessage && patch.status === "new") patch.status = "drafted";
      const data = await updateRumbleOutreach(editing.id, patch);
      replaceContact(data.contact);
      setEditing(null);
      setForm(null);
      setToast("Fiche enregistrée");
    } catch (err: any) {
      setError(String(err?.message || "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  async function copyDraft(contact: RumbleOutreachContact) {
    if (!contact.draftMessage) {
      openEditor(contact);
      setToast("Ajoute d’abord le message à valider.");
      return;
    }
    await navigator.clipboard.writeText(contact.draftMessage);
    void logRumbleOutreachActivity(contact.id, {
      kind: "copied",
      channel: contact.preferredChannel || preferredChannel(contact),
      detail: "Brouillon copié depuis le board",
    }).catch(() => {});
    setToast("Message copié — aucun envoi effectué");
  }

  async function openChannel(contact: RumbleOutreachContact) {
    const channel = contact.preferredChannel || preferredChannel(contact) || "rumble";
    const href = channelHref(contact, channel);
    window.open(href, "_blank", "noopener,noreferrer");
    void logRumbleOutreachActivity(contact.id, { kind: "opened", channel }).catch(() => {});
  }

  async function markContacted(contact: RumbleOutreachContact) {
    const channel = contact.preferredChannel || preferredChannel(contact) || "rumble";
    setBusyId(contact.id);
    try {
      const data = await updateRumbleOutreach(contact.id, {
        status: "contacted",
        preferredChannel: channel,
        contactedAt: new Date().toISOString(),
      });
      replaceContact(data.contact);
      void logRumbleOutreachActivity(contact.id, { kind: "contacted", channel }).catch(() => {});
      setToast(`${contact.displayName} marqué comme contacté`);
    } catch (err: any) {
      setError(String(err?.message || "Mise à jour impossible."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="fsb-card">
        <div className="fsb-sectionhead">
          <div>
            <h2 className="fsb-sectiontitle" style={{ margin: 0 }}>Outreach streamers Rumble</h2>
            <p className="fsb-copy" style={{ margin: "7px 0 0" }}>
              Contacts publics vérifiés, brouillons éditables et suivi. Cette page ne déclenche aucun envoi automatique.
            </p>
          </div>
          <button className="fsb-btn" onClick={() => void reload()} disabled={loading}>↻ Actualiser</button>
        </div>

        <div className="fsb-stats">
          <div className="fsb-stat"><small>Streamers</small><strong>{stats?.total ?? "—"}</strong><span>Base Rumble FR</span></div>
          <div className="fsb-stat"><small>Instagram</small><strong style={{ color: "#f472b6" }}>{stats?.instagram ?? "—"}</strong><span>Profils attribués</span></div>
          <div className="fsb-stat"><small>E-mails</small><strong style={{ color: "#fbbf24" }}>{stats?.email ?? "—"}</strong><span>Adresses commerciales</span></div>
          <div className="fsb-stat"><small>Telegram</small><strong style={{ color: "#38bdf8" }}>{stats?.telegram ?? "—"}</strong><span>Comptes ou canaux publics</span></div>
          <div className="fsb-stat"><small>Contactés</small><strong style={{ color: "#34d399" }}>{stats?.contacted ?? "—"}</strong><span>Historique conservé</span></div>
        </div>
      </section>

      <section className="fsb-card">
        <div className="fsb-toolbar fsb-row" style={{ marginTop: 0 }}>
          <div className="fsb-actions">
            <div className="fsb-search">
              <input
                className="fsb-input"
                style={{ width: 230 }}
                placeholder="Pseudo, e-mail, réseau…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select className="fsb-select" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as typeof channelFilter)}>
              <option value="all">Tous les canaux</option>
              {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="fsb-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Tous les statuts</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <label className="fsb-switch">
            <input type="checkbox" checked={hideContacted} onChange={(event) => setHideContacted(event.target.checked)} />
            Masquer les déjà traités
          </label>
        </div>
        <div className="fsb-copy" style={{ marginTop: 12 }}>{filtered.length} fiche(s) affichée(s)</div>
      </section>

      {error ? <div className="fsb-alert">{error}</div> : null}
      {toast ? (
        <div className="fsb-card" style={{ padding: "12px 16px", borderColor: "rgba(16,185,129,.32)", color: "#6ee7b7" }}>
          {toast} <button className="fsb-icon" style={{ float: "right", width: 24, height: 24 }} onClick={() => setToast("")}>×</button>
        </div>
      ) : null}

      {loading ? (
        <section className="fsb-empty">Chargement des contacts…</section>
      ) : filtered.length === 0 ? (
        <section className="fsb-empty">Aucun contact ne correspond aux filtres.</section>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 14 }}>
          {filtered.map((contact) => {
            const best = contact.preferredChannel || preferredChannel(contact) || "rumble";
            return (
              <article key={contact.id} className="fsb-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="fsb-sectionhead">
                  <div>
                    <a href={contact.rumbleUrl} target="_blank" rel="noreferrer" style={{ color: "var(--text)", fontSize: 17, fontWeight: 800, textDecoration: "none" }}>
                      {contact.displayName}
                    </a>
                    <div className="fsb-sub">@{contact.slug} · {fmt(contact.followers)} followers</div>
                  </div>
                  <span className={`fsb-tag ${statusClass(contact.status)}`}>{STATUS_LABELS[contact.status]}</span>
                </div>

                <div className="fsb-tags">
                  {contact.instagram ? <ContactChip channel="instagram" value={`@${contact.instagram}`} /> : null}
                  {contact.telegram ? <ContactChip channel="telegram" value={`@${contact.telegram}`} /> : null}
                  {contact.email ? <ContactChip channel="email" value={contact.email} /> : null}
                  {contact.discord ? <ContactChip channel="discord" value={contact.discord} /> : null}
                  {contact.twitter ? <ContactChip channel="twitter" value={`@${contact.twitter}`} /> : null}
                </div>

                <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,.025)", border: "1px solid var(--bd)" }}>
                  <div className="fsb-sub">Canal conseillé</div>
                  <strong style={{ color: CHANNEL_COLORS[best] }}>{CHANNEL_LABELS[best]}</strong>
                  <div className="fsb-sub" style={{ marginTop: 5 }}>
                    {contact.email || contact.telegram || contact.instagram || contact.discord || contact.twitter || "Chat Rumble en dernier recours"}
                  </div>
                </div>

                <div className="fsb-copy" style={{ minHeight: 38 }}>
                  {contact.draftMessage
                    ? `${contact.draftMessage.slice(0, 145)}${contact.draftMessage.length > 145 ? "…" : ""}`
                    : "Message non défini — prêt à être rédigé ensemble."}
                </div>

                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <button className="fsb-btn fsb-btn-primary" onClick={() => openEditor(contact)}>Préparer</button>
                  <button className="fsb-btn" onClick={() => void copyDraft(contact)}>Copier</button>
                  <button className="fsb-btn" onClick={() => void openChannel(contact)}>Ouvrir {CHANNEL_LABELS[best]}</button>
                  <button className="fsb-btn" disabled={busyId === contact.id} onClick={() => void markContacted(contact)}>
                    {busyId === contact.id ? "Mise à jour…" : "Marquer contacté"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {editing && form ? (
        <div className="fsb-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) { setEditing(null); setForm(null); }
        }}>
          <form className="fsb-modal" style={{ width: "min(920px,96vw)", maxHeight: "92vh", overflow: "auto" }} onSubmit={saveEditor}>
            <div className="fsb-sectionhead">
              <div>
                <h3 style={{ margin: 0 }}>Préparer · {editing.displayName}</h3>
                <div className="fsb-copy">Corrige les contacts et prépare le brouillon. Aucun envoi à la sauvegarde.</div>
              </div>
              <button type="button" className="fsb-icon" onClick={() => { if (!saving) { setEditing(null); setForm(null); } }}>×</button>
            </div>

            <div className="fsb-grid">
              <label className="fsb-field"><span>Nom affiché</span><input className="fsb-input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
              <label className="fsb-field"><span>Statut</span><select className="fsb-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RumbleOutreachStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="fsb-field"><span>Instagram</span><input className="fsb-input" placeholder="@pseudo" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value.replace(/^@/, "") })} /></label>
              <label className="fsb-field"><span>Confiance Instagram</span><select className="fsb-select" value={form.instagramConfidence} onChange={(e) => setForm({ ...form, instagramConfidence: e.target.value as EditorState["instagramConfidence"] })}><option value="">Non évaluée</option><option value="high">Élevée</option><option value="medium">Moyenne</option><option value="low">Faible</option></select></label>
              <label className="fsb-field"><span>Telegram</span><input className="fsb-input" placeholder="@pseudo" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value.replace(/^@/, "") })} /></label>
              <label className="fsb-field"><span>Lien Telegram</span><input className="fsb-input" placeholder="https://t.me/…" value={form.telegramUrl} onChange={(e) => setForm({ ...form, telegramUrl: e.target.value })} /></label>
              <label className="fsb-field"><span>E-mail</span><input className="fsb-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="fsb-field"><span>X / Twitter</span><input className="fsb-input" value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value.replace(/^@/, "") })} /></label>
              <label className="fsb-field"><span>Discord</span><input className="fsb-input" value={form.discord} onChange={(e) => setForm({ ...form, discord: e.target.value })} /></label>
              <label className="fsb-field"><span>Site</span><input className="fsb-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
              <label className="fsb-field"><span>Canal privilégié</span><select className="fsb-select" value={form.preferredChannel} onChange={(e) => setForm({ ...form, preferredChannel: e.target.value as EditorState["preferredChannel"] })}><option value="">Automatique</option>{Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="fsb-field"><span>Relance prévue</span><input className="fsb-input" type="datetime-local" value={form.nextFollowUpAt} onChange={(e) => setForm({ ...form, nextFollowUpAt: e.target.value })} /></label>
              <label className="fsb-field fsb-field-full"><span>Objet e-mail</span><input className="fsb-input" placeholder="À valider ensemble" value={form.draftSubject} onChange={(e) => setForm({ ...form, draftSubject: e.target.value })} /></label>
              <label className="fsb-field fsb-field-full"><span>Message</span><textarea className="fsb-textarea" style={{ minHeight: 190 }} placeholder="Le message sera défini et validé ensemble…" value={form.draftMessage} onChange={(e) => setForm({ ...form, draftMessage: e.target.value })} /></label>
              <label className="fsb-field fsb-field-full"><span>Notes internes</span><textarea className="fsb-textarea" placeholder="Angle personnalisé, dernier live, particularités…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            </div>

            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Sources de l’enquête ({editing.sources.length})</summary>
              <div className="fsb-list">
                {editing.sources.map((source, index) => (
                  <div className="fsb-listitem" key={`${source.kind}-${source.value}-${index}`}>
                    <div className="fsb-listmain"><strong>{source.kind} · {source.value}</strong><div className="fsb-listmeta">{source.confidence}</div></div>
                    <a className="fsb-btn" href={source.url} target="_blank" rel="noreferrer">Source</a>
                  </div>
                ))}
              </div>
            </details>

            <div className="fsb-modal-actions">
              <button type="button" className="fsb-btn" onClick={() => { if (!saving) { setEditing(null); setForm(null); } }}>Annuler</button>
              <button className="fsb-btn fsb-btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer sans envoyer"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
