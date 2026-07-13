import * as React from "react";
import {
  getFsbTwitchScout,
  markScoutContacted,
  type TwitchScoutStreamer,
} from "../../lib/api_fsb_twitch_scout";

type CountryFilter = "all" | "UK" | "DE" | "EN?";
type ContactFilter = "all" | "telegram" | "email" | "discord" | "instagram";
type SortKey = "followers" | "viewersAvg" | "contact";

const CONTACT_RANK: Record<string, number> = {
  telegram: 0,
  email: 1,
  discord: 2,
  instagram: 3,
};

function flag(c: string | null): string {
  if (c === "UK") return "🇬🇧 UK";
  if (c === "DE") return "🇩🇪 DE";
  if (c === "US") return "🇺🇸 US";
  if (c === "EN?") return "EN ?";
  return c || "?";
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const CONTACT_META: Array<{ key: keyof TwitchScoutStreamer; label: string; color: string; href: (v: string) => string }> = [
  { key: "telegram", label: "Telegram", color: "#7ec8ff", href: (v) => v },
  { key: "email", label: "Mail", color: "#f0c07a", href: (v) => (v.startsWith("http") ? v : `mailto:${v}`) },
  { key: "discord", label: "Discord", color: "#a8adf7", href: (v) => v },
  { key: "instagram", label: "Insta", color: "#f28ac7", href: (v) => v },
];

function verdictColor(score: string | null): string {
  if (score === "ok") return "#34d399";
  if (score === "neutral") return "#cbd2e0";
  if (score === "warn") return "#fbbf24";
  if (score === "bot") return "#fc8181";
  return "var(--muted)";
}

const CELSIUS_URL = "https://celsiuscasino.com/";
// compte Gmail expéditeur pour l'outreach (doit être connecté dans le navigateur)
const MAIL_FROM = "aurixvip@gmail.com";
// Telegram de contact à mettre dans les mails (réponse la plus rapide)
const AURIX_TG = "@Aurix_VipManager";

function firstName(name: string | null, login: string): string {
  const n = (name || login || "").trim();
  const w = n.split(/[\s_|.-]+/).find((x) => /^[A-Za-zÀ-ÿ]{2,}$/.test(x));
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : login;
}

function igUsername(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/instagram\.com\/([^/?#\s]+)/i);
  return m ? m[1].replace(/^@/, "") : null;
}

// message DM court pour Instagram (pas de pré-remplissage possible côté IG,
// on le copie dans le presse-papier). Adapté prénom + langue.
function buildInstaMessage(r: TwitchScoutStreamer): string {
  const name = firstName(r.name, r.login);
  if (r.country === "DE" || r.language === "DE") {
    return `Hey ${name}! 👋 Ich komme von Celsius Casino — wir finden deinen Content stark und würden gern mit dir zusammenarbeiten. Falls du interessiert bist: bist du dabei, wie sehen deine Stream-Stats aus (Screenshot reicht), und welchen Deal möchtest du? Am schnellsten auf Telegram ${AURIX_TG} 🙌 ${CELSIUS_URL}`;
  }
  return `Hey ${name}! 👋 I'm from Celsius Casino — we love your content and would like to partner with you. If you're interested: are you keen, what do your stream stats look like (a screenshot's perfect), and what deal you'd want? Quickest to chat on Telegram ${AURIX_TG} 🙌 ${CELSIUS_URL}`;
}

// email d'approche Celsius, adapté prénom + langue. Renvoie {subject, body}.
function buildEmail(r: TwitchScoutStreamer): { subject: string; body: string } {
  const name = firstName(r.name, r.login);
  if (r.country === "DE" || r.language === "DE") {
    return {
      subject: "Partnerschaft mit Celsius Casino?",
      body:
        `Hey ${name},\n\n` +
        `ich melde mich von Celsius Casino — wir arbeiten mit Casino-Streamern und ich finde deinen Content richtig stark. Wir würden gern eine Partnerschaft mit dir aufbauen.\n\n` +
        `Falls du interessiert bist, sag mir gern kurz:\n` +
        `- ob du Lust hast,\n` +
        `- wie deine Stream-Stats aussehen (ein Screenshot reicht),\n` +
        `- und welchen Deal du dir vorstellst.\n\n` +
        `Am schnellsten erreichst du mich direkt auf Telegram: ${AURIX_TG}\n\n` +
        `Hier sind wir: ${CELSIUS_URL}\n\n` +
        `Ich freue mich auf deine Antwort!`,
    };
  }
  return {
    subject: "Partnership with Celsius Casino?",
    body:
      `Hey ${name},\n\n` +
      `I'm reaching out from Celsius Casino — we work with casino streamers and I really like your content. We'd love to explore a partnership with you.\n\n` +
      `If you're interested, just let me know:\n` +
      `- whether you're keen,\n` +
      `- a quick look at your stream stats (a screenshot is perfect),\n` +
      `- and the kind of deal you'd be looking for.\n\n` +
      `The quickest way to reach me is on Telegram: ${AURIX_TG}\n\n` +
      `You can check us out here: ${CELSIUS_URL}\n\n` +
      `Looking forward to hearing from you!`,
  };
}

export function FsbScoutSection() {
  const [rows, setRows] = React.useState<TwitchScoutStreamer[]>([]);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [country, setCountry] = React.useState<CountryFilter>("all");
  const [contactType, setContactType] = React.useState<ContactFilter>("all");
  const [onlyReal, setOnlyReal] = React.useState(true);
  const [onlyContact, setOnlyContact] = React.useState(true);
  const [onlyLive, setOnlyLive] = React.useState(false);
  const [hideContacted, setHideContacted] = React.useState(true);
  const [sortKey, setSortKey] = React.useState<SortKey>("viewersAvg");
  const [search, setSearch] = React.useState("");
  const [busyLogin, setBusyLogin] = React.useState<string | null>(null);
  // Outil d'envoi local (scripts/telegram_outreach.mjs) qui pilote Telegram Desktop.
  const BRIDGE = "http://localhost:8747";
  const [bridgeUp, setBridgeUp] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    fetch(`${BRIDGE}/api/ping`).then((r) => setBridgeUp(r.ok)).catch(() => setBridgeUp(false));
  }, []);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFsbTwitchScout();
      setRows(res.streamers);
      setUpdatedAt(res.updatedAt);
    } catch (err: any) {
      setError(String(err?.message || "Chargement impossible."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (country !== "all" && r.country !== country) return false;
      if (contactType !== "all" && !r[contactType]) return false;
      if (onlyReal && r.botStatus === "bot") return false;
      if (onlyContact && !r.hasContact) return false;
      if (onlyLive && !r.live) return false;
      if (hideContacted && r.contacted) return false;
      if (q && !(`${r.login} ${r.name} ${r.title || ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortKey === "followers") return b.followers - a.followers;
      if (sortKey === "viewersAvg") return (b.viewersAvg || b.viewers) - (a.viewersAvg || a.viewers);
      // contact : par mode (telegram > mail > discord > insta), sans contact en dernier
      const ra = a.contactType ? CONTACT_RANK[a.contactType] ?? 9 : 9;
      const rb = b.contactType ? CONTACT_RANK[b.contactType] ?? 9 : 9;
      if (ra !== rb) return ra - rb;
      return b.followers - a.followers;
    });
    return list;
  }, [rows, country, contactType, onlyReal, onlyContact, onlyLive, hideContacted, sortKey, search]);

  const toggleContacted = React.useCallback(async (r: TwitchScoutStreamer) => {
    const next = !r.contacted;
    setBusyLogin(r.login);
    setRows((prev) => prev.map((x) => (x.login === r.login ? { ...x, contacted: next, contactedAt: next ? new Date().toISOString() : null } : x)));
    try {
      await markScoutContacted(r.login, r.contactType || "telegram", next);
    } catch {
      // rollback en cas d'échec
      setRows((prev) => prev.map((x) => (x.login === r.login ? { ...x, contacted: !next } : x)));
    } finally {
      setBusyLogin(null);
    }
  }, []);

  // Envoie le DM Telegram via l'outil local. notDmable = canal/groupe (à basculer).
  const sendTelegramDM = React.useCallback(async (r: TwitchScoutStreamer, opts?: { silent?: boolean }): Promise<{ ok: boolean; error?: string; notDmable?: boolean }> => {
    setBusyLogin(r.login);
    try {
      const res = await fetch(`${BRIDGE}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: r.login }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        setBridgeUp(true);
        setRows((prev) => prev.map((x) => (x.login === r.login ? { ...x, contacted: true, contactedAt: new Date().toISOString(), contactedChannel: "telegram" } : x)));
        return { ok: true };
      }
      if (d.notDmable) return { ok: false, error: d.error, notDmable: true };
      if (!opts?.silent) window.alert(`Échec de l'envoi à ${r.name} : ${d.error || res.status}`);
      return { ok: false, error: d.error || String(res.status) };
    } catch {
      setBridgeUp(false);
      if (!opts?.silent) window.alert("Outil d'envoi local non détecté.\n\nSur ton PC, lance et garde ouvert :\n  node scripts/telegram_outreach.mjs\n\n(+ un onglet Telegram Web actif.)");
      return { ok: false, error: "outil local non détecté" };
    } finally {
      setBusyLogin(null);
    }
  }, []);

  // Mail : ouvre la compose Gmail pré-remplie (destinataire + objet + corps),
  // copie le corps dans le presse-papier, marque contacté. Aucun outil local.
  const sendMail = React.useCallback(async (r: TwitchScoutStreamer) => {
    if (!r.email) return;
    const { subject, body } = buildEmail(r);
    try { await navigator.clipboard.writeText(body); } catch { /* clipboard best-effort */ }
    const url = `https://mail.google.com/mail/?authuser=${encodeURIComponent(MAIL_FROM)}&view=cm&fs=1&to=${encodeURIComponent(r.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener");
    setRows((prev) => prev.map((x) => (x.login === r.login ? { ...x, contacted: true, contactedAt: new Date().toISOString(), contactedChannel: "email" } : x)));
    markScoutContacted(r.login, "email", true).catch(() => {});
  }, []);

  // Insta : copie le message, ouvre la DM Instagram (ig.me/m/pseudo), marque contacté.
  const sendInsta = React.useCallback(async (r: TwitchScoutStreamer) => {
    const user = igUsername(r.instagram);
    if (!user) return;
    try { await navigator.clipboard.writeText(buildInstaMessage(r)); } catch { /* best-effort */ }
    window.open(`https://ig.me/m/${user}`, "_blank", "noopener");
    setRows((prev) => prev.map((x) => (x.login === r.login ? { ...x, contacted: true, contactedAt: new Date().toISOString(), contactedChannel: "instagram" } : x)));
    markScoutContacted(r.login, "instagram", true).catch(() => {});
  }, []);

  // Clic bouton Telegram : si le lien est un canal/groupe, bascule auto sur Mail puis Insta.
  const handleDmClick = React.useCallback(async (r: TwitchScoutStreamer) => {
    const res = await sendTelegramDM(r, { silent: true });
    if (res.ok) return;
    if (res.notDmable) {
      if (r.email) return void sendMail(r);
      if (r.instagram) return void sendInsta(r);
      window.alert(`${r.name} : le Telegram est un canal/groupe et il n'a ni mail ni Insta — à écarter.`);
      return;
    }
    window.alert(`Échec de l'envoi à ${r.name} : ${res.error}`);
  }, [sendTelegramDM, sendMail, sendInsta]);

  // Envoi en série via le canal prioritaire (Telegram auto, sinon Mail/Insta ouverts).
  const [batch, setBatch] = React.useState<{ running: boolean; done: number; total: number }>({ running: false, done: 0, total: 0 });
  const stopBatch = React.useRef(false);
  // Contacte chacun par son canal prioritaire : Telegram auto (outil local),
  // sinon Mail, sinon Insta (ces deux ouvrent un onglet — autoriser les pop-ups).
  const runBatch = React.useCallback(async (targets: TwitchScoutStreamer[]) => {
    if (!targets.length) return;
    const tg = targets.filter((r) => r.telegram).length;
    const openers = targets.length - tg;
    if (!window.confirm(
      `Contacter ${targets.length} streamers, l'un après l'autre ?\n\n` +
      `• ${tg} via Telegram : envoi AUTO — garde un onglet Telegram Web actif et ne touche à rien pendant la séquence.\n` +
      `• ${openers} via Mail/Insta : un onglet s'ouvre par personne (à envoyer à la main). Autorise les pop-ups pour ce site.\n` +
      `• Espace tes campagnes pour éviter les limites.`
    )) return;
    stopBatch.current = false;
    setBatch({ running: true, done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      if (stopBatch.current) break;
      const t = targets[i];
      if (t.telegram) {
        const r = await sendTelegramDM(t, { silent: true });
        if (r.ok) {
          await new Promise((res) => setTimeout(res, 2500));
        } else if (r.notDmable) {
          // Telegram = canal/groupe -> bascule sur mail puis insta, on continue
          if (t.email) await sendMail(t);
          else if (t.instagram) await sendInsta(t);
          await new Promise((res) => setTimeout(res, 600));
        } else {
          window.alert(`Séquence arrêtée sur ${t.name} : ${r.error}`); break;
        }
      } else if (t.email) {
        await sendMail(t);
        await new Promise((res) => setTimeout(res, 600));
      } else if (t.instagram) {
        await sendInsta(t);
        await new Promise((res) => setTimeout(res, 600));
      }
      setBatch((b) => ({ ...b, done: i + 1 }));
    }
    setBatch((b) => ({ ...b, running: false }));
  }, [sendTelegramDM, sendMail, sendInsta]);

  const stats = React.useMemo(() => {
    const live = rows.filter((r) => r.live).length;
    const withContact = rows.filter((r) => r.hasContact).length;
    const bots = rows.filter((r) => r.botStatus === "bot").length;
    const contacted = rows.filter((r) => r.contacted).length;
    return { total: rows.length, live, withContact, bots, contacted };
  }, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {error ? <div className="fsb-alert">{error}</div> : null}
      {bridgeUp === false ? (
        <div className="fsb-alert" style={{ background: "rgba(245,158,11,.1)", borderColor: "rgba(245,158,11,.28)", color: "#fbbf24" }}>
          Outil d'envoi Telegram non détecté. Pour activer les boutons « 📨 DM », lance sur ton PC et garde ouvert : <code>node scripts/telegram_outreach.mjs</code> (+ Telegram Desktop connecté), puis recharge.
        </div>
      ) : null}

      {/* En-tête + stats */}
      <section className="fsb-card">
        <div className="fsb-row">
          <div>
            <h2 className="fsb-sectiontitle">🎰 Scout casino Twitch</h2>
            <div className="fsb-muted" style={{ marginTop: 6 }}>
              Streamers casino UK / DE découverts automatiquement, avec contact et détection de viewers achetés.
              {updatedAt ? ` MAJ ${relDate(updatedAt)}.` : ""}
            </div>
          </div>
          <div className="fsb-actions">
            {batch.running ? (
              <button className="fsb-btn" onClick={() => { stopBatch.current = true; }}>
                ⏹ Stop ({batch.done}/{batch.total})
              </button>
            ) : (
              <button
                className="fsb-btn fsb-btn-primary"
                title="Contacte chacun par son canal prioritaire (Telegram auto, sinon Mail/Insta en onglet)"
                onClick={() => void runBatch(filtered.filter((r) => (r.telegram || r.email || r.instagram) && !r.contacted))}
              >
                📨 Contacter tout ({filtered.filter((r) => (r.telegram || r.email || r.instagram) && !r.contacted).length})
              </button>
            )}
            <button className="fsb-icon" title="Rafraîchir" onClick={() => void reload()}>↻</button>
          </div>
        </div>
        <div className="fsb-mini-stats">
          <div className="fsb-mini-stat"><small>Streamers</small><strong>{stats.total}</strong></div>
          <div className="fsb-mini-stat"><small>Live maintenant</small><strong style={{ color: "#fc8181" }}>{stats.live}</strong></div>
          <div className="fsb-mini-stat"><small>Avec contact</small><strong style={{ color: "#34d399" }}>{stats.withContact}</strong></div>
          <div className="fsb-mini-stat"><small>Viewers achetés</small><strong style={{ color: "#fbbf24" }}>{stats.bots}</strong></div>
          <div className="fsb-mini-stat"><small>Contactés</small><strong style={{ color: "#a5b4fc" }}>{stats.contacted}</strong></div>
        </div>
      </section>

      {/* Toolbar : filtres + tri + recherche */}
      <section className="fsb-card">
        <div className="fsb-row">
          <div className="fsb-actions" style={{ flex: 1 }}>
            <div className="fsb-chips">
              {(["all", "UK", "DE", "EN?"] as CountryFilter[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`fsb-chip ${country === c ? "fsb-chip-active" : ""}`}
                  onClick={() => setCountry(c)}
                >
                  {c === "all" ? "Tous pays" : flag(c)}
                </button>
              ))}
            </div>
            <div className="fsb-chips">
              {([["all", "Tout contact"], ["telegram", "Telegram"], ["email", "Mail"], ["discord", "Discord"], ["instagram", "Insta"]] as Array<[ContactFilter, string]>).map(([v, l]) => (
                <button key={v} type="button" className={`fsb-chip ${contactType === v ? "fsb-chip-active" : ""}`} onClick={() => setContactType(v)}>{l}</button>
              ))}
            </div>
            <div className="fsb-chips">
              <button type="button" className={`fsb-chip ${onlyReal ? "fsb-chip-active" : ""}`} onClick={() => setOnlyReal((v) => !v)}>Sans viewers achetés</button>
              <button type="button" className={`fsb-chip ${onlyContact ? "fsb-chip-active" : ""}`} onClick={() => setOnlyContact((v) => !v)}>A un contact</button>
              <button type="button" className={`fsb-chip ${onlyLive ? "fsb-chip-active" : ""}`} onClick={() => setOnlyLive((v) => !v)}>Live</button>
              <button type="button" className={`fsb-chip ${hideContacted ? "fsb-chip-active" : ""}`} onClick={() => setHideContacted((v) => !v)}>Masquer contactés</button>
            </div>
          </div>
          <div className="fsb-actions">
            <div className="fsb-seg">
              <button className={`fsb-seg-btn ${sortKey === "followers" ? "fsb-seg-btn-active" : ""}`} onClick={() => setSortKey("followers")}>Followers</button>
              <button className={`fsb-seg-btn ${sortKey === "viewersAvg" ? "fsb-seg-btn-active" : ""}`} onClick={() => setSortKey("viewersAvg")}>Viewers moy.</button>
              <button className={`fsb-seg-btn ${sortKey === "contact" ? "fsb-seg-btn-active" : ""}`} onClick={() => setSortKey("contact")}>Contact</button>
            </div>
            <div className="fsb-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input className="fsb-input" style={{ width: 200 }} placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      {loading ? (
        <section className="fsb-empty"><h3 style={{ margin: 0 }}>Chargement…</h3></section>
      ) : filtered.length === 0 ? (
        <section className="fsb-empty">
          <h3 style={{ margin: 0 }}>{rows.length === 0 ? "Aucun résultat de scout" : "Aucun streamer ne correspond"}</h3>
          <p className="fsb-copy" style={{ marginTop: 10 }}>
            {rows.length === 0
              ? "Lance le scout (scripts/twitch_casino_scout.mjs) avec le VPN actif — il pousse les résultats ici automatiquement."
              : "Assouplis les filtres."}
          </p>
        </section>
      ) : (
        <section className="fsb-tablewrap">
          <table className="fsb-table">
            <thead>
              <tr>
                <th>Streamer</th>
                <th style={{ width: 90 }}>Pays</th>
                <th style={{ width: 130 }}>Viewers moy.</th>
                <th style={{ width: 110 }}>Followers</th>
                <th style={{ width: 170 }}>Fiabilité</th>
                <th style={{ width: 220 }}>Contact</th>
                <th style={{ width: 130 }}>Vu</th>
                <th style={{ width: 120 }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.login}>
                  <td>
                    <a href={`https://twitch.tv/${r.login}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", fontWeight: 700, textDecoration: "none" }}>
                      {r.name}
                    </a>
                    <div className="fsb-sub">
                      {r.login}{r.partner ? " ✓" : ""}
                      {r.live ? <span style={{ color: "#fc8181", fontWeight: 700 }}> · 🔴 {r.viewers.toLocaleString("fr-FR")}</span> : ""}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{flag(r.country)}</td>
                  <td>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{r.viewersAvg ? r.viewersAvg.toLocaleString("fr-FR") : "—"}</strong>
                    <div className="fsb-sub">{r.viewersPeak ? `pic ${fmt(r.viewersPeak)} · ${r.viewersSamples}×` : ""}</div>
                  </td>
                  <td><strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.followers)}</strong></td>
                  <td>
                    <span style={{ color: verdictColor(r.verdictScore), fontWeight: 700, fontSize: 12 }}>{r.verdictLabel || "—"}</span>
                  </td>
                  <td>
                    <div className="fsb-tags">
                      {CONTACT_META.map((m) => {
                        const val = r[m.key] as string | null;
                        if (!val) return null;
                        return (
                          <a
                            key={m.label}
                            className="fsb-tag"
                            href={m.href(val)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={val}
                            style={{ color: m.color, borderColor: `${m.color}44`, background: `${m.color}14`, textDecoration: "none" }}
                          >
                            {m.label}
                          </a>
                        );
                      })}
                      {!r.hasContact ? <span className="fsb-sub">—</span> : null}
                    </div>
                  </td>
                  <td className="fsb-sub" style={{ whiteSpace: "nowrap" }}>{relDate(r.lastSeen)}<div className="fsb-sub">×{r.seenCount || 1}</div></td>
                  <td>
                    {r.contacted ? (
                      <button className="fsb-tag fsb-tag-done" disabled={busyLogin === r.login} onClick={() => void toggleContacted(r)} title="Cliquer pour annuler" style={{ cursor: "pointer" }}>
                        ✓ {r.contactedChannel === "skipped" ? "Ignoré" : "Contacté"}
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {r.telegram ? (
                          <button className="fsb-btn fsb-btn-primary" disabled={busyLogin === r.login} onClick={() => void handleDmClick(r)} title="Envoie le DM Telegram (bascule Mail/Insta si c'est un canal)" style={{ padding: "6px 12px", fontSize: 12 }}>
                            {busyLogin === r.login ? "envoi…" : "📨 DM Telegram"}
                          </button>
                        ) : null}
                        {r.email ? (
                          <button className="fsb-btn" onClick={() => void sendMail(r)} title="Ouvre la compose Gmail pré-remplie + copie le message" style={{ padding: "6px 12px", fontSize: 12, background: "rgba(240,192,122,.12)", borderColor: "rgba(240,192,122,.32)", color: "#f0c07a" }}>
                            ✉️ Mail
                          </button>
                        ) : null}
                        {r.instagram && !r.telegram && !r.email ? (
                          <button className="fsb-btn" onClick={() => void sendInsta(r)} title="Ouvre la DM Instagram + copie le message" style={{ padding: "6px 12px", fontSize: 12, background: "rgba(242,138,199,.12)", borderColor: "rgba(242,138,199,.32)", color: "#f28ac7" }}>
                            📷 Insta
                          </button>
                        ) : null}
                        <button className="fsb-btn" disabled={busyLogin === r.login} onClick={() => void toggleContacted(r)} style={{ padding: "5px 10px", fontSize: 11 }}>
                          Marquer contacté
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
