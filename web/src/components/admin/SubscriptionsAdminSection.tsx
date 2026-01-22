// web/src/components/admin/SubscriptionsAdminSection.tsx
import * as React from "react";
import {
  adminListSubscriptions,
  adminGrantSubscription,
  adminCancelSubscription,
  adminListUsers,
  type AdminUserRow,
} from "../../lib/api";

type PlanCode = "viewer" | "streamer";

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

function fmtDate(x: any) {
  if (!x) return "—";
  const d = new Date(String(x));
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR");
}

export function SubscriptionsAdminSection({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = React.useState<"active" | "all">("active");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState<number>(0);

  // grant controls
  const [grantQuery, setGrantQuery] = React.useState("");
  const [grantUserId, setGrantUserId] = React.useState<number>(0);
  const [grantDays, setGrantDays] = React.useState<number>(30);

  // simple suggestions from users list (lazy)
  const [usersCache, setUsersCache] = React.useState<AdminUserRow[] | null>(null);
  const [suggest, setSuggest] = React.useState<AdminUserRow[]>([]);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const r = await adminListSubscriptions(adminKey, {
        status,
        q: q.trim() ? q.trim() : null,
        limit: 160,
        offset: 0,
      });
      setItems(r.items || []);
      setTotal(Number(r.total || 0));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, status]);

  // suggestions
  React.useEffect(() => {
    const t = grantQuery.trim();
    if (!t) {
      setSuggest([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (!usersCache) {
          const r = await adminListUsers(adminKey);
          if (cancelled) return;
          setUsersCache(r.users || []);
        }
        const arr = (usersCache || []).slice();
        const low = t.toLowerCase();

        const sug = arr
          .filter((u) => u.username.toLowerCase().includes(low) || String(u.id).includes(low))
          .slice(0, 8);

        if (!cancelled) setSuggest(sug);
      } catch {
        if (!cancelled) setSuggest([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [grantQuery, usersCache, adminKey]);

  async function grant(planCode: PlanCode) {
    const uid =
      grantUserId ||
      (/^\d+$/.test(grantQuery.trim()) ? Number(grantQuery.trim()) : 0);

    if (!uid) {
      setErr("Indique un userId (ou sélectionne un user).");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      await adminGrantSubscription(adminKey, uid, planCode, grantDays);
      setGrantUserId(uid);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(uid: number, planCode: PlanCode) {
    setBusy(true);
    setErr(null);
    try {
      await adminCancelSubscription(adminKey, uid, planCode);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 220, margin: 0 }}>
          <label>Filtre</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">Actifs</option>
            <option value="all">Tous</option>
          </select>
        </div>

        <div className="field" style={{ flex: 1, minWidth: 260, margin: 0 }}>
          <label>Recherche</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load();
            }}
            placeholder="pseudo ou userId…"
          />
        </div>

        <button className="btnSecondary" type="button" onClick={load} disabled={busy}>
          {busy ? "…" : "Refresh"}
        </button>

        <Pill tone={total > 0 ? "brand" : "neutral"}>
          total: <b>{total}</b>
        </Pill>
      </div>

      {err ? (
        <div
          className="hint"
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.10)",
          }}
        >
          ⚠️ {err}
        </div>
      ) : null}

      {/* grant panel */}
      <div
        style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          ★ Ajouter / prolonger un abonnement
          <Pill tone="info">provider=manual</Pill>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 1fr", gap: 10, alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>User (pseudo ou id)</label>
            <input
              value={grantQuery}
              onChange={(e) => {
                setGrantQuery(e.target.value);
                setGrantUserId(0);
              }}
              placeholder="ex: LeCasiNoze ou 4"
            />
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Durée (jours)</label>
            <input
              type="number"
              value={grantDays}
              min={1}
              max={3650}
              onChange={(e) => setGrantDays(Math.max(1, Math.min(3650, Number(e.target.value || 30))))}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btnPrimary" type="button" onClick={() => grant("viewer")} disabled={busy}>
              ➕ Viewer
            </button>
            <button className="btnPrimary" type="button" onClick={() => grant("streamer")} disabled={busy}>
              ➕ Streamer
            </button>
          </div>
        </div>

        {/* suggestions */}
        {suggest.length > 0 ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {suggest.map((u) => (
              <button
                key={u.id}
                type="button"
                className={cx("btnGhostSmall")}
                onClick={() => {
                  setGrantUserId(u.id);
                  setGrantQuery(`${u.username} (#${u.id})`);
                  setSuggest([]);
                }}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                {u.username} <span className="mutedSmall">#{u.id}</span>
              </button>
            ))}
          </div>
        ) : null}

        {grantUserId ? (
          <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 10 }}>
            userId sélectionné: <b>{grantUserId}</b>
          </div>
        ) : null}
      </div>

      {/* list */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
        {items.length === 0 && !busy ? <div className="mutedSmall">Aucun abonnement.</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          {items.map((s) => {
            const plan = String(s.planCode || s.plan_code || "").toLowerCase() as PlanCode;
            const tone =
              String(s.status) === "active"
                ? "good"
                : String(s.status) === "trialing"
                ? "info"
                : String(s.status) === "canceled"
                ? "bad"
                : "neutral";

            return (
              <div
                key={`${s.userId}-${s.planCode}-${s.id}`}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "minmax(240px, 1fr) 160px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <b>{s.username}</b>
                    <span className="mutedSmall">#{s.userId}</span>
                    <Pill tone={tone as any}>
                      {plan} • <b>{String(s.status)}</b>
                    </Pill>
                  </div>
                  <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 6 }}>
                    provider: <b>{s.provider}</b> • subId: <span style={{ opacity: 0.9 }}>{s.providerSubscriptionId}</span>
                  </div>
                </div>

                <div className="mutedSmall" style={{ lineHeight: 1.45 }}>
                  start: <b>{fmtDate(s.currentPeriodStart)}</b>
                  <br />
                  end: <b>{fmtDate(s.currentPeriodEnd)}</b>
                </div>

                <div className="mutedSmall" style={{ lineHeight: 1.45 }}>
                  cancel_at_period_end: <b>{s.cancelAtPeriodEnd ? "true" : "false"}</b>
                  <br />
                  updated: <b>{fmtDate(s.updatedAt)}</b>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btnGhostSmall" type="button" onClick={() => grant(plan)} disabled={busy}>
                    +{grantDays}j
                  </button>
                  <button
                    className="btnGhostSmall"
                    type="button"
                    onClick={() => cancel(Number(s.userId), plan)}
                    disabled={busy}
                    style={{
                      border: "1px solid rgba(239,68,68,0.30)",
                      background: "rgba(239,68,68,0.10)",
                      borderRadius: 12,
                    }}
                  >
                    ⛔ Stop
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
