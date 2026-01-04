// web/src/pages/streamer/tabs/AgendaTab.tsx
import * as React from "react";
import { getStreamerAgenda, putStreamerAgenda, type AgendaRule } from "../../../lib/api_streamer_tabs";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function frDayLabel(d: Date) {
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return days[d.getDay()];
}

function timeToMin(s: string) {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return hh * 60 + mm;
}

function clampColor(c: string) {
  const s = String(c || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return s;
  return "#8b5cf6";
}

function emptyRule(): AgendaRule {
  const d = new Date();
  return {
    kind: "regular",
    title: "Stream",
    color: "#8b5cf6",
    dayOfWeek: d.getDay(),
    startTime: "21:00",
    endTime: "23:00",
  };
}

export function AgendaTab({
  slug,
  token,
  canEdit,
}: {
  slug: string;
  token: string | null;
  canEdit: boolean;
}) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [edit, setEdit] = React.useState(false);
  const [rules, setRules] = React.useState<AgendaRule[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await getStreamerAgenda(slug);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      setRules(Array.isArray(r.rules) ? r.rules : []);
    } catch (e: any) {
      setError(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    setEdit(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function updateRule(i: number, patch: Partial<AgendaRule>) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRule(i: number) {
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const payload = rules.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: String(r.title || "").trim().slice(0, 80) || "Stream",
        color: clampColor(r.color),
        dayOfWeek: r.kind === "regular" ? Number(r.dayOfWeek ?? 0) : null,
        date: r.kind === "event" ? String(r.date || "").trim() || null : null,
        startTime: String(r.startTime || "00:00").trim(),
        endTime: String(r.endTime || "00:00").trim(),
      }));

      const rr = await putStreamerAgenda(slug, token, payload);
      if (!("ok" in rr) || !rr.ok) throw new Error((rr as any)?.error || "Erreur");
      setEdit(false);
      await load();
    } catch (e: any) {
      setError(String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  const next7 = React.useMemo(() => {
    const out: Date[] = [];
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(d0);
      d.setDate(d0.getDate() + i);
      out.push(d);
    }
    return out;
  }, []);

  const occurrences = React.useMemo(() => {
    const byDay: Record<string, Array<AgendaRule & { _special?: boolean }>> = {};
    for (const d of next7) {
      const ymd = toLocalYMD(d);
      const dow = d.getDay();

      const arr: Array<AgendaRule & { _special?: boolean }> = [];
      for (const r of rules) {
        if (r.kind === "regular" && Number(r.dayOfWeek) === dow) {
          arr.push({ ...r, _special: false });
        } else if (r.kind === "event" && String(r.date || "") === ymd) {
          arr.push({ ...r, _special: true });
        }
      }
      arr.sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
      byDay[ymd] = arr;
    }
    return byDay;
  }, [next7, rules]);

  const legend = React.useMemo(() => {
    const reg = new Map<string, string>(); // title -> color
    const ev = new Map<string, string>();
    for (const r of rules) {
      const t = String(r.title || "").trim();
      if (!t) continue;
      if (r.kind === "regular") reg.set(t, clampColor(r.color));
      else ev.set(t, clampColor(r.color));
    }
    return {
      regular: Array.from(reg.entries()).map(([title, color]) => ({ title, color })),
      event: Array.from(ev.entries()).map(([title, color]) => ({ title, color })),
    };
  }, [rules]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="panelTitle">Agenda (7 jours)</div>
        {canEdit ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!edit ? (
              <button type="button" className="btnGhostSmall" onClick={() => setEdit(true)}>
                Modifier
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btnGhostSmall"
                  disabled={saving}
                  onClick={() => {
                    setEdit(false);
                    load();
                  }}
                >
                  Annuler
                </button>
                <button type="button" className="btnPrimarySmall" disabled={saving || !token} onClick={save}>
                  {saving ? "…" : "Enregistrer"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mutedSmall" style={{ marginTop: 8, color: "rgba(255,90,90,0.95)" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mutedSmall" style={{ marginTop: 10 }}>
          Chargement…
        </div>
      ) : null}

      {!loading && !edit ? (
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
          <div className="panel" style={{ flex: 1, minWidth: 320, padding: 14, borderRadius: 16 }}>
            <div className="mutedSmall" style={{ marginBottom: 10, opacity: 0.85 }}>
              Prochains 7 jours
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {next7.map((d) => {
                const ymd = toLocalYMD(d);
                const arr = occurrences[ymd] || [];
                return (
                  <div key={ymd} style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 950 }}>
                        {frDayLabel(d)} {pad2(d.getDate())}/{pad2(d.getMonth() + 1)}
                      </div>
                      <div className="mutedSmall" style={{ opacity: 0.8 }}>
                        {arr.length ? `${arr.length} slot${arr.length > 1 ? "s" : ""}` : "—"}
                      </div>
                    </div>

                    {arr.length ? (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        {arr.map((r, i) => (
                          <div
                            key={(r.id ?? i) + "_" + ymd}
                            style={{
                              borderRadius: 12,
                              padding: "10px 10px",
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.03)",
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              borderLeft: `6px solid ${clampColor(r.color)}`,
                            }}
                          >
                            <div style={{ minWidth: 86, fontWeight: 950 }}>
                              {r.startTime}–{r.endTime}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 950, display: "flex", gap: 8, alignItems: "center" }}>
                                {r._special ? <span title="Événement">⭐</span> : <span title="Régulier">🟣</span>}
                                <span>{r.title}</span>
                              </div>
                              <div className="mutedSmall" style={{ opacity: 0.8, marginTop: 2 }}>
                                {r._special ? "Événement (date précise)" : "Régulier (hebdo)"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8 }}>
                        Rien de prévu.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel" style={{ width: 320, padding: 14, borderRadius: 16 }}>
            <div style={{ fontWeight: 950 }}>Légende</div>

            <div style={{ marginTop: 12 }}>
              <div className="mutedSmall" style={{ opacity: 0.8, marginBottom: 6 }}>
                Réguliers
              </div>
              {legend.regular.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {legend.regular.map((x) => (
                    <div key={"r_" + x.title} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          background: x.color,
                          display: "inline-block",
                          border: "1px solid rgba(255,255,255,0.15)",
                        }}
                      />
                      <span style={{ fontWeight: 900 }}>{x.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mutedSmall" style={{ opacity: 0.8 }}>
                  —
                </div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="mutedSmall" style={{ opacity: 0.8, marginBottom: 6 }}>
                Événements
              </div>
              {legend.event.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {legend.event.map((x) => (
                    <div key={"e_" + x.title} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          background: x.color,
                          display: "inline-block",
                          border: "1px solid rgba(255,255,255,0.15)",
                        }}
                      />
                      <span style={{ fontWeight: 900 }}>{x.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mutedSmall" style={{ opacity: 0.8 }}>
                  —
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && edit ? (
        <div style={{ marginTop: 12 }}>
          <div className="panel" style={{ padding: 14, borderRadius: 16 }}>
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              Règles (réguliers) + événements (date précise). C’est ça qui nourrit l’affichage “7 jours”.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {rules.map((r, i) => (
                <div key={r.id ?? i} style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={r.kind}
                      onChange={(e) => updateRule(i, { kind: e.target.value as any })}
                      style={{
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontWeight: 900,
                      }}
                    >
                      <option value="regular">Régulier</option>
                      <option value="event">Événement</option>
                    </select>

                    <input
                      value={String(r.title ?? "")}
                      onChange={(e) => updateRule(i, { title: e.target.value })}
                      placeholder="Nom"
                      style={{
                        flex: 1,
                        minWidth: 200,
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontWeight: 900,
                      }}
                    />

                    <input
                      value={String(r.color ?? "")}
                      onChange={(e) => updateRule(i, { color: e.target.value })}
                      placeholder="#8b5cf6"
                      style={{
                        width: 120,
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontWeight: 900,
                      }}
                    />

                    <input
                      type="time"
                      value={String(r.startTime ?? "00:00")}
                      onChange={(e) => updateRule(i, { startTime: e.target.value })}
                      style={{
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontWeight: 900,
                      }}
                    />

                    <input
                      type="time"
                      value={String(r.endTime ?? "00:00")}
                      onChange={(e) => updateRule(i, { endTime: e.target.value })}
                      style={{
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontWeight: 900,
                      }}
                    />
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {r.kind === "regular" ? (
                      <select
                        value={Number(r.dayOfWeek ?? 0)}
                        onChange={(e) => updateRule(i, { dayOfWeek: Number(e.target.value), date: null })}
                        style={{
                          padding: "10px 10px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.25)",
                          color: "white",
                          fontWeight: 900,
                        }}
                      >
                        <option value={0}>Dimanche</option>
                        <option value={1}>Lundi</option>
                        <option value={2}>Mardi</option>
                        <option value={3}>Mercredi</option>
                        <option value={4}>Jeudi</option>
                        <option value={5}>Vendredi</option>
                        <option value={6}>Samedi</option>
                      </select>
                    ) : (
                      <input
                        type="date"
                        value={String(r.date ?? "")}
                        onChange={(e) => updateRule(i, { date: e.target.value, dayOfWeek: null })}
                        style={{
                          padding: "10px 10px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.25)",
                          color: "white",
                          fontWeight: 900,
                        }}
                      />
                    )}

                    <button type="button" className="btnGhostSmall" onClick={() => removeRule(i)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" className="btnGhostSmall" onClick={() => setRules((p) => [...p, emptyRule()])}>
                + Ajouter une règle
              </button>
            </div>

            {!token ? (
              <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                Connecte-toi pour enregistrer.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
