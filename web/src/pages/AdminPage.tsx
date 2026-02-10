// web/src/pages/AdminPage.tsx
import * as React from "react";
import {
  adminListRequests,
  adminApproveRequest,
  adminRejectRequest,
  adminCreateStreamer,
  adminDeleteStreamer,
  getStreamers,
  adminSlotsUpdate,
  type AdminSlotsUpdateResp,

  // ✅ casino comments moderation
  adminListCasinoComments,
  adminApproveCasinoComment,
  adminRejectCasinoComment,
  type AdminCasinoCommentRow,
  adminListPendingRegistrations,
  adminReferralsSummary,
  adminListReferrals,
  type AdminPendingRegistrationRow,
  type AdminReferralRow,
  type AdminReferralSummary,
  // ✅ content (HTML)
  adminListContent,
  adminGetContent,
  adminUpsertContent,
  adminDeleteContent,
} from "../lib/api";

import { UsersAdminSection } from "../components/admin/UsersAdminSection";
import { ProviderAccountsAdminSection } from "../components/admin/ProviderAccountsAdminSection";
import { CasinosAdminSection } from "../components/admin/CasinosAdminSection";
import { Link } from "react-router-dom";
import { EmotesAdminSection } from "../components/admin/EmotesAdminSection";
import { ReportsAdminSection } from "../components/admin/ReportsAdminSection";
import { SubscriptionsAdminSection } from "../components/admin/SubscriptionsAdminSection";


const SS_KEY = "lunalive_admin_key_v1";
const SS_TAB = "lunalive_admin_tab_v1";

function loadAdminKey() {
  try {
    return sessionStorage.getItem(SS_KEY) || "";
  } catch {
    return "";
  }
}
function saveAdminKey(k: string) {
  try {
    sessionStorage.setItem(SS_KEY, k);
  } catch {}
}
function clearAdminKey() {
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch {}
}

function loadTab() {
  try {
    return sessionStorage.getItem(SS_TAB) || "overview";
  } catch {
    return "overview";
  }
}
function saveTab(tab: string) {
  try {
    sessionStorage.setItem(SS_TAB, tab);
  } catch {}
}

