// web/src/components/admin/ReportsAdminSection.tsx
import * as React from "react";
import {
  adminDeleteReport,
  adminGetReport,
  adminListReports,
  adminSetReportStatus,
  type AdminReportRow,
} from "../../lib/api_admin_reports";

const uiInputStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
};

const uiSelectStyle: React.CSSProperties = {
  ...uiInputStyle,
  cursor: "pointer",
};

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "good" | "bad" | "brand";
}) {
  const bg =
    tone === "good"
      ? "rgba(34,197,94,0.14)"
      : tone === "warn"
      ? "rgba(245,158,11,0.14)"
      : tone === "bad"
      ? "rgba(239,68,68,0.14)"
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

function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(860px, 100%)",
          maxHeight: "min(88vh, 980px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "radial-gradient(1200px 360px at 12% 0%, rgba(167,139,250,0.22), rgba(0,0,0,0) 60%), rgba(16, 14, 26, 0.96)",
          boxShadow: "0 30px 110px rgba(0,0,0,0.75)",
          overflow: "hidden",
          transform: "translateZ(0)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <div style={{ fontWeight: 950, minWidth: 0 }}>{title}</div>
          <button className="btnGhostSmall" onClick={onClose} type="button" title="Fermer">
            ✖
          </button>
        </div>

        <div
          style={{
            padding: 14,
            overflow: "auto",
            maxHeight: "calc(min(88vh, 980px) - 56px)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function toneForStatus(s: string) {
  if (s === "open" || s === "pending") return "warn";
  if (s === "closed" || s === "done") return "good";
  if (s === "deleted" || s === "rejected") return "bad";
  return "neutral";
}

function labelForKind(k: string) {
  return k === "feedback" ? "Feedback" : "Signalement";
}

export function ReportsAdminSection({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = React.useState<"open" | "closed" | "all">("open");
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<AdminReportRow[]>([]);
  const [counts, setCounts] = React.useState<{ open: number; closed: number } | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [openId, setOpenId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<AdminReportRow | null>(null);
  const [detailBusy, setDetailBusy] = React.useState(false);
  const [detailErr, setDetailErr] = React.useState<string | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const r = await adminListReports(adminKey, status, 160);
      setItems(r.items || []);
      setCounts(r.counts ?? null);
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

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const tUser = it.target?.username ? `@${it.target.username}` : "";
      const tSlug = it.target?.slug ? `${it.target.slug}` : "";
      const hay = [
        String(it.id),
        it.kind,
        it.status,
        it.category,
        it.subject,
        it.description,
        it.username || "",
        tUser,
        tSlug,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [items, q]);

  async function openDetails(id: number) {
    setOpenId(id);
    setDetail(null);
    setDetailErr(null);
    setDetailBusy(true);
    try {
      const r = await adminGetReport(adminKey, id);
      setDetail(r.item);
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setDetailBusy(false);
    }
  }

  async function setStatusAndRefresh(id: number, next: "open" | "closed" | "deleted") {
    setDetailErr(null);
    try {
      await adminSetReportStatus(adminKey, id, next);
      await load();
      if (openId === id) {
        const r = await adminGetReport(adminKey, id).catch(() => null);
        if (r?.item) setDetail(r.item);
      }
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    }
  }

  async function deleteAndClose(id: number) {
    setDetailErr(null);
    try {
      await adminDeleteReport(adminKey, id);
      setOpenId(null);
      setDetail(null);
      await load();
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Signalements / Feedback</div>

      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 260, margin: 0 }}>
          <label>Recherche</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="id / pseudo / sujet / catégorie / cible…" />
        </div>

        <div className="field" style={{ width: 220, margin: 0 }}>
          <label>Statut</label>
          <select style={uiSelectStyle} value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="open">Ouverts</option>
            <option value="closed">Traités</option>
            <option value="all">Tout</option>
          </select>
        </div>

        <button className="btnSecondary" type="button" onClick={load} disabled={busy}>
          {busy ? "…" : "Refresh"}
        </button>

        <Pill tone={filtered.length ? "brand" : "neutral"}>{busy ? "Chargement…" : `${filtered.length} items`}</Pill>

        {counts ? (
          <>
            <Pill tone={counts.open ? "warn" : "neutral"}>
              ouverts: <b>{counts.open}</b>
            </Pill>
            <Pill tone={counts.closed ? "good" : "neutral"}>
              traités: <b>{counts.closed}</b>
            </Pill>
          </>
        ) : null}
      </div>

      {err ? <div className="hint" style={{ marginTop: 10 }}>⚠️ {err}</div> : null}

      <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {filtered.map((it) => {
          const created = it.createdAt ? new Date(it.createdAt).toLocaleString("fr-FR") : "—";
          const targetLabel = it.target?.username
            ? `@${it.target.username}`
            : it.target?.slug
            ? it.target.slug
            : null;

          return (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(320px, 1fr) 160px 240px",
                gap: 10,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <b style={{ fontSize: 14, whiteSpace: "nowrap" }}>
                    #{it.id} — {it.subject || "(sans sujet)"}
                  </b>
                  <Pill tone={toneForStatus(it.status) as any}>{it.status}</Pill>
                  <span className="mutedSmall" style={{ opacity: 0.85 }}>{created}</span>
                </div>

                <div className="mutedSmall" style={{ opacity: 0.9, marginTop: 4, lineHeight: 1.35 }}>
                  <b>{labelForKind(it.kind)}</b> • cat: <b>{it.category}</b>
                  {it.username ? (
                    <>
                      {" "}
                      • par <b>{it.username}</b>
                    </>
                  ) : null}
                  {targetLabel ? (
                    <>
                      {" "}
                      • cible <b>{targetLabel}</b>
                    </>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Pill tone={it.kind === "feedback" ? "brand" : "neutral"}>
                  {it.kind === "feedback" ? "feedback" : "report"}
                </Pill>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {it.status === "open" ? (
                  <button
                    className="btnGhostSmall"
                    type="button"
                    onClick={() => setStatusAndRefresh(it.id, "closed")}
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(34,197,94,0.30)",
                      background: "rgba(34,197,94,0.10)",
                    }}
                    title="Marquer comme traité"
                  >
                    ✅ Traité
                  </button>
                ) : (
                  <button
                    className="btnGhostSmall"
                    type="button"
                    onClick={() => setStatusAndRefresh(it.id, "open")}
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(245,158,11,0.30)",
                      background: "rgba(245,158,11,0.10)",
                    }}
                    title="Réouvrir"
                  >
                    ♻️ Réouvrir
                  </button>
                )}

                <button className="btnSecondary" type="button" onClick={() => openDetails(it.id)} title="Ouvrir le détail">
                  Détails
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && !busy ? (
          <div className="mutedSmall" style={{ padding: "12px 0", opacity: 0.85 }}>
            Aucun élément.
          </div>
        ) : null}
      </div>

      <Drawer
        open={openId != null}
        onClose={() => {
          setOpenId(null);
          setDetail(null);
          setDetailErr(null);
        }}
        title={
          <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            🧾 Report #{openId ?? "—"}
            {detail?.kind ? (
              <Pill tone={detail.kind === "feedback" ? "brand" : "neutral"}>{labelForKind(detail.kind)}</Pill>
            ) : null}
            {detail?.status ? <Pill tone={toneForStatus(detail.status) as any}>{detail.status}</Pill> : null}
            {detail?.category ? (
              <Pill tone="neutral">
                cat: <b>{detail.category}</b>
              </Pill>
            ) : null}
          </span>
        }
      >
        {detailErr ? <div className="hint">⚠️ {detailErr}</div> : null}
        {detailBusy && !detail ? <div className="mutedSmall">Chargement…</div> : null}

        {detail ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 8 }}>Résumé</div>
              <div className="mutedSmall" style={{ lineHeight: 1.6 }}>
                Créé: <b>{detail.createdAt ? new Date(detail.createdAt).toLocaleString("fr-FR") : "—"}</b>
                <br />
                Auteur: <b>{detail.username ?? "—"}</b> {detail.userId ? <span className="mutedSmall">#{detail.userId}</span> : null}
                <br />
                Cible:{" "}
                <b>
                  {detail.target?.username
                    ? `@${detail.target.username}`
                    : detail.target?.slug
                    ? detail.target.slug
                    : "—"}
                </b>
                {detail.target?.url ? (
                  <>
                    <br />
                    URL: <span title={detail.target.url}>{detail.target.url}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 8 }}>Sujet</div>
              <div style={{ fontWeight: 900 }}>{detail.subject || "(sans sujet)"}</div>

              <div style={{ height: 10 }} />

              <div style={{ fontWeight: 950, marginBottom: 8 }}>Description</div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{detail.description || "—"}</div>
            </div>

            {Array.isArray(detail.attachments) && detail.attachments.length > 0 ? (
              <div
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 950, marginBottom: 10 }}>Images ({detail.attachments.length})</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {detail.attachments.slice(0, 12).map((a, i) => {
                    const src = a.url || a.dataUrl || "";
                    if (!src) return null;
                    return (
                      <a
                        key={i}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          width: 160,
                          height: 118,
                          borderRadius: 14,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.03)",
                          display: "block",
                        }}
                        title={a.name}
                      >
                        <img src={src} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
              {detail.status === "open" ? (
                <button className="btnPrimary" type="button" onClick={() => setStatusAndRefresh(detail.id, "closed")} disabled={detailBusy}>
                  ✅ Marquer traité
                </button>
              ) : (
                <button className="btnSecondary" type="button" onClick={() => setStatusAndRefresh(detail.id, "open")} disabled={detailBusy}>
                  ♻️ Réouvrir
                </button>
              )}

              <button
                className="btnGhostSmall"
                type="button"
                onClick={() => setStatusAndRefresh(detail.id, "deleted")}
                disabled={detailBusy}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(239,68,68,0.30)",
                  background: "rgba(239,68,68,0.10)",
                }}
                title="Masquer / supprimer (soft)"
              >
                🗑️ Supprimer
              </button>

              <button
                className="btnGhostSmall"
                type="button"
                onClick={() => deleteAndClose(detail.id)}
                disabled={detailBusy}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(239,68,68,0.38)",
                  background: "rgba(239,68,68,0.14)",
                }}
                title="Suppression définitive (si endpoint DELETE actif)"
              >
                ☠️ Delete hard
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
