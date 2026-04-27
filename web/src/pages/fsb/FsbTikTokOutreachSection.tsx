import * as React from "react";
import {
  cancelRun,
  clearRuns,
  contactTikTokInfluencer,
  deleteRun,
  deleteTikTokInfluencer,
  getActiveRun,
  getRun,
  listRuns,
  listTikTokInfluencers,
  listTikTokMessages,
  logTikTokReply,
  scanTikTokProfile,
  setTikTokInfluencerStatus,
  startDiscoveryRun,
  type TikTokInfluencer,
  type TikTokInfluencerStatus,
  type TikTokOutreachMessage,
  type TikTokOutreachRun,
  type TikTokOutreachStats,
} from "../../lib/api_tiktok_outreach";

const STATUS_LABEL: Record<TikTokInfluencerStatus, string> = {
  new: "À contacter",
  no_email: "Sans email",
  queued: "En attente",
  contacted: "Contacté",
  replied: "A répondu",
  interested: "Intéressé",
  declined: "Refusé",
  blacklisted: "Blacklist",
};

const STATUS_COLOR: Record<TikTokInfluencerStatus, string> = {
  new: "#22d3ee",
  no_email: "#94a3b8",
  queued: "#a5b4fc",
  contacted: "#f59e0b",
  replied: "#a855f7",
  interested: "#10b981",
  declined: "#f04e4e",
  blacklisted: "#475569",
};

const FILTERS: Array<{ value: TikTokInfluencerStatus | "all"; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "new", label: "À contacter" },
  { value: "contacted", label: "Contactés" },
  { value: "replied", label: "Réponses" },
  { value: "interested", label: "Intéressés" },
  { value: "declined", label: "Refusés" },
  { value: "no_email", label: "Sans email" },
];