function absApiUrl(u: string | null) {
  const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${BASE}${u}`;
  return `${BASE}/${u}`;
}

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info" | "brand";
}) {
  const bg =
    tone === "good"
      ? "rgba(34,197,94,0.14)"
      : tone === "warn"
      ? "rgba(245,158,11,0.14)"
      : tone === "bad"
      ? "rgba(239,68,68,0.14)"
      : tone === "info"
      ? "rgba(56,189,248,0.14)"
      : tone === "brand"
      ? "rgba(167,139,250,0.16)"
      : "rgba(255,255,255,0.08)";

  const border =
    tone === "good"
      ? "rgba(34,197,94,0.30)"
      : tone === "warn"
      ? "rgba(245,158,11,0.30)"
      : tone === "bad"
      ? "rgba(239,68,68,0.30)"
      : tone === "info"
      ? "rgba(56,189,248,0.30)"
      : tone === "brand"
      ? "rgba(167,139,250,0.32)"
      : "rgba(255,255,255,0.12)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
  style,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="panel"
      style={{
        marginTop: 0,
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 40%, rgba(255,255,255,0.02) 100%)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
        ...style,
      }}
    >
      <div
        style={{
          padding: "14px 14px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div>
          {subtitle ? (
            <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.9 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {right ? <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{right}</div> : null}
      </div>

      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  hint,
  badge,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  hint?: string;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("btnSecondary")}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 10px",
        borderRadius: 14,
        border: active ? "1px solid rgba(167,139,250,0.55)" : "1px solid rgba(255,255,255,0.10)",
        background: active
          ? "linear-gradient(90deg, rgba(167,139,250,0.20), rgba(56,189,248,0.12))"
          : "rgba(255,255,255,0.04)",
        boxShadow: active ? "0 10px 35px rgba(167,139,250,0.10)" : "none",
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </span>
        </div>
        {badge ? <div>{badge}</div> : null}
      </div>
      {hint ? (
        <div className="mutedSmall" style={{ opacity: 0.85, paddingLeft: 26 }}>
          {hint}
        </div>
      ) : null}
    </button>
  );
}

export default function AdminPage() {
  const [key, setKey] = React.useState(() => loadAdminKey());
  const [tab, setTab] = React.useState(() => loadTab());

  const [input, setInput] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const [requests, setRequests] = React.useState<any[]>([]);
  const [streamers, setStreamers] = React.useState<any[]>([]);

  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");

  // ✅ requests view (pending by default)
  const [reqView, setReqView] = React.useState<"pending" | "rejected">("pending");

  // ✅ Casino comments moderation
  const [ccStatus] = React.useState<"pending">("pending");
  const [ccLoading, setCcLoading] = React.useState(false);
  const [ccItems, setCcItems] = React.useState<AdminCasinoCommentRow[]>([]);

  // ✅ Manual slots update
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slotsRes, setSlotsRes] = React.useState<AdminSlotsUpdateResp | null>(null);

  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsReq, setDetailsReq] = React.useState<any | null>(null);

  // ✅ Pending registrations (email not verified)
  const [pendingRegsLoading, setPendingRegsLoading] = React.useState(false);
  const [pendingRegs, setPendingRegs] = React.useState<AdminPendingRegistrationRow[]>([]);

  // ✅ Referrals
  const [refLoading, setRefLoading] = React.useState(false);
  const [refSummary, setRefSummary] = React.useState<AdminReferralSummary | null>(null);
  const [refRows, setRefRows] = React.useState<AdminReferralRow[]>([]);
  const [refOffset, setRefOffset] = React.useState(0);

  function goto(next: string) {
    setTab(next);
    saveTab(next);
    setErr(null);
    if (next === "requests") setReqView("pending"); // ✅ reset view when opening tab
  }

  async function refresh() {
    const r = await adminListRequests(key);
    setRequests(r.requests);
    const s = await getStreamers();
    setStreamers(s);
  }

  async function refreshCasinoComments() {
    if (!key) return;
    setCcLoading(true);
    try {
      const r = await adminListCasinoComments(key, ccStatus, 80);
      setCcItems(r.items || []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setCcLoading(false);
    }
  }

  async function refreshPendingRegs() {
    if (!key) return;
    setPendingRegsLoading(true);
    setErr(null);
    try {
      const r = await adminListPendingRegistrations(key, 200);
      setPendingRegs(r.items || []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setPendingRegsLoading(false);
    }
  }

  async function refreshReferrals(offset = 0) {
    if (!key) return;
    setRefLoading(true);
    setErr(null);
    try {
      const s = await adminReferralsSummary(key);
      setRefSummary(s);

      const r = await adminListReferrals(key, { limit: 200, offset });
      setRefRows(r.items || []);
      setRefOffset(offset);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setRefLoading(false);
    }
  }

  React.useEffect(() => {
    if (!key) return;
    if (tab === "pending_registrations") refreshPendingRegs();
    if (tab === "referrals") refreshReferrals(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tab]);

  React.useEffect(() => {
    if (!key) return;
    refresh().catch((e) => setErr(String((e as any)?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  React.useEffect(() => {
    if (!key) return;
    if (tab !== "casino_comments") return;
    refreshCasinoComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tab, ccStatus]);

  const pendingRequestsItems = React.useMemo(
    () => requests.filter((r) => String(r.status) === "pending"),
    [requests]
  );
  const rejectedRequestsItems = React.useMemo(
    () => requests.filter((r) => String(r.status) === "rejected"),
    [requests]
  );

  const pendingRequests = pendingRequestsItems.length;

  const pendingCasinoComments = React.useMemo(
    () => ccItems.filter((c) => String(c.status) === "pending").length,
    [ccItems]
  );

  const headerRight = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Pill tone="brand">🔐 Admin connecté</Pill>
      <button
        className="btnGhostSmall"
        type="button"
        onClick={() => {
          clearAdminKey();
          setKey("");
          setInput("");
          setErr(null);
        }}
        style={{
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        Se déconnecter
      </button>
    </div>
  );

  async function onLogin() {
    setErr(null);
    const k = input.trim();
    if (!k) return;
    try {
      await adminListRequests(k);
      setKey(k);
      saveAdminKey(k);
    } catch {
      setErr("Mot de passe incorrect");
    }
  }

  if (!key) {
    return (
      <main className="container">
        <div
          style={{
            margin: "18px 0 10px",
            padding: 16,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background:
              "radial-gradient(1200px 500px at 15% 0%, rgba(167,139,250,0.25) 0%, rgba(0,0,0,0) 60%), radial-gradient(900px 450px at 90% 15%, rgba(56,189,248,0.20) 0%, rgba(0,0,0,0) 55%), rgba(255,255,255,0.02)",
            boxShadow: "0 18px 70px rgba(0,0,0,0.35)",
          }}
        >
          <div className="pageTitle" style={{ margin: 0 }}>
            <h1 style={{ marginBottom: 6 }}>Admin</h1>
            <p className="muted" style={{ margin: 0 }}>
              Accès protégé — centre de contrôle LunaLive
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 14, alignItems: "start" }}>
          <Card
            title={
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                Connexion
              </span>
            }
            subtitle="Saisis la clé admin pour ouvrir le panneau."
          >
            <div className="field">
              <label>Admin key</label>
              <input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onLogin();
                }}
                placeholder="••••••••••"
              />
            </div>

            {err && (
              <div
                className="hint"
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  padding: "10px 12px",
                  border: "1px solid rgba(239,68,68,0.25)",
                  background: "rgba(239,68,68,0.10)",
                }}
              >
                ⚠️ {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <button className="btnPrimary" onClick={onLogin} type="button">
                Entrer
              </button>
              <div className="mutedSmall" style={{ opacity: 0.8 }}>
                Astuce: la clé est stockée en <b>sessionStorage</b> (onglet navigateur).
              </div>
            </div>
          </Card>

          <Card
            title={
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                Ce que tu trouveras ici
              </span>
            }
            subtitle="Tout au même endroit, trié proprement."
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill tone="brand">🧭 Navigation rapide</Pill>
                <Pill tone="info">📝 Modération avis</Pill>
                <Pill tone="warn">🎰 Sync slots</Pill>
                <Pill tone="neutral">👥 Utilisateurs + Rubis</Pill>
              </div>

              <div className="mutedSmall" style={{ lineHeight: 1.45, opacity: 0.9 }}>
                Une fois connecté, tu auras un centre de contrôle avec un menu latéral et des actions regroupées.
              </div>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      {/* HEADER */}
      <div
        style={{
          margin: "18px 0 12px",
          padding: 16,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background:
            "radial-gradient(1200px 500px at 15% 0%, rgba(167,139,250,0.25) 0%, rgba(0,0,0,0) 60%), radial-gradient(900px 450px at 90% 15%, rgba(56,189,248,0.18) 0%, rgba(0,0,0,0) 55%), rgba(255,255,255,0.02)",
          boxShadow: "0 18px 70px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div className="pageTitle" style={{ margin: 0 }}>
            <h1 style={{ marginBottom: 6 }}>Admin</h1>
            <p className="muted" style={{ margin: 0 }}>
              Centre de contrôle — tout au même endroit, propre et rapide.
            </p>
          </div>
          {headerRight}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <Pill tone={pendingRequests > 0 ? "warn" : "good"}>
            📨 Demandes streamer: <b>{pendingRequests}</b>
          </Pill>
          <Pill tone={tab === "casino_comments" ? "brand" : pendingCasinoComments > 0 ? "warn" : "neutral"}>
            📝 Avis en attente: <b>{pendingCasinoComments}</b>
          </Pill>
          <Pill tone="info">
            🎥 Streamers: <b>{streamers.length}</b>
          </Pill>
          <button
            className="btnSecondary"
            type="button"
            onClick={() => refresh().catch((e) => setErr(String((e as any)?.message || e)))}
            style={{
              borderRadius: 999,
              padding: "8px 12px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            🔄 Refresh global
          </button>
        </div>
      </div>

      {/* LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, alignItems: "start" }}>
        {/* SIDEBAR */}
        <div style={{ position: "sticky", top: 12, alignSelf: "start" }}>
          <Card
            title={
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🧭</span>
                Navigation
              </span>
            }
            subtitle="Choisis une section — tout est regroupé."
            right={
              <button
                className="btnGhostSmall"
                type="button"
                onClick={() => {
                  setSlotsRes(null);
                  setErr(null);
                }}
              >
                🧹 Reset
              </button>
            }
          >
            <div style={{ display: "grid", gap: 10 }}>
              <NavButton active={tab === "overview"} icon="🏠" label="Aperçu" hint="Vue globale + raccourcis" onClick={() => goto("overview")} />

              <NavButton
                active={tab === "content"}
                icon="🧩"
                label="Contenu / Guides"
                hint="Éditer du HTML affiché sur le site"
                onClick={() => goto("content")}
              />

              <NavButton
                active={tab === "casinos"}
                icon="🏷️"
                label="Casinos (TrustPilot)"
                hint="Gestion casinos + liens + avis publiés"
                onClick={() => goto("casinos")}
              />

              <NavButton
                active={tab === "casino_comments"}
                icon="📝"
                label="Validation avis"
                hint="Modération des commentaires"
                badge={pendingCasinoComments > 0 ? <Pill tone="warn"><b>{pendingCasinoComments}</b></Pill> : <Pill tone="neutral">0</Pill>}
                onClick={() => goto("casino_comments")}
              />

              <NavButton
                active={tab === "reports"}
                icon="⚑"
                label="Signalements / Feedback"
                hint="Réception + tri + marquer traité"
                onClick={() => goto("reports")}
              />

              <NavButton
                active={tab === "emotes"}
                icon="😀"
                label="Emojis & GIFs"
                hint="Catalogue natif • global • streamers (ban/suppr)"
                onClick={() => goto("emotes")}
              />

              <NavButton
                active={tab === "slots"}
                icon="🎰"
                label="MàJ Slots (Shuffle)"
                hint="Sync DB providers"
                onClick={() => goto("slots")}
              />

              <NavButton
                active={tab === "requests"}
                icon="🧾"
                label="Demandes streamer"
                hint="Par défaut: uniquement pending"
                badge={pendingRequests > 0 ? <Pill tone="warn"><b>{pendingRequests}</b></Pill> : <Pill tone="neutral">0</Pill>}
                onClick={() => goto("requests")}
              />

              <NavButton active={tab === "streamers"} icon="🎥" label="Gestion streamers" hint="Créer / supprimer" onClick={() => goto("streamers")} />

              <NavButton
                active={tab === "users"}
                icon="👥"
                label="Utilisateurs"
                hint="Users + rubis + détails"
                onClick={() => goto("users")}
              />

              <NavButton
                active={tab === "pending_registrations"}
                icon="⏳"
                label="Inscriptions en attente"
                hint="Comptes créés mais email non vérifié"
                onClick={() => goto("pending_registrations")}
              />

              <NavButton
                active={tab === "referrals"}
                icon="🎁"
                label="Parrainages"
                hint="Stats par streamer + liste user → streamer"
                onClick={() => goto("referrals")}
              />

              <NavButton
                active={tab === "subscriptions"}
                icon="★"
                label="Abonnements"
                hint="Lister • ajouter • arrêter (viewer/streamer)"
                onClick={() => goto("subscriptions")}
              />

              <NavButton
                active={tab === "providers"}
                icon="🔗"
                label="Ajout de compte DLive"
                hint="Pool DLive (RTMP fixe)"
                onClick={() => goto("providers")}
              />
            </div>
          </Card>

          {err ? (
            <div
              style={{
                marginTop: 12,
                borderRadius: 14,
                padding: "10px 12px",
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.10)",
              }}
              className="mutedSmall"
            >
              ⚠️ {err}
            </div>
          ) : null}
        </div>

        {/* CONTENT */}
        <div style={{ display: "grid", gap: 14 }}>
          {tab === "overview" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  Aperçu & raccourcis
                </span>
              }
              subtitle="Navigation plus propre, et rubis désormais intégrés dans Utilisateurs."
              right={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btnPrimary" type="button" onClick={() => goto("requests")}>
                    🧾 Voir demandes
                  </button>
                  <button className="btnSecondary" type="button" onClick={() => goto("users")}>
                    👥 Users + Rubis
                  </button>
                </div>
              }
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
                  <div className="mutedSmall" style={{ opacity: 0.85 }}>
                    Demandes streamer (pending)
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 950, marginTop: 4 }}>{pendingRequests}</div>
                </div>

                <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
                  <div className="mutedSmall" style={{ opacity: 0.85 }}>
                    Avis casinos (pending)
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 950, marginTop: 4 }}>{pendingCasinoComments}</div>
                </div>

                <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
                  <div className="mutedSmall" style={{ opacity: 0.85 }}>
                    Streamers
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 950, marginTop: 4 }}>{streamers.length}</div>
                </div>
              </div>
            </Card>
          ) : null}

          {tab === "casinos" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🏷️</span>
                  Casinos (TrustPilot)
                </span>
              }
              subtitle="Affichage refait : liste + détails + liens + avis publiés (suppression)."
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
              <CasinosAdminSection adminKey={key} />
            </Card>
          ) : null}

          {tab === "subscriptions" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>★</span>
                  Abonnements
                </span>
              }
              subtitle="Gestion des abonnements viewer/streamer (liste + search + add/stop)."
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
              <SubscriptionsAdminSection adminKey={key} />
            </Card>
          ) : null}

          {tab === "casino_comments" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>📝</span>
                  Avis casinos — validation
                </span>
              }
              subtitle="Les commentaires avec images peuvent être en pending (validation requise)."
              right={
                <>
                  <Pill tone="info">
                    Filtre: <b>En attente</b>
                  </Pill>
                  <button className="btnPrimary" onClick={refreshCasinoComments} disabled={ccLoading} type="button">
                    {ccLoading ? "Chargement…" : "Rafraîchir"}
                  </button>
                  <button className="btnSecondary" type="button" onClick={() => goto("overview")}>
                    ← Retour
                  </button>
                </>
              }
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <Pill tone={ccItems.length ? "brand" : "neutral"}>
                  Items: <b>{ccItems.length}</b>
                </Pill>
              </div>

              {ccItems.length === 0 && !ccLoading ? <div className="mutedSmall">Aucun avis.</div> : null}

              <div style={{ display: "grid", gap: 10 }}>
                {ccItems.map((c) => {
                  const created = new Date(c.createdAt).toLocaleString("fr-FR");

                  // backend => status: pending | published | rejected | deleted
                  const statusTone =
                    c.status === "pending" ? "warn" : c.status === "published" ? "good" : "bad";

                  return (
                    <div
                      key={c.id}
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: 12,
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <b>{c.casinoName}</b>
                            <span className="mutedSmall" style={{ opacity: 0.8 }}>
                              • {c.casinoSlug} • {created}
                            </span>
                            <Pill tone={statusTone as any}>
                              status: <b>{c.status}</b>
                            </Pill>
                          </div>
                          <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 6 }}>
                            par <b>{c.username}</b> (userId {c.userId})
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Link
                            className="btnSmall"
                            to={`/casinos/${encodeURIComponent(c.casinoSlug)}`}
                            style={{
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.04)",
                            }}
                          >
                            Ouvrir page
                          </Link>

                          {c.status === "pending" ? (
                            <>
                              <button
                                className="btnGhostSmall"
                                onClick={async () => {
                                  setErr(null);
                                  await adminApproveCasinoComment(key, c.id);
                                  await refreshCasinoComments();
                                }}
                                type="button"
                                style={{
                                  borderRadius: 12,
                                  border: "1px solid rgba(34,197,94,0.30)",
                                  background: "rgba(34,197,94,0.10)",
                                }}
                              >
                                ✅ Approve
                              </button>
                              <button
                                className="btnGhostSmall"
                                onClick={async () => {
                                  setErr(null);
                                  await adminRejectCasinoComment(key, c.id);
                                  await refreshCasinoComments();
                                }}
                                type="button"
                                style={{
                                  borderRadius: 12,
                                  border: "1px solid rgba(239,68,68,0.30)",
                                  background: "rgba(239,68,68,0.10)",
                                }}
                              >
                                ❌ Reject
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ padding: 12, display: "grid", gap: 10 }}>
                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{c.body}</div>

                        {Array.isArray(c.images) && c.images.length > 0 ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {c.images.slice(0, 6).map(
                              (im: { url: string; w: number | null; h: number | null; sizeBytes: number | null }, i: number) => {
                                const src = absApiUrl(im.url) || im.url;
                                return (
                                  <a
                                    key={i}
                                    href={src}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      width: 120,
                                      height: 84,
                                      borderRadius: 12,
                                      overflow: "hidden",
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      display: "block",
                                      background: "rgba(255,255,255,0.03)",
                                    }}
                                  >
                                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  </a>
                                );
                              }
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {tab === "slots" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🎰</span>
                  Slots — mise à jour (Shuffle)
                </span>
              }
              subtitle="Met à jour la DB depuis Shuffle."
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btnPrimary"
                  disabled={slotsLoading}
                  onClick={async () => {
                    setErr(null);
                    setSlotsRes(null);
                    setSlotsLoading(true);
                    try {
                      const r = await adminSlotsUpdate(key);
                      setSlotsRes(r);
                    } catch (e: any) {
                      setErr(String(e?.message || e));
                    } finally {
                      setSlotsLoading(false);
                    }
                  }}
                  type="button"
                >
                  {slotsLoading ? "Mise à jour en cours…" : "Lancer la mise à jour slots"}
                </button>

                {slotsRes?.ok ? (
                  <Pill tone="good">
                    ✅ fetched <b>{slotsRes.fetched}</b> • ajoutées <b>{slotsRes.added}</b>
                  </Pill>
                ) : null}
              </div>
            </Card>
          ) : null}

          {tab === "emotes" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>😀</span>
                  Emojis & GIFs — modération
                </span>
              }
              subtitle="Ici: gestion des emotes natives/globaux + emotes ajoutés par streamers. (ban/suppression/purge)"
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
            <EmotesAdminSection adminKey={key} />
            </Card>
          ) : null}

          {tab === "requests" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🧾</span>
                  Demandes “Devenir streamer”
                </span>
              }
              subtitle={reqView === "pending" ? "Liste = uniquement les demandes en attente." : "Liste = uniquement les demandes rejetées."}
              right={
                <>
                  <Pill tone={reqView === "pending" ? "warn" : "neutral"}>
                    Pending: <b>{pendingRequestsItems.length}</b>
                  </Pill>
                  <Pill tone={reqView === "rejected" ? "bad" : "neutral"}>
                    Rejetées: <b>{rejectedRequestsItems.length}</b>
                  </Pill>

                  <button
                    className={reqView === "pending" ? "btnPrimary" : "btnSecondary"}
                    type="button"
                    onClick={() => setReqView("pending")}
                  >
                    📥 Voir pending
                  </button>

                  <button
                    className={reqView === "rejected" ? "btnPrimary" : "btnSecondary"}
                    type="button"
                    onClick={() => setReqView("rejected")}
                  >
                    ❌ Voir rejetées
                  </button>

                  <button className="btnSecondary" type="button" onClick={() => goto("overview")}>
                    ← Retour
                  </button>
                </>
              }
            >
              {reqView === "pending" && pendingRequestsItems.length === 0 ? (
                <div className="mutedSmall">Aucune demande en attente.</div>
              ) : null}
              {reqView === "rejected" && rejectedRequestsItems.length === 0 ? (
                <div className="mutedSmall">Aucune demande rejetée.</div>
              ) : null}

              <div style={{ display: "grid", gap: 10 }}>
                {(reqView === "pending" ? pendingRequestsItems : rejectedRequestsItems).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                      padding: 12,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <b>{r.username}</b>
                        <Pill tone={String(r.status) === "pending" ? "warn" : String(r.status) === "rejected" ? "bad" : "neutral"}>
                          {r.status}
                        </Pill>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {/* ✅ Dans "rejected", on propose seulement "Approve" comme tu veux */}
                      <button
                        className="btnGhostSmall"
                        onClick={async () => {
                          setErr(null);
                          await adminApproveRequest(key, r.id);
                          await refresh();
                        }}
                        type="button"
                        style={{
                          borderRadius: 12,
                          border: "1px solid rgba(34,197,94,0.30)",
                          background: "rgba(34,197,94,0.10)",
                        }}
                      >
                        ✅ Approve
                      </button>

                      {reqView === "pending" ? (
                        <button
                          className="btnGhostSmall"
                          onClick={async () => {
                            setErr(null);
                            await adminRejectRequest(key, r.id);
                            await refresh();
                          }}
                          type="button"
                          style={{
                            borderRadius: 12,
                            border: "1px solid rgba(239,68,68,0.30)",
                            background: "rgba(239,68,68,0.10)",
                          }}
                        >
                          ❌ Reject
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {tab === "streamers" ? (
            <div style={{ display: "grid", gap: 14 }}>
              <Card
                title={
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>➕</span>
                    Créer un streamer
                  </span>
                }
                subtitle="Création rapide d’un streamer (slug + display name)."
                right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Slug</label>
                    <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="ex: wayzebi" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Display name</label>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: Wayzebi" />
                  </div>

                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      className="btnPrimary"
                      onClick={async () => {
                        setErr(null);
                        await adminCreateStreamer(key, newSlug, newName);
                        setNewSlug("");
                        setNewName("");
                        await refresh();
                      }}
                      type="button"
                      disabled={!newSlug.trim() || !newName.trim()}
                    >
                      Créer
                    </button>
                  </div>
                </div>
              </Card>

              <Card
                title={
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🎥</span>
                    Streamers
                  </span>
                }
                subtitle="Liste des streamers — suppression rapide."
                right={<Pill tone="info">total: <b>{streamers.length}</b></Pill>}
              >
                <div style={{ display: "grid", gap: 10 }}>
                  {streamers.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        padding: 12,
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <b>{s.displayName}</b> <span className="mutedSmall">({s.slug})</span>
                      </div>
                      <button
                        className="btnGhostSmall"
                        onClick={async () => {
                          setErr(null);
                          await adminDeleteStreamer(key, s.slug);
                          await refresh();
                        }}
                        type="button"
                        style={{
                          borderRadius: 12,
                          border: "1px solid rgba(239,68,68,0.30)",
                          background: "rgba(239,68,68,0.10)",
                        }}
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}

          {tab === "users" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>👥</span>
                  Utilisateurs
                </span>
              }
              subtitle="Users + détails + rubis (mint / remove / set)."
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
              <UsersAdminSection adminKey={key} />
            </Card>
            
          ) : null}
          {tab === "pending_registrations" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⏳</span>
                  Inscriptions en attente
                </span>
              }
              subtitle="Comptes créés mais email non vérifié. Utile pour diagnostiquer les spams / bugs d’inscription."
              right={
                <>
                  <Pill tone={pendingRegs.length ? "warn" : "good"}>
                    pending: <b>{pendingRegs.length}</b>
                  </Pill>
                  <button className="btnPrimary" type="button" onClick={refreshPendingRegs} disabled={pendingRegsLoading}>
                    {pendingRegsLoading ? "…" : "Rafraîchir"}
                  </button>
                  <button className="btnSecondary" type="button" onClick={() => goto("overview")}>
                    ← Retour
                  </button>
                </>
              }
            >
              {pendingRegs.length === 0 && !pendingRegsLoading ? (
                <div className="mutedSmall">Aucun compte en attente.</div>
              ) : null}

              <div style={{ display: "grid", gap: 10 }}>
                {pendingRegs.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b>{u.username}</b>
                        <span className="mutedSmall" style={{ opacity: 0.85 }}>
                          #{u.id}
                        </span>
                        <Pill tone="warn">email non vérifié</Pill>
                      </div>

                      <div className="mutedSmall" style={{ opacity: 0.9, marginTop: 6 }}>
                        📧 <b>{u.email}</b>
                      </div>

                      <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 6 }}>
                        Créé: <b>{fmtFrDate(u.createdAt)}</b> • Code:{" "}
                        <b>{u.codeCreatedAt ? fmtFrDate(u.codeCreatedAt) : "—"}</b>
                        {u.attempts != null ? (
                          <>
                            {" "}
                            • Tentatives: <b>{u.attempts}</b>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        className="btnGhostSmall"
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(u.email)}
                      >
                        📋 Copier email
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          {tab === "referrals" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🎁</span>
                  Parrainages
                </span>
              }
              subtitle="Résumé par streamer + liste des parrainages (user → streamer)."
              right={
                <>
                  <button className="btnPrimary" type="button" onClick={() => refreshReferrals(refOffset)} disabled={refLoading}>
                    {refLoading ? "…" : "Rafraîchir"}
                  </button>
                  <button className="btnSecondary" type="button" onClick={() => goto("overview")}>
                    ← Retour
                  </button>
                </>
              }
            >
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <Pill tone="info">
                  total: <b>{refSummary?.totals.total ?? 0}</b>
                </Pill>
                <Pill tone="info">
                  users uniques: <b>{refSummary?.totals.uniqueUsers ?? 0}</b>
                </Pill>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 950 }}>
                  📊 Parrainages par streamer
                </div>
                <div style={{ padding: 12, display: "grid", gap: 8 }}>
                  {(refSummary?.byStreamer ?? []).length === 0 ? (
                    <div className="mutedSmall">Aucun parrainage.</div>
                  ) : (
                    (refSummary!.byStreamer).map((s) => (
                      <div
                        key={s.streamerSlug}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                          padding: "10px 10px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(0,0,0,0.10)",
                        }}
                      >
                        <div>
                          <b>{s.streamerName || s.streamerSlug}</b>{" "}
                          <span className="mutedSmall" style={{ opacity: 0.8 }}>
                            ({s.streamerSlug})
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Pill tone="brand">
                            total: <b>{s.count}</b>
                          </Pill>
                          <Pill tone="info">
                            uniques: <b>{s.uniqueUsers}</b>
                          </Pill>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <Pill tone="neutral">
                  offset: <b>{refOffset}</b>
                </Pill>
                <button
                  className="btnSecondary"
                  type="button"
                  disabled={refLoading || refOffset === 0}
                  onClick={() => refreshReferrals(Math.max(0, refOffset - 200))}
                >
                  ← Précédent
                </button>
                <button className="btnSecondary" type="button" disabled={refLoading} onClick={() => refreshReferrals(refOffset + 200)}>
                  Suivant →
                </button>
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {refRows.length === 0 && !refLoading ? <div className="mutedSmall">Aucun item.</div> : null}

                {refRows.map((r, i) => (
                  <div
                    key={`${r.userId}-${r.streamerSlug}-${i}`}
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <b>{r.username}</b>{" "}
                      <span className="mutedSmall" style={{ opacity: 0.8 }}>
                        #{r.userId}
                      </span>
                      <div className="mutedSmall" style={{ opacity: 0.9, marginTop: 6 }}>
                        → <b>{r.streamerName || r.streamerSlug}</b>{" "}
                        <span style={{ opacity: 0.8 }}>({r.streamerSlug})</span>
                      </div>
                    </div>
                    <div className="mutedSmall" style={{ opacity: 0.85 }}>
                      {fmtFrDate(r.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {tab === "reports" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⚑</span>
                  Signalements / Feedback
                </span>
              }
              subtitle="Inbox des retours: ouvrir, traiter, supprimer."
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
              <ReportsAdminSection adminKey={key} />
            </Card>
          ) : null}

          {tab === "content" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🧩</span>
                  Contenu / Guides (HTML)
                </span>
              }
              subtitle="Ex: daily_bonus_infos, guide_streamer, guide_viewer…"
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
              <AdminContentSection adminKey={key} />
            </Card>
          ) : null}

          {tab === "providers" ? (
            <Card
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🔗</span>
                  Ajout de compte DLive
                </span>
              }
              subtitle="RTMP fixe: rtmp://stream.dlive.tv/live — on ne le demande plus."
              right={<button className="btnSecondary" type="button" onClick={() => goto("overview")}>← Retour</button>}
            >
              <ProviderAccountsAdminSection adminKey={key} />
            </Card>
          ) : null}
        </div>
      </div>
      <RequestDetailsModal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsReq(null);
        }}
        req={detailsReq}
      />

    </main>
  );
}

function AdminContentSection({ adminKey }: { adminKey: string }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [selectedKey, setSelectedKey] = React.useState("daily_bonus_infos");
  const [title, setTitle] = React.useState("");
  const [html, setHtml] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [minRole, setMinRole] = React.useState<"viewer" | "moderator" | "streamer">("viewer");

  const [newKey, setNewKey] = React.useState("");

  async function refreshList() {
    setLoading(true);
    setMsg(null);
    try {
      const r: any = await adminListContent(adminKey);
      setItems(Array.isArray(r?.items) ? r.items : []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadOne(k: string) {
    setLoading(true);
    setMsg(null);
    try {
      const r: any = await adminGetContent(adminKey, k);
      const it = r?.item;
      setSelectedKey(k);
      setTitle(String(it?.title || ""));
      setHtml(String(it?.html || ""));
      setMinRole((String(it?.min_role || "viewer") as any) || "viewer");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refreshList();
    loadOne(selectedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 12, alignItems: "start" }}>
      {/* LIST */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btnSecondary" type="button" onClick={refreshList} disabled={loading}>
            {loading ? "…" : "🔄 Rafraîchir"}
          </button>
          <Pill tone="info">items: <b>{items.length}</b></Pill>
        </div>

        <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="mutedSmall" style={{ opacity: 0.85 }}>Sélectionne une clé</div>
          </div>

          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => loadOne(String(it.key))}
                className="btnSecondary"
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 0,
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: selectedKey === it.key ? "rgba(167,139,250,0.12)" : "transparent",
                  padding: "10px 10px",
                }}
              >
                <div style={{ fontWeight: 950 }}>{it.key}</div>
                <div className="mutedSmall" style={{ opacity: 0.8 }}>{it.title || "—"}</div>
              </button>
            ))}

            {items.length === 0 && !loading ? (
              <div className="mutedSmall" style={{ padding: 10, opacity: 0.85 }}>Aucun contenu.</div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Créer une nouvelle clé</label>
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="ex: guide_streamer" />
          </div>

          <button
            className="btnPrimary"
            type="button"
            disabled={!newKey.trim()}
            onClick={async () => {
              const k = newKey.trim();
              setNewKey("");
              await adminUpsertContent(adminKey, k, { title: "", html: "<h2>Nouveau contenu</h2><p>…</p>" });
              await refreshList();
              await loadOne(k);
            }}
          >
            ➕ Créer
          </button>
        </div>

        {msg ? (
          <div style={{ borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.10)" }} className="mutedSmall">
            ⚠️ {msg}
          </div>
        ) : null}
      </div>

      {/* EDITOR */}
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Pill tone="brand">key: <b>{selectedKey}</b></Pill>

          <button
            className="btnPrimary"
            type="button"
            disabled={loading}
            onClick={async () => {
              setMsg(null);
              try {
                await adminUpsertContent(adminKey, selectedKey, { title, html, min_role: minRole });
                setMsg("✅ Sauvegardé");
                await refreshList();
              } catch (e: any) {
                setMsg(String(e?.message || e));
              }
            }}
          >
            💾 Sauvegarder
          </button>

          <button
            className="btnGhostSmall"
            type="button"
            disabled={loading}
            onClick={async () => {
              setMsg(null);
              try {
                await adminDeleteContent(adminKey, selectedKey);
                setMsg("🗑️ Supprimé");
                setTitle("");
                setHtml("");
                await refreshList();
              } catch (e: any) {
                setMsg(String(e?.message || e));
              }
            }}
            style={{ border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.10)", borderRadius: 12 }}
          >
            🗑️ Supprimer
          </button>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label>Titre (optionnel)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Guide Streamer — Démarrage" />
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label>Visible à partir de</label>
          <select value={minRole} onChange={(e) => setMinRole(e.target.value as any)}>
            <option value="viewer">Tout le monde (viewer)</option>
            <option value="moderator">Modérateurs + streamers</option>
            <option value="streamer">Streamers uniquement</option>
          </select>
          <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 6 }}>
            Un rôle au-dessus voit tout ce qui est en dessous.
          </div>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label>HTML</label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={14}
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            placeholder="<h2>…</h2><p>…</p>"
          />
          <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 6 }}>
            HTML simple recommandé (titres, listes, liens). Scripts/iframes non.
          </div>
        </div>

        <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 950 }}>
            👁️ Preview
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ lineHeight: 1.6, opacity: 0.95 }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </div>
  );
}
function fmtFrDate(d: any) {
  try {
    const dt = new Date(d);
    if (!dt || isNaN(dt.getTime())) return "—";
    return dt.toLocaleString("fr-FR");
  } catch {
    return "—";
  }
}

function getFirst<T = any>(obj: any, keys: string[]): T | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v as T;
  }
  return null;
}

function RequestDetailsModal({
  open,
  onClose,
  req,
}: {
  open: boolean;
  onClose: () => void;
  req: any | null;
}) {
  if (!open || !req) return null;

  const username = String(getFirst(req, ["username", "userUsername"]) ?? "—");
  const status = String(getFirst(req, ["status"]) ?? "—");
  const userId = getFirst(req, ["userId", "user_id", "uid"]);
  const createdAt = getFirst(req, ["createdAt", "created_at", "requestedAt", "requested_at", "appliedAt"]);

  const discord = getFirst(req, ["discord", "discordTag", "discord_id", "discordId"]);

  // DLive (selon tes champs actuels possibles)
  const dliveDisplayname = getFirst(req, ["dliveDisplayname", "dlive_displayname", "linkedDisplayname", "dliveLinkedDisplayname"]);
  const channelUrl =
    getFirst(req, ["channelUrl", "channel_url", "dliveUrl", "dlive_url"]) ||
    (dliveDisplayname ? `https://dlive.tv/${String(dliveDisplayname).replace(/^@/, "")}` : null);

  // Follow count (si backend l’envoie)
  const dliveFollowers =
    getFirst<number>(req, ["dliveFollowers", "dlive_followers", "followers", "followersCount", "followsCount", "dliveFollowersCount"]) ?? null;

  const tone =
    status === "pending" ? "warn" : status === "approved" ? "good" : status === "rejected" ? "bad" : "neutral";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.58)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 14,
      }}
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "radial-gradient(900px 320px at 20% 0%, rgba(140,90,255,0.28), rgba(0,0,0,0) 60%), radial-gradient(700px 260px at 85% 20%, rgba(56,189,248,0.18), rgba(0,0,0,0) 55%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.18))",
          boxShadow: "0 28px 90px rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 1100, letterSpacing: -0.2, fontSize: 16 }}>🔎 Détails demande streamer</div>
            {/* Pill existe déjà dans ton fichier */}
            <Pill tone={tone as any}>
              status: <b>{status}</b>
            </Pill>
          </div>

          <button className="btnGhost" onClick={onClose} type="button">
            ✖
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.14)",
              padding: 12,
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 1000, fontSize: 15 }}>{username}</div>
              <div className="mutedSmall" style={{ opacity: 0.85 }}>
                {userId ? `userId ${userId}` : null}
              </div>
            </div>

            <div className="mutedSmall" style={{ opacity: 0.9 }}>
              📅 Demandé le : <b>{fmtFrDate(createdAt)}</b>
            </div>
          </div>

          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.14)",
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 1000 }}>📞 Contact</div>

            <div className="mutedSmall" style={{ opacity: 0.95, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                Discord : <b>{discord ? String(discord) : "—"}</b>
              </div>

              <div style={{ flex: 1 }} />

              <button
                className="btnGhostSmall"
                type="button"
                disabled={!discord}
                onClick={() => navigator.clipboard?.writeText(String(discord || ""))}
              >
                📋 Copier
              </button>
            </div>
          </div>

          <div
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.14)",
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 1000 }}>🎥 DLive</div>

            <div className="mutedSmall" style={{ opacity: 0.95, display: "grid", gap: 6 }}>
              <div>
                Chaîne :{" "}
                {channelUrl ? (
                  <a href={String(channelUrl)} target="_blank" rel="noreferrer" style={{ fontWeight: 950 }}>
                    {dliveDisplayname ? String(dliveDisplayname) : String(channelUrl)}
                  </a>
                ) : (
                  <b>—</b>
                )}
              </div>

              <div>
                Followers : <b>{dliveFollowers !== null ? String(dliveFollowers) : "—"}</b>
              </div>

              <div className="mutedSmall" style={{ opacity: 0.8 }}>
                (Si “Followers” est à —, il faut juste renvoyer le champ côté API adminListRequests.)
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button className="btnSecondary" type="button" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
