// web/src/pages/dashboard/sections/bot/modules/BotWheelModule.tsx
import * as React from "react";
import { Shuffle, RotateCcw, Copy, X, Plus, Users, Eraser, Search } from "lucide-react";

type Entry = { username: string };

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

async function apiAuthed(token: string, path: string, init?: RequestInit) {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function BotWheelModule({ token }: { token: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const [tab, setTab] = React.useState<"enroll" | "wheel">("enroll");

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [entries, setEntries] = React.useState<Entry[]>([]);

  const [q, setQ] = React.useState("");
  const [addName, setAddName] = React.useState("");

  const [spinning, setSpinning] = React.useState(false);
  const [angle, setAngle] = React.useState(0);
  const [winner, setWinner] = React.useState<string | null>(null);
  const [showWinPopup, setShowWinPopup] = React.useState(false);

  const audioCtxRef = React.useRef<any>(null);
  const lastTickIndexRef = React.useRef<number | null>(null);

  function playTick() {
    try {
      const win = window as any;
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();

      const ctx: AudioContext = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.value = 850;

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // ignore
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiAuthed(token, "/bot_wheel/state");
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        setErr(String(j?.error || `Erreur API (${r.status})`));
        return;
      }

      setEnrollOpen(Boolean(j?.cfg?.enroll_open));
      const list = Array.isArray(j?.entries) ? j.entries : [];
      setEntries(list.map((e: any) => ({ username: String(e?.username || "") })));
    } catch (e: any) {
      setErr(String(e?.message || "Erreur réseau"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleEnroll(open: boolean) {
    setEnrollOpen(open);
    setErr(null);
    try {
      const r = await apiAuthed(token, "/bot_wheel/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ open }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) setErr(String(j?.error || `Erreur API (${r.status})`));
    } catch (e: any) {
      setErr(String(e?.message || "Erreur réseau"));
    }
  }

  async function addManual() {
    const name = addName.trim();
    if (!name) return;

    setErr(null);
    try {
      const r = await apiAuthed(token, "/bot_wheel/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErr(String(j?.error || `Erreur API (${r.status})`));
        return;
      }
      setAddName("");
      void load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur réseau"));
    }
  }

  async function removeEntry(name: string) {
    setErr(null);
    try {
      const r = await apiAuthed(token, "/bot_wheel/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErr(String(j?.error || `Erreur API (${r.status})`));
        return;
      }
      void load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur réseau"));
    }
  }

  async function clearAll() {
    if (!confirm("Vider toutes les inscriptions ?")) return;

    setErr(null);
    try {
      const r = await apiAuthed(token, "/bot_wheel/clear", { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErr(String(j?.error || `Erreur API (${r.status})`));
        return;
      }
      void load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur réseau"));
    }
  }

  function draw() {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const size = Math.min(760, window.innerWidth * 0.86);
    const W = (cvs.width = size);
    const H = (cvs.height = size);
    const cx = W / 2;
    const cy = H / 2;
    const r = W * 0.45;

    ctx.clearRect(0, 0, W, H);

    const N = Math.max(entries.length, 1);
    const a0 = angle;

    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
    ctx.fillStyle = "#080812";
    ctx.fill();

    for (let i = 0; i < N; i++) {
      const slice = (2 * Math.PI) / N;
      const a1 = a0 + i * slice;
      const a2 = a0 + (i + 1) * slice;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a1, a2);

      const hue = (i * 360) / N;
      ctx.fillStyle = `hsl(${hue} 80% 55% / 0.9)`;
      ctx.fill();

      const mid = (a1 + a2) / 2;
      const tx = cx + Math.cos(mid) * (r * 0.7);
      const ty = cy + Math.sin(mid) * (r * 0.7);
      const name = entries[i]?.username ?? "—";

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(mid + Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#050509";
      ctx.font = `${Math.max(12, Math.min(18, r * 0.07))}px Inter, system-ui, sans-serif`;
      ctx.fillText(name, 0, 6, r * 0.9);
      ctx.restore();
    }

    const pointerOuter = r + 32;
    const pointerInner = r + 4;
    const pointerHalf = 20;

    ctx.beginPath();
    ctx.moveTo(cx + pointerInner, cy);
    ctx.lineTo(cx + pointerOuter, cy - pointerHalf);
    ctx.lineTo(cx + pointerOuter, cy + pointerHalf);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#22c55e";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    if (winner) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, W, 48);
      ctx.fillStyle = "#fff";
      ctx.font = `bold 18px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`Gagnant: ${winner}`, W / 2, 30);
    }
  }

  React.useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, angle, winner, tab]);

  function resetWheel() {
    setAngle(0);
    setWinner(null);
    setShowWinPopup(false);
  }

  function copyWinner() {
    if (!winner) return;
    navigator.clipboard.writeText(winner).catch(() => {});
  }

  async function spin() {
    if (!entries.length || spinning) return;

    setSpinning(true);
    setWinner(null);
    setShowWinPopup(false);
    lastTickIndexRef.current = null;

    let targetIdx = Math.floor(Math.random() * entries.length);

    try {
      const r = await apiAuthed(token, "/bot_wheel/draw", { method: "POST" });
      const j = await r.json().catch(() => null);

      if (r.ok && j?.ok) {
        const winnerName = typeof j?.winner === "string" ? j.winner : null;
        const serverIdxRaw = typeof j?.index === "number" ? j.index : null;

        if (winnerName) {
          const idxByName = entries.findIndex(
            (e) => e.username.toLowerCase() === winnerName.toLowerCase()
          );
          if (idxByName >= 0) targetIdx = idxByName;
          else if (serverIdxRaw != null && serverIdxRaw >= 0 && serverIdxRaw < entries.length) {
            targetIdx = serverIdxRaw;
          }
        } else if (serverIdxRaw != null && serverIdxRaw >= 0 && serverIdxRaw < entries.length) {
          targetIdx = serverIdxRaw;
        }
      }
    } catch {
      // ignore
    }

    const N = entries.length;
    const slice = (2 * Math.PI) / N;
    const full = 2 * Math.PI;

    const baseTargetAngle = -(targetIdx + 0.5) * slice;
    const startAngle = angle;

    const mod2pi = (x: number) => {
      const m = x % full;
      return m < 0 ? m + full : m;
    };

    const deltaBase = mod2pi(baseTargetAngle - startAngle);
    const totalDelta = 3 * full + deltaBase;
    const endAngle = startAngle + totalDelta;

    const dur = rand(7000, 8000);
    const t0 = performance.now();

    const tick = (t: number) => {
      const elapsed = t - t0;
      const k = Math.min(1, elapsed / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const a = startAngle + (endAngle - startAngle) * e;

      const pointerPos = (((-a) % full) + full) % full;
      const currentIdx = Math.floor(pointerPos / slice);
      if (lastTickIndexRef.current === null || lastTickIndexRef.current !== currentIdx) {
        lastTickIndexRef.current = currentIdx;
        playTick();
      }

      setAngle(a);

      if (k < 1) {
        requestAnimationFrame(tick);
      } else {
        setSpinning(false);
        const w = entries[targetIdx]?.username || null;
        if (w) {
          setWinner(w);
          setShowWinPopup(true);
          setTimeout(() => setShowWinPopup(false), 2600);
        }
      }
    };

    requestAnimationFrame(tick);
  }

  const filtered = entries.filter((e) => e.username.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {err ? <div className="hint">⚠️ {err}</div> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btnGhostInline"
          onClick={() => setTab("enroll")}
          style={{
            borderRadius: 999,
            padding: "10px 12px",
            fontWeight: 950,
            border: tab === "enroll" ? "1px solid rgba(124,77,255,0.55)" : undefined,
          }}
        >
          Inscriptions
        </button>
        <button
          className="btnGhostInline"
          onClick={() => setTab("wheel")}
          style={{
            borderRadius: 999,
            padding: "10px 12px",
            fontWeight: 950,
            border: tab === "wheel" ? "1px solid rgba(124,77,255,0.55)" : undefined,
          }}
        >
          Roue / Tirage
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btnGhostInline" onClick={() => load()} disabled={loading}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {tab === "enroll" ? (
        <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: 14 }}>🎡 Bot Wheel — Inscriptions</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Ouvre/ferme les inscriptions + gère la liste.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={enrollOpen}
                  onChange={(e) => toggleEnroll(e.target.checked)}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 950,
                    color: enrollOpen ? "#22c55e" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {enrollOpen ? "Inscriptions OUVERTES" : "Inscriptions fermées"}
                </span>
              </label>

              <button
                className="btnGhostInline"
                onClick={() => clearAll()}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                <Eraser className="h-4 w-4" style={{ verticalAlign: "middle", marginRight: 6 }} />
                Vider
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  <Search className="h-4 w-4" style={{ verticalAlign: "middle", marginRight: 6 }} />
                  Rechercher
                </div>
                <input
                  className="input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher un pseudo…"
                  style={{ width: "100%", borderRadius: 14, padding: "10px 12px" }}
                />
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  <Plus className="h-4 w-4" style={{ verticalAlign: "middle", marginRight: 6 }} />
                  Ajouter manuellement
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Ajouter un pseudo"
                    style={{ width: "100%", borderRadius: 14, padding: "10px 12px" }}
                  />
                  <button
                    className="btnGhostInline"
                    onClick={() => addManual()}
                    style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>

            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ maxHeight: 340, overflow: "auto" }}>
                {filtered.map((e) => (
                  <div
                    key={e.username}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Users className="h-4 w-4" />
                      <span style={{ fontWeight: 900 }}>{e.username}</span>
                    </div>
                    <button
                      className="btnGhostInline"
                      onClick={() => removeEntry(e.username)}
                      style={{
                        borderRadius: 999,
                        padding: "8px 10px",
                        fontWeight: 950,
                        color: "#fb7185",
                        border: "1px solid rgba(251,113,133,0.25)",
                        background: "rgba(251,113,133,0.08)",
                      }}
                    >
                      <X className="h-4 w-4" style={{ verticalAlign: "middle" }} />
                    </button>
                  </div>
                ))}

                {filtered.length === 0 ? (
                  <div className="muted" style={{ padding: 14, fontSize: 12 }}>
                    Aucun inscrit.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="muted" style={{ fontSize: 12 }}>
              Total inscrits : <b>{entries.length}</b>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(260px, 1fr) 320px" }}>
          <div className="panel" style={{ padding: 12, borderRadius: 18, display: "flex", justifyContent: "center" }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "auto" }} />
          </div>

          <div className="panel" style={{ padding: 14, borderRadius: 18, display: "grid", gap: 10, alignContent: "start" }}>
            <div style={{ fontWeight: 950, fontSize: 14 }}>🎡 Tirage</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Lance la roue et copie le gagnant.
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btnGhostInline"
                onClick={() => spin()}
                disabled={spinning || entries.length === 0}
                style={{ flex: 1, borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                <Shuffle className="h-4 w-4" style={{ verticalAlign: "middle", marginRight: 6 }} />
                Lancer
              </button>

              <button
                className="btnGhostInline"
                onClick={() => resetWheel()}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                <RotateCcw className="h-4 w-4" style={{ verticalAlign: "middle", marginRight: 6 }} />
                Reset
              </button>
            </div>

            <button
              className="btnGhostInline"
              onClick={() => copyWinner()}
              disabled={!winner}
              style={{
                width: "100%",
                borderRadius: 14,
                padding: "10px 12px",
                fontWeight: 950,
                opacity: winner ? 1 : 0.6,
              }}
            >
              <Copy className="h-4 w-4" style={{ verticalAlign: "middle", marginRight: 6 }} />
              {winner ? `Copier: ${winner}` : "—"}
            </button>

            <div className="muted" style={{ fontSize: 12 }}>
              Inscriptions : <b>{entries.length}</b> • Enroll:{" "}
              <b style={{ color: enrollOpen ? "#22c55e" : "rgba(255,255,255,0.65)" }}>
                {enrollOpen ? "ouvert" : "fermé"}
              </b>
            </div>
          </div>

          {winner && showWinPopup ? (
            <div style={{ gridColumn: "1 / -1", pointerEvents: "none", display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  pointerEvents: "auto",
                  borderRadius: 18,
                  background: "rgba(0,0,0,0.80)",
                  border: "1px solid rgba(34,197,94,0.55)",
                  padding: "16px 18px",
                  boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(34,197,94,0.85)", fontWeight: 900, textAlign: "center" }}>
                  Gagnant 🎉
                </div>
                <div style={{ fontSize: 22, fontWeight: 950, textAlign: "center" }}>@{winner}</div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