const SECTION_CSS = `
.tk{display:flex;flex-direction:column;gap:18px}
.tk-hero{
  display:grid;grid-template-columns:1.4fr 1fr;gap:18px;
}
@media (max-width:980px){.tk-hero{grid-template-columns:1fr}}
.tk-hero-card{
  border:1px solid var(--bd);border-radius:20px;padding:22px;
  background:
    radial-gradient(ellipse 100% 60% at 0% 0%,rgba(255,0,80,.10),transparent 60%),
    radial-gradient(ellipse 100% 60% at 100% 100%,rgba(0,242,234,.10),transparent 60%),
    linear-gradient(160deg,rgba(255,255,255,.028) 0%,transparent 60%),var(--panel);
  box-shadow:0 2px 18px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.05);
}
.tk-hero-title{margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.04em}
.tk-hero-sub{color:var(--muted);font-size:13px;line-height:1.55;margin:0 0 14px}
.tk-form{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}
.tk-input{
  flex:1;min-width:240px;border-radius:12px;border:1px solid var(--bd);
  background:var(--surface);color:var(--text);font:inherit;font-size:14px;padding:12px 14px;outline:none;
  transition:border-color .15s,box-shadow .15s;
}
.tk-input:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.tk-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}
.tk-stat{
  border:1px solid var(--bd);border-radius:14px;background:var(--surface);padding:13px 14px;
  position:relative;overflow:hidden;
}
.tk-stat::before{content:'';position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,#ff0050,#00f2ea);border-radius:14px 14px 0 0}
.tk-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800}
.tk-stat strong{display:block;margin-top:8px;font-size:24px;font-weight:800;letter-spacing:-.04em;line-height:1}
.tk-filterbar{display:flex;gap:6px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--bd);border-radius:14px;padding:5px}
.tk-filter{
  border-radius:10px;border:1px solid transparent;font:inherit;font-size:12px;font-weight:700;
  background:transparent;color:var(--muted);cursor:pointer;padding:7px 13px;letter-spacing:.01em;
  transition:color .15s,background .15s;
}
.tk-filter:hover{color:var(--text);background:rgba(255,255,255,.05)}
.tk-filter-active{
  background:linear-gradient(135deg,#ff0050 0%,#a855f7 100%);
  color:#fff !important;box-shadow:0 4px 18px rgba(255,0,80,.32);
}
.tk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.tk-card{
  border:1px solid var(--bd);border-radius:18px;padding:16px;background:var(--panel);
  display:flex;flex-direction:column;gap:12px;transition:border-color .15s,transform .15s;
  position:relative;overflow:hidden;
}
.tk-card:hover{border-color:var(--bd-s);transform:translateY(-2px)}
.tk-card-head{display:flex;gap:12px;align-items:center}
.tk-avatar{
  width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#ff0050,#00f2ea);
  display:grid;place-items:center;font-weight:800;color:#fff;font-size:18px;flex-shrink:0;
  overflow:hidden;
}
.tk-avatar img{width:100%;height:100%;object-fit:cover}
.tk-card-name{font-weight:800;font-size:15px;letter-spacing:-.01em;line-height:1.2}
.tk-card-handle{color:var(--muted);font-size:12px;margin-top:2px;display:block}
.tk-card-handle a{color:inherit;text-decoration:none}
.tk-card-handle a:hover{color:var(--cyan)}
.tk-status-dot{
  display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;
  padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.08);text-transform:uppercase;letter-spacing:.04em;
}
.tk-status-dot::before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}
.tk-card-stats{
  display:grid;grid-template-columns:repeat(3,1fr);gap:8px;
  padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.025);
  border:1px solid rgba(255,255,255,.04);
}
.tk-card-stat{font-size:11px;color:var(--muted);text-align:center}
.tk-card-stat strong{display:block;color:var(--text);font-size:14px;margin-bottom:2px}
.tk-card-bio{
  color:var(--muted);font-size:12px;line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
  min-height:54px;
}
.tk-card-email{
  display:flex;gap:8px;align-items:center;padding:9px 12px;border-radius:11px;
  background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.22);
  font-size:12px;font-weight:700;color:#34d399;word-break:break-all;
}
.tk-card-email-empty{
  background:rgba(148,163,184,.06);border-color:rgba(148,163,184,.15);color:var(--muted);
}
.tk-card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
.tk-card-actions .fsb-btn{flex:1;min-width:90px;padding:8px 12px;font-size:12px}
.tk-empty{
  text-align:center;padding:60px 30px;border:1px dashed var(--bd);border-radius:18px;
  color:var(--muted);background:var(--panel);
}
.tk-empty strong{display:block;color:var(--text);font-size:16px;margin-bottom:6px}
.tk-warn{
  padding:11px 14px;border-radius:12px;
  background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.28);
  color:#fbbf24;font-size:12.5px;
}
.tk-modal-back{
  position:fixed;inset:0;background:rgba(4,8,24,.82);backdrop-filter:blur(14px);
  display:grid;place-items:center;padding:16px;z-index:120;
}
.tk-modal{
  width:min(640px,100%);max-height:88vh;overflow:auto;padding:24px;
  border:1px solid var(--bd-s);border-radius:20px;
  background:linear-gradient(160deg,rgba(255,0,80,.06) 0%,transparent 50%),var(--panel);
  box-shadow:0 40px 100px rgba(0,0,0,.65);
}
.tk-modal h3{margin:0 0 6px;font-size:18px;font-weight:800;letter-spacing:-.02em}
.tk-modal-sub{color:var(--muted);font-size:13px;margin:0 0 16px}
.tk-textarea{
  width:100%;box-sizing:border-box;border-radius:11px;border:1px solid var(--bd);
  background:var(--surface);color:var(--text);font:inherit;font-size:13px;padding:12px 14px;
  min-height:180px;resize:vertical;outline:none;
}
.tk-textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.tk-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}
.tk-msg{
  padding:11px 13px;border-radius:11px;border:1px solid var(--bd);background:rgba(255,255,255,.025);
  font-size:12.5px;line-height:1.55;
}
.tk-msg-out{border-color:rgba(99,102,241,.28);background:rgba(99,102,241,.06)}
.tk-msg-in{border-color:rgba(16,185,129,.28);background:rgba(16,185,129,.06)}
.tk-msg-meta{font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;font-weight:800}
.tk-spin{
  display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.18);
  border-top-color:#fff;border-radius:50%;animation:tk-spin .7s linear infinite;
}
@keyframes tk-spin{to{transform:rotate(360deg)}}

.tk-discovery{
  border:1px solid var(--bd);border-radius:20px;padding:22px;
  background:
    radial-gradient(ellipse 80% 60% at 100% 0%,rgba(168,85,247,.10),transparent 60%),
    radial-gradient(ellipse 80% 60% at 0% 100%,rgba(34,211,238,.08),transparent 60%),
    linear-gradient(160deg,rgba(255,255,255,.028) 0%,transparent 60%),var(--panel);
  box-shadow:0 2px 18px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.05);
}
.tk-disc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px}
.tk-disc-field{display:grid;gap:6px}
.tk-disc-field label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800}
.tk-chips{display:flex;gap:6px;flex-wrap:wrap;padding:8px;border:1px solid var(--bd);background:var(--surface);border-radius:11px;min-height:42px;align-items:center}
.tk-chips input{background:transparent;border:none;outline:none;color:var(--text);font:inherit;font-size:13px;flex:1;min-width:120px;padding:4px}
.tk-chip{
  display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
  background:linear-gradient(135deg,rgba(255,0,80,.18),rgba(168,85,247,.18));
  border:1px solid rgba(168,85,247,.32);font-size:12px;font-weight:700;color:#fff;
}
.tk-chip button{background:transparent;border:none;color:rgba(255,255,255,.7);cursor:pointer;padding:0;font-size:14px;line-height:1}
.tk-chip button:hover{color:#fff}
.tk-disc-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center}
.tk-progress{
  margin-top:14px;padding:14px 16px;border-radius:14px;border:1px solid rgba(168,85,247,.28);
  background:rgba(168,85,247,.06);
}
.tk-progress-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;font-weight:700}
.tk-progbar{
  margin-top:10px;height:8px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden;
}
.tk-progbar-fill{
  height:100%;background:linear-gradient(90deg,#ff0050,#a855f7,#00f2ea);
  transition:width .4s ease;border-radius:4px;
}
.tk-progress-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
.tk-progress-stat{font-size:11px;color:var(--muted);text-align:center}
.tk-progress-stat strong{display:block;color:var(--text);font-size:18px;font-weight:800;margin-bottom:2px}
.tk-runs{display:grid;gap:8px;margin-top:14px}
.tk-run{
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:11px 14px;border-radius:12px;border:1px solid var(--bd);background:rgba(255,255,255,.02);
}
.tk-run-meta{font-size:12px;color:var(--muted)}
.tk-run-status{
  display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;
  padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;
}
.tk-run-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.tk-run-done{background:rgba(16,185,129,.1);color:#34d399;border:1px solid rgba(16,185,129,.22)}
.tk-run-running{background:rgba(99,102,241,.1);color:#a5b4fc;border:1px solid rgba(99,102,241,.22)}
.tk-run-error{background:rgba(240,78,78,.1);color:#fc8181;border:1px solid rgba(240,78,78,.22)}
.tk-run-canceled{background:rgba(148,163,184,.08);color:var(--muted);border:1px solid var(--bd)}
.tk-num-input{
  width:90px;border-radius:10px;border:1px solid var(--bd);background:var(--surface);
  color:var(--text);font:inherit;font-size:13px;padding:8px 10px;outline:none;
}
.tk-num-input:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.tk-disc-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.tk-disc-row label{font-size:13px;color:var(--text);font-weight:600;display:flex;gap:8px;align-items:center}
`;

