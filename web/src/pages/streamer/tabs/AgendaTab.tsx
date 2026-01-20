// web/src/pages/streamer/tabs/AgendaTab.tsx
import * as React from "react";
import {
  getStreamerAgenda,
  putStreamerAgenda,
  getStreamerAgendaMySubs,
  subscribeStreamerAgenda,
  unsubscribeStreamerAgenda,
  type AgendaRule,
} from "../../../lib/api_streamer_tabs";
import { enablePushNotifications } from "../../../lib/push"; // adapte le chemin exact

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

const COLOR_PRESETS = [
  { name: "Violet", color: "#8b5cf6" },
  { name: "Bleu", color: "#3b82f6" },
  { name: "Cyan", color: "#06b6d4" },
  { name: "Vert", color: "#22c55e" },
  { name: "Jaune", color: "#eab308" },
  { name: "Orange", color: "#f97316" },
  { name: "Rouge", color: "#ef4444" },
  { name: "Rose", color: "#ec4899" },
] as const;

function ensurePresetColor(c: string) {
  const s = String(c || "").trim().toLowerCase();
  const found = COLOR_PRESETS.find((p) => p.color.toLowerCase() === s);
  return found ? found.color : COLOR_PRESETS[0].color;
}

function emptyRule(): AgendaRule {
  const d = new Date();
  return {
    kind: "regular",
    title: "Stream",
    color: COLOR_PRESETS[0].color,
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

  // ✅ subscriptions (viewer)
  const [subsLoading, setSubsLoading] = React.useState(false);
  const [mySubs, setMySubs] = React.useState<Set<number>>(new Set());

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

  async function loadSubs() {
    if (!token) {
      setMySubs(new Set());
      return;
    }
    setSubsLoading(true);
    try {
      const r = await getStreamerAgendaMySubs(slug, token);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      const ids = Array.isArray((r as any).ruleIds) ? (r as any).ruleIds : [];
      setMySubs(new Set(ids.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n))));
    } catch {
      // silencieux : pas bloquant pour l’agenda
      setMySubs(new Set());
    } finally {
      setSubsLoading(false);
    }
  }

  React.useEffect(() => {
    setEdit(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  React.useEffect(() => {
    loadSubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  function updateRule(i: number, patch: Partial<AgendaRule>) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function setKind(i: number, kind: "regular" | "event") {
    // ✅ fix bug: switch kind doit forcer un état valide (sinon DB_ERROR à l’enregistrement)
    const now = new Date();
    const today = toLocalYMD(now);
    const dow = now.getDay();

    setRules((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        if (kind === "event") {
          return {
            ...r,
            kind: "event",
            date: String(r.date || "").trim() || today,
            dayOfWeek: null,
          };
        }
        return {
          ...r,
          kind: "regular",
          dayOfWeek: Number.isFinite(Number(r.dayOfWeek)) ? Number(r.dayOfWeek) : dow,
          date: null,
        };
      })
    );
  }

  function removeRule(i: number) {
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const today = toLocalYMD(new Date());

      const payload = rules.map((r) => {
        const kind = r.kind;
        const color = ensurePresetColor(r.color);

        const base = {
          id: r.id,
          kind,
          title: String(r.title || "").trim().slice(0, 80) || "Stream",
          color,
          startTime: String(r.startTime || "00:00").trim(),
          endTime: String(r.endTime || "00:00").trim(),
        };

        if (kind === "event") {
          const d = String(r.date || "").trim() || today; // ✅ jamais vide
          return { ...base, date: d, dayOfWeek: null };
        }

        const dow = Number(r.dayOfWeek);
        return { ...base, dayOfWeek: Number.isFinite(dow) ? dow : 0, date: null };
      });

      const rr = await putStreamerAgenda(slug, token, payload);
      if (!("ok" in rr) || !rr.ok) throw new Error((rr as any)?.error || "Erreur");

      setEdit(false);
      await load();
      // (optionnel) reload subs, au cas où des rule.id changent
      await loadSubs();
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

  // ✅ Légende = ce qui est réellement affiché dans les 7 jours (donc plus d’event “passé” qui traine)
  const legend = React.useMemo(() => {
    const reg = new Map<string, string>();
    const ev = new Map<string, string>();

    for (const d of next7) {
      const ymd = toLocalYMD(d);
      const arr = occurrences[ymd] || [];
      for (const r of arr) {
        const t = String(r.title || "").trim();
        if (!t) continue;
        const c = ensurePresetColor(r.color);
        if (r._special) ev.set(t, c);
        else reg.set(t, c);
      }
    }

    return {
      regular: Array.from(reg.entries()).map(([title, color]) => ({ title, color })),
      event: Array.from(ev.entries()).map(([title, color]) => ({ title, color })),
    };
  }, [next7, occurrences]);

  async function toggleSub(ruleId: number | null | undefined) {
    const rid = Number(ruleId);
    if (!token || !Number.isFinite(rid) || rid <= 0) return;

    const was = mySubs.has(rid);

    // optimiste
    setMySubs((prev) => {
      const n = new Set(prev);
      if (was) n.delete(rid);
      else n.add(rid);
      return n;
    });

    try {
      if (!was) {
        // ✅ s'assurer que le navigateur est prêt à recevoir
        await enablePushNotifications(token);
      }

      if (was) {
        const r = await unsubscribeStreamerAgenda(slug, token, rid);
        if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      } else {
        const r = await subscribeStreamerAgenda(slug, token, rid);
        if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      }
    } catch {
      // revert
      setMySubs((prev) => {
        const n = new Set(prev);
        if (was) n.add(rid);
        else n.delete(rid);
        return n;
      });
    }
  }

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

            {!token ? (
              <div className="mutedSmall" style={{ marginBottom: 10, opacity: 0.75 }}>
                Connecte-toi pour t’inscrire et recevoir une notif 10 minutes avant.
              </div>
            ) : null}

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
                        {arr.map((r, i) => {
                          const rid = Number(r.id);
                          const canSub = token && Number.isFinite(rid) && rid > 0;
                          const isSub = canSub ? mySubs.has(rid) : false;

                          return (
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
                                borderLeft: `6px solid ${ensurePresetColor(r.color)}`,
                              }}
                            >
                              <div style={{ minWidth: 86, fontWeight: 950 }}>
                                {r.startTime}–{r.endTime}
                              </div>

                              <div style={{ flex: 1, minWidth: 160 }}>
                                <div style={{ fontWeight: 950, display: "flex", gap: 8, alignItems: "center" }}>
                                  {r._special ? <span title="Événement">⭐</span> : <span title="Régulier">🟣</span>}
                                  <span>{r.title}</span>
                                </div>
                                <div className="mutedSmall" style={{ opacity: 0.8, marginTop: 2 }}>
                                  {r._special ? "Événement (date précise)" : "Régulier (hebdo)"}
                                </div>
                              </div>

                              {token ? (
                                <button
                                  type="button"
                                  className={isSub ? "btnPrimarySmall" : "btnGhostSmall"}
                                  disabled={!canSub || subsLoading}
                                  onClick={() => toggleSub(rid)}
                                  title="Recevoir une notif 10 minutes avant"
                                  style={{ whiteSpace: "nowrap" }}
                                >
                                  {isSub ? "Inscrit ✓" : "S’inscrire"}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
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
              Règles (réguliers) + événements (date précise). Palette de couleurs uniquement.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {rules.map((r, i) => (
                <div key={r.id ?? i} style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={r.kind}
                      onChange={(e) => setKind(i, e.target.value as any)}
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
                    <button
                      type="button"
                      className="btnGhostSmall"
                      onClick={() => removeRule(i)}
                      title="Supprimer cet événement/règle"
                      style={{ marginLeft: "auto" }}
                    >
                      Supprimer
                    </button>

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

                    {/* ✅ palette presets */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {COLOR_PRESETS.map((p) => {
                        const active = ensurePresetColor(r.color).toLowerCase() === p.color.toLowerCase();
                        return (
                          <button
                            key={p.color}
                            type="button"
                            className="btnGhostSmall"
                            onClick={() => updateRule(i, { color: p.color })}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              border: active ? "1px solid rgba(255,255,255,0.45)" : undefined,
                            }}
                            title={p.name}
                          >
                            <span
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 4,
                                background: p.color,
                                border: "1px solid rgba(255,255,255,0.15)",
                                display: "inline-block",
                              }}
                            />
                            <span style={{ fontWeight: 900 }}>{p.name}</span>
                          </button>
                        );
                      })}
                    </div>

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