function fmtCount(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const j = Math.round(h / 24);
  if (j < 30) return `il y a ${j}j`;
  return d.toLocaleDateString("fr-FR");
}

const DEFAULT_HASHTAGS = ["casinofr", "casinofrancais", "casinoenligne", "paris_sportifs", "joueurfrancais"];
const COUNTRY_CHOICES = ["FR", "BE", "CH", "MC", "CA", "LU"];

const DEFAULT_BODY = `Salut {{name}},

Je découvre ton compte TikTok et j'aime beaucoup ce que tu fais.

Je m'occupe de LunaLive, une plateforme française autour du streaming et des casinos en ligne. On cherche des créateurs comme toi pour collaborer sur une landing page dédiée (avec ton lien d'affiliation, tes conditions, et un suivi des perfs).

Si l'idée t'intéresse, réponds simplement à ce mail, je t'envoie tous les détails du deal.

À très vite,
L'équipe LunaLive
https://lunalive.win`;

export function FsbTikTokOutreachSection() {
  const [influencers, setInfluencers] = React.useState<TikTokInfluencer[]>([]);
  const [stats, setStats] = React.useState<TikTokOutreachStats | null>(null);
  const [mailReady, setMailReady] = React.useState<boolean>(true);
  const [filter, setFilter] = React.useState<TikTokInfluencerStatus | "all">("all");
  const [scanInput, setScanInput] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [scanFlash, setScanFlash] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [contactTarget, setContactTarget] = React.useState<TikTokInfluencer | null>(null);
  const [contactBody, setContactBody] = React.useState(DEFAULT_BODY);
  const [contactSubject, setContactSubject] = React.useState("Collab LunaLive — landing page casino");
  const [contactSending, setContactSending] = React.useState(false);
  const [contactError, setContactError] = React.useState<string | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<TikTokInfluencer | null>(null);
  const [detailMessages, setDetailMessages] = React.useState<TikTokOutreachMessage[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");

  // Discovery state
  const [discHashtags, setDiscHashtags] = React.useState<string[]>(DEFAULT_HASHTAGS);
  const [discHashtagInput, setDiscHashtagInput] = React.useState("");
  const [discMinFollowers, setDiscMinFollowers] = React.useState(20000);
  const [discMaxFollowers, setDiscMaxFollowers] = React.useState(500000);
  const [discCountries, setDiscCountries] = React.useState<string[]>(["FR"]);
  const [discRequireEmail, setDiscRequireEmail] = React.useState(true);
  const [discMaxProfiles, setDiscMaxProfiles] = React.useState(30);
  const [discError, setDiscError] = React.useState<string | null>(null);
  const [activeRun, setActiveRun] = React.useState<TikTokOutreachRun | null>(null);
  const [pastRuns, setPastRuns] = React.useState<TikTokOutreachRun[]>([]);

  const reload = React.useCallback(
    async (which: TikTokInfluencerStatus | "all" = filter) => {
      setLoading(true);
      try {
        const res = await listTikTokInfluencers(which);
        setInfluencers(res.influencers);
        setStats(res.stats);
        setMailReady(res.mailReady);
      } catch (err: any) {
        setScanError(`Chargement: ${err?.message || err}`);
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  React.useEffect(() => {
    reload(filter);
  }, [filter, reload]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim() || scanning) return;
    setScanning(true);
    setScanError(null);
    setScanFlash(null);
    try {
      const res = await scanTikTokProfile(scanInput.trim());
      setScanInput("");
      setScanFlash(
        res.influencer.email
          ? `✅ @${res.influencer.handle} ajouté avec email`
          : `⚠️ @${res.influencer.handle} ajouté — aucune email publique trouvée`
      );
      await reload(filter);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const friendly =
        msg === "profile_unreachable"
          ? "Profil introuvable ou bloqué par TikTok"
          : msg === "invalid_handle"
          ? "Handle/URL invalide (ex: @kasinoze ou https://www.tiktok.com/@kasinoze)"
          : msg;
      setScanError(friendly);
    } finally {
      setScanning(false);
    }
  };

  const openContact = (inf: TikTokInfluencer) => {
    setContactTarget(inf);
    setContactBody(DEFAULT_BODY);
    setContactSubject("Collab LunaLive — landing page casino");
    setContactError(null);
  };

  const sendContact = async () => {
    if (!contactTarget || contactSending) return;
    setContactSending(true);
    setContactError(null);
    try {
      await contactTikTokInfluencer(contactTarget.id, {
        subject: contactSubject,
        body: contactBody,
      });
      setContactTarget(null);
      await reload(filter);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const friendly =
        msg === "mail_not_configured"
          ? "Mailer non configuré côté API (Brevo/SMTP manquant)"
          : msg === "no_email"
          ? "Cet influenceur n'a pas d'email enregistré"
          : msg;
      setContactError(friendly);
    } finally {
      setContactSending(false);
    }
  };

  const onChangeStatus = async (inf: TikTokInfluencer, status: TikTokInfluencerStatus) => {
    try {
      await setTikTokInfluencerStatus(inf.id, status);
      await reload(filter);
    } catch (err: any) {
      window.alert(`Statut: ${err?.message || err}`);
    }
  };

  const onDelete = async (inf: TikTokInfluencer) => {
    if (!window.confirm(`Supprimer @${inf.handle} ?`)) return;
    try {
      await deleteTikTokInfluencer(inf.id);
      await reload(filter);
    } catch (err: any) {
      window.alert(`Suppression: ${err?.message || err}`);
    }
  };

  const openDetail = async (inf: TikTokInfluencer) => {
    setDetailTarget(inf);
    setReplyText("");
    setDetailLoading(true);
    setDetailMessages([]);
    try {
      const res = await listTikTokMessages(inf.id);
      setDetailMessages(res.messages);
    } catch {
      // silent
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Discovery effects ────────────────────────────────────────────────
  const reloadRuns = React.useCallback(async () => {
    try {
      const res = await listRuns();
      setPastRuns(res.runs);
    } catch {}
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getActiveRun();
        if (!cancelled) setActiveRun(res.run);
      } catch {}
      reloadRuns();
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadRuns]);

  React.useEffect(() => {
    if (!activeRun || activeRun.status !== "running") return;
    const interval = setInterval(async () => {
      try {
        const res = await getRun(activeRun.id);
        setActiveRun(res.run);
        if (res.run.status !== "running") {
          await reload(filter);
          await reloadRuns();
        }
      } catch {}
    }, 1500);
    return () => clearInterval(interval);
  }, [activeRun, filter, reload, reloadRuns]);

  const addHashtag = (raw: string) => {
    const cleaned = raw.trim().replace(/^#+/, "").toLowerCase();
    if (!cleaned || !/^[a-z0-9_]{1,40}$/i.test(cleaned)) return;
    if (discHashtags.includes(cleaned)) return;
    setDiscHashtags([...discHashtags, cleaned]);
  };

  const handleHashtagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addHashtag(discHashtagInput);
      setDiscHashtagInput("");
    } else if (e.key === "Backspace" && !discHashtagInput && discHashtags.length) {
      setDiscHashtags(discHashtags.slice(0, -1));
    }
  };

  const toggleCountry = (code: string) => {
    setDiscCountries((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    );
  };

  const launchDiscovery = async () => {
    if (discHashtags.length === 0) {
      setDiscError("Ajoute au moins un hashtag");
      return;
    }
    setDiscError(null);
    try {
      const res = await startDiscoveryRun({
        hashtags: discHashtags,
        minFollowers: discMinFollowers,
        maxFollowers: discMaxFollowers,
        countries: discCountries,
        requireEmail: discRequireEmail,
        maxProfiles: discMaxProfiles,
      });
      const run = await getRun(res.runId);
      setActiveRun(run.run);
      await reloadRuns();
    } catch (err: any) {
      const msg = String(err?.message || err);
      setDiscError(
        msg === "run_already_active"
          ? "Une récolte est déjà en cours"
          : msg
      );
    }
  };

  const stopDiscovery = async () => {
    if (!activeRun) return;
    try {
      await cancelRun(activeRun.id);
      const updated = await getRun(activeRun.id);
      setActiveRun(updated.run);
      await reloadRuns();
    } catch (err: any) {
      window.alert(`Annulation: ${err?.message || err}`);
    }
  };

  const submitReply = async (interested: boolean) => {
    if (!detailTarget || !replyText.trim()) return;
    try {
      await logTikTokReply(detailTarget.id, replyText.trim(), interested);
      setDetailTarget(null);
      await reload(filter);
    } catch (err: any) {
      window.alert(`Réponse: ${err?.message || err}`);
    }
  };

  return (
    <section className="tk">
      <style>{SECTION_CSS}</style>

      <div className="tk-hero">
        <div className="tk-hero-card">
          <h2 className="tk-hero-title">🎯 Démarchage TikTok</h2>
          <p className="tk-hero-sub">
            Scanne un profil TikTok par handle ou URL. On extrait automatiquement les infos publiques
            et l'email business si présent dans la bio. Pas d'email visible → on passe au suivant.
          </p>
          <form className="tk-form" onSubmit={handleScan}>
            <input
              className="tk-input"
              placeholder="@kasinoze   ou   https://www.tiktok.com/@kasinoze"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              disabled={scanning}
            />
            <button
              type="submit"
              className="fsb-btn fsb-btn-primary"
              disabled={scanning || !scanInput.trim()}
            >
              {scanning ? <span className="tk-spin" /> : "🔍 Scanner"}
            </button>
          </form>
          {scanError ? (
            <div className="fsb-alert" style={{ marginTop: 12 }}>{scanError}</div>
          ) : null}
          {scanFlash ? (
            <div className="tk-warn" style={{ marginTop: 12 }}>{scanFlash}</div>
          ) : null}
          {!mailReady ? (
            <div className="tk-warn" style={{ marginTop: 12 }}>
              ⚠️ Mailer non configuré côté API (BREVO_API_KEY ou SMTP_*). Le scan + le suivi
              fonctionnent, mais l'envoi d'emails est désactivé.
            </div>
          ) : null}
        </div>

        <div className="tk-hero-card">
          <div className="tk-stats">
            <div className="tk-stat">
              <small>Total</small>
              <strong>{stats?.total ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Avec email</small>
              <strong>{stats?.withEmail ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Contactés</small>
              <strong>{stats?.contacted ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Réponses</small>
              <strong>{stats?.replied ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Intéressés</small>
              <strong style={{ color: "#34d399" }}>{stats?.interested ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Refus</small>
              <strong style={{ color: "#fc8181" }}>{stats?.declined ?? "—"}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="tk-discovery">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
              🤖 Récolte automatique
            </h3>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              Scanne des hashtags TikTok, filtre par critères (FR uniquement par défaut) et ajoute
              les profils correspondants à la liste.
            </p>
          </div>
        </div>

        <div className="tk-disc-grid">
          <div className="tk-disc-field" style={{ gridColumn: "1 / -1" }}>
            <label>Hashtags TikTok (sans #)</label>
            <div className="tk-chips">
              {discHashtags.map((h) => (
                <span key={h} className="tk-chip">
                  #{h}
                  <button onClick={() => setDiscHashtags(discHashtags.filter((x) => x !== h))}>
                    ×
                  </button>
                </span>
              ))}
              <input
                placeholder={discHashtags.length ? "Ajouter..." : "casinofr, casinoenligne..."}
                value={discHashtagInput}
                onChange={(e) => setDiscHashtagInput(e.target.value)}
                onKeyDown={handleHashtagKey}
                onBlur={() => {
                  if (discHashtagInput.trim()) {
                    addHashtag(discHashtagInput);
                    setDiscHashtagInput("");
                  }
                }}
              />
            </div>
          </div>

          <div className="tk-disc-field">
            <label>Followers min</label>
            <input
              type="number"
              className="tk-num-input"
              style={{ width: "100%" }}
              value={discMinFollowers}
              onChange={(e) => setDiscMinFollowers(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className="tk-disc-field">
            <label>Followers max</label>
            <input
              type="number"
              className="tk-num-input"
              style={{ width: "100%" }}
              value={discMaxFollowers}
              onChange={(e) => setDiscMaxFollowers(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className="tk-disc-field">
            <label>Profils max par run</label>
            <input
              type="number"
              className="tk-num-input"
              style={{ width: "100%" }}
              min={1}
              max={60}
              value={discMaxProfiles}
              onChange={(e) => setDiscMaxProfiles(Math.max(1, Math.min(60, Number(e.target.value) || 30)))}
            />
          </div>

          <div className="tk-disc-field" style={{ gridColumn: "1 / -1" }}>
            <label>Pays (TikTok region)</label>
            <div className="tk-disc-row">
              {COUNTRY_CHOICES.map((code) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    checked={discCountries.includes(code)}
                    onChange={() => toggleCountry(code)}
                  />
                  {code}
                </label>
              ))}
            </div>
          </div>

          <div className="tk-disc-field" style={{ gridColumn: "1 / -1" }}>
            <label>Options</label>
            <div className="tk-disc-row">
              <label>
                <input
                  type="checkbox"
                  checked={discRequireEmail}
                  onChange={(e) => setDiscRequireEmail(e.target.checked)}
                />
                Ne garder que les profils avec email
              </label>
            </div>
          </div>
        </div>

        <div className="tk-disc-actions">
          <button
            className="fsb-btn fsb-btn-primary"
            onClick={launchDiscovery}
            disabled={!!activeRun && activeRun.status === "running"}
          >
            {activeRun?.status === "running" ? <span className="tk-spin" /> : "🚀 Lancer la récolte"}
          </button>
          {activeRun?.status === "running" ? (
            <button className="fsb-btn" onClick={stopDiscovery}>
              ⏹ Arrêter
            </button>
          ) : null}
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            ~{Math.ceil((discMaxProfiles * 0.7 + discHashtags.length * 0.9) / 6) * 10}s estimés
          </span>
        </div>

        {discError ? <div className="fsb-alert" style={{ marginTop: 12 }}>{discError}</div> : null}

        {activeRun ? (
          <div className="tk-progress">
            <div className="tk-progress-head">
              <div>
                <span
                  className={`tk-run-status tk-run-${activeRun.status}`}
                  style={{ marginRight: 8 }}
                >
                  {activeRun.status === "running"
                    ? "En cours"
                    : activeRun.status === "done"
                    ? "Terminé"
                    : activeRun.status === "error"
                    ? "Erreur"
                    : "Annulé"}
                </span>
                {activeRun.message || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {fmtRelative(activeRun.startedAt)}
              </div>
            </div>
            <div className="tk-progbar">
              <div
                className="tk-progbar-fill"
                style={{
                  width: `${
                    activeRun.candidatesCount
                      ? Math.min(
                          100,
                          (activeRun.scannedCount /
                            Math.max(
                              1,
                              Math.min(
                                activeRun.criteria?.maxProfiles || 30,
                                activeRun.candidatesCount
                              )
                            )) *
                            100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="tk-progress-stats">
              <div className="tk-progress-stat">
                <strong>{activeRun.candidatesCount}</strong>candidats
              </div>
              <div className="tk-progress-stat">
                <strong>{activeRun.scannedCount}</strong>scannés
              </div>
              <div className="tk-progress-stat">
                <strong style={{ color: "#34d399" }}>{activeRun.keptCount}</strong>gardés
              </div>
              <div className="tk-progress-stat">
                <strong style={{ color: "#fc8181" }}>{activeRun.droppedCount}</strong>rejetés
              </div>
            </div>

            {activeRun.log && activeRun.log.length > 0 ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                  📋 Voir le log diagnostic ({activeRun.log.length})
                </summary>
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    background: "rgba(0,0,0,.25)",
                    borderRadius: 10,
                    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                    fontSize: 11,
                    lineHeight: 1.5,
                    maxHeight: 280,
                    overflow: "auto",
                    border: "1px solid var(--bd)",
                  }}
                >
                  {activeRun.log.map((entry, i) => (
                    <div key={i} style={{ color: entry.reason.includes("blocked") || entry.reason.includes("unreachable") ? "#fc8181" : entry.reason.includes("kept") ? "#34d399" : "var(--muted)" }}>
                      {entry.tag ? `#${entry.tag} ` : ""}
                      {entry.query ? `?${entry.query} ` : ""}
                      {entry.handle ? `@${entry.handle} ` : ""}
                      → {entry.reason}
                      {entry.followers != null ? ` · ${entry.followers} followers` : ""}
                      {entry.country ? ` · ${entry.country}` : ""}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {pastRuns.length > 0 ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
                Historique des runs
              </div>
              <button
                className="fsb-btn"
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={async () => {
                  if (!window.confirm("Effacer tout l'historique des runs ? (les runs en cours sont préservés)")) return;
                  try {
                    await clearRuns();
                    await reloadRuns();
                  } catch (err: any) {
                    window.alert(`Erreur: ${err?.message || err}`);
                  }
                }}
              >
                🗑 Tout effacer
              </button>
            </div>
            <div className="tk-runs">
              {pastRuns
                .filter((r) => !activeRun || r.id !== activeRun.id)
                .map((run) => (
                  <div key={run.id} className="tk-run">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {(run.criteria?.hashtags || []).map((h) => `#${h}`).join(" · ") || "—"}
                      </div>
                      <div className="tk-run-meta">
                        {fmtRelative(run.startedAt)} · {run.keptCount} gardé(s) /{" "}
                        {run.scannedCount} scanné(s) · {run.candidatesCount} candidat(s)
                      </div>
                    </div>
                    <span className={`tk-run-status tk-run-${run.status}`}>
                      {run.status === "done"
                        ? "Terminé"
                        : run.status === "running"
                        ? "En cours"
                        : run.status === "error"
                        ? "Erreur"
                        : "Annulé"}
                    </span>
                    {run.status !== "running" ? (
                      <button
                        className="fsb-btn"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        title="Supprimer ce run"
                        onClick={async () => {
                          try {
                            await deleteRun(run.id);
                            await reloadRuns();
                          } catch (err: any) {
                            window.alert(`Erreur: ${err?.message || err}`);
                          }
                        }}
                      >
                        🗑
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="tk-filterbar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`tk-filter ${filter === f.value ? "tk-filter-active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="tk-empty">
          <span className="tk-spin" /> Chargement…
        </div>
      ) : influencers.length === 0 ? (
        <div className="tk-empty">
          <strong>Aucun influenceur dans cette vue</strong>
          Scanne un premier profil pour démarrer.
        </div>
      ) : (
        <div className="tk-grid">
          {influencers.map((inf) => {
            const initials = (inf.displayName || inf.handle || "?").slice(0, 2).toUpperCase();
            const status = inf.status as TikTokInfluencerStatus;
            return (
              <div key={inf.id} className="tk-card">
                <div className="tk-card-head">
                  <div className="tk-avatar">
                    {inf.avatarUrl ? <img src={inf.avatarUrl} alt={inf.handle} /> : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tk-card-name" title={inf.displayName || inf.handle}>
                      {inf.displayName || `@${inf.handle}`}
                      {inf.verified ? " ✓" : ""}
                    </div>
                    <span className="tk-card-handle">
                      <a href={inf.profileUrl} target="_blank" rel="noreferrer">
                        @{inf.handle}
                      </a>
                      {inf.country ? ` · ${inf.country}` : ""}
                    </span>
                  </div>
                  <span
                    className="tk-status-dot"
                    style={{ color: STATUS_COLOR[status] }}
                    title={STATUS_LABEL[status]}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </div>

                <div className="tk-card-stats">
                  <div className="tk-card-stat">
                    <strong>{fmtCount(inf.followerCount)}</strong>followers
                  </div>
                  <div className="tk-card-stat">
                    <strong>{fmtCount(inf.heartCount)}</strong>likes
                  </div>
                  <div className="tk-card-stat">
                    <strong>{fmtCount(inf.videoCount)}</strong>vidéos
                  </div>
                </div>

                <div className="tk-card-bio">{inf.bio || "Pas de bio publique."}</div>

                <div className={`tk-card-email ${inf.email ? "" : "tk-card-email-empty"}`}>
                  {inf.email ? `📧 ${inf.email}` : "✗ Aucun email public"}
                </div>

                {inf.lastEmailSentAt ? (
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Dernier envoi: {fmtRelative(inf.lastEmailSentAt)}
                  </div>
                ) : null}

                <div className="tk-card-actions">
                  {inf.email && (status === "new" || status === "queued") ? (
                    <button
                      className="fsb-btn fsb-btn-primary"
                      onClick={() => openContact(inf)}
                      disabled={!mailReady}
                    >
                      📤 Contacter
                    </button>
                  ) : null}
                  {status === "contacted" ? (
                    <button className="fsb-btn" onClick={() => openDetail(inf)}>
                      💬 Voir / Réponse
                    </button>
                  ) : null}
                  {(status === "replied" || status === "interested" || status === "declined") ? (
                    <button className="fsb-btn" onClick={() => openDetail(inf)}>
                      💬 Historique
                    </button>
                  ) : null}
                  {status !== "blacklisted" ? (
                    <button
                      className="fsb-btn"
                      onClick={() => onChangeStatus(inf, "blacklisted")}
                      title="Blacklister"
                    >
                      🚫
                    </button>
                  ) : (
                    <button
                      className="fsb-btn"
                      onClick={() => onChangeStatus(inf, "new")}
                    >
                      Réactiver
                    </button>
                  )}
                  <button className="fsb-btn" onClick={() => onDelete(inf)} title="Supprimer">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contactTarget ? (
        <div className="tk-modal-back" onClick={() => !contactSending && setContactTarget(null)}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Contacter @{contactTarget.handle}</h3>
            <p className="tk-modal-sub">
              Envoi à <strong>{contactTarget.email}</strong>. Variables disponibles : {"{{name}}"}, {"{{handle}}"}.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="fsb-field" style={{ display: "block" }}>
                  <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>
                    Sujet
                  </span>
                  <input
                    className="tk-input"
                    style={{ marginTop: 6 }}
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>
                    Corps du mail
                  </span>
                  <textarea
                    className="tk-textarea"
                    style={{ marginTop: 6 }}
                    value={contactBody}
                    onChange={(e) => setContactBody(e.target.value)}
                  />
                </label>
              </div>
            </div>
            {contactError ? <div className="fsb-alert" style={{ marginTop: 12 }}>{contactError}</div> : null}
            <div className="tk-modal-actions">
              <button
                className="fsb-btn"
                onClick={() => setContactTarget(null)}
                disabled={contactSending}
              >
                Annuler
              </button>
              <button
                className="fsb-btn fsb-btn-primary"
                onClick={sendContact}
                disabled={contactSending}
              >
                {contactSending ? <span className="tk-spin" /> : "📤 Envoyer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailTarget ? (
        <div className="tk-modal-back" onClick={() => setDetailTarget(null)}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>@{detailTarget.handle}</h3>
            <p className="tk-modal-sub">
              {detailTarget.email || "Pas d'email"} · Statut : {STATUS_LABEL[detailTarget.status]}
            </p>

            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {detailLoading ? (
                <div className="tk-msg"><span className="tk-spin" /> Chargement…</div>
              ) : detailMessages.length === 0 ? (
                <div className="tk-msg">Aucun message échangé.</div>
              ) : (
                detailMessages.map((msg) => (
                  <div key={msg.id} className={`tk-msg ${msg.direction === "out" ? "tk-msg-out" : "tk-msg-in"}`}>
                    <div className="tk-msg-meta">
                      {msg.direction === "out" ? "→ Envoyé" : "← Reçu"} · {fmtRelative(msg.sentAt)}
                      {msg.subject ? ` · ${msg.subject}` : ""}
                      {!msg.success ? " · échec" : ""}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
                    {msg.errorMessage ? (
                      <div style={{ color: "#fc8181", marginTop: 6 }}>{msg.errorMessage}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, letterSpacing: "-.01em" }}>
              Logger une réponse manuellement
            </h4>
            <textarea
              className="tk-textarea"
              style={{ minHeight: 100 }}
              placeholder="Colle ici la réponse reçue par mail…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
            <div className="tk-modal-actions">
              <button className="fsb-btn" onClick={() => setDetailTarget(null)}>
                Fermer
              </button>
              <button
                className="fsb-btn"
                onClick={() => submitReply(false)}
                disabled={!replyText.trim()}
              >
                Pas intéressé
              </button>
              <button
                className="fsb-btn fsb-btn-primary"
                onClick={() => submitReply(true)}
                disabled={!replyText.trim()}
              >
                ✓ Intéressé
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
