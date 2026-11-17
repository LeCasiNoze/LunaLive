import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken } from "../lib/http";
import "./BelvaTournamentPage.css";

// Tournoi du samedi de Belva : bracket en direct (public) et corrections des gains (staff LunaLive).
const API = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type Leg = { a: number | null; b: number | null };
type Match = { key: string; round: number; idx: number; a: string | null; b: string | null; bestOf: number; legs: Leg[]; winsA: number; winsB: number; winner: string | null; loser: string | null; status: string };
type Player = { discordId: string; name: string; rumble: string | null; slot: string; image: string | null; bonus: string; multiplier: number | null; betCents: number | null };
type State = {
  tournament: { id: number; title: string; status: string; buyCents: number; drawAt: string | null; champion: string | null; version: number };
  players: Record<string, Player>;
  bracket: { size: number; rounds: number; matches: Match[]; current: { key: string; leg: number; side: "a" | "b"; player: string } | null; champion: string | null; places: Record<string, number> } | null;
} | null;

const eur = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " €");
const roundName = (r: number, n: number) => (r === n ? "Finale" : r === n - 1 ? "Demi-finales" : r === n - 2 ? "Quarts" : r === n - 3 ? "Huitièmes" : `Tour ${r}`);
const who = (p?: Player) => (p ? p.rumble ?? p.name : "À venir");

// Démo (?demo=1 bracket en cours, ?demo=open inscriptions) : données d'exemple, rien n'est lu ni écrit en base.
const DEMO_SLOTS = [["Wanted Dead or a Wild", "Duel at Dawn", "Mise_Max"], ["Fruit Party", "Free Spins", "Lucky_Léo"], ["Le Bandit", "Luck of the Bandit", "Spin_Sam"],
  ["Sugar Rush 1000", "Free Spins", "Tilt_Zéro"], ["Gates of Olympus", "Free Spins", "Bonus_Hunter"], ["Chaos Crew", "Bonus", "Zeus_Kid"], ["RIP City", "Bounty", "Max_Win"], ["Dog House", "Free Spins", "Spinz"]];
async function demoState(mode: string): Promise<State> {
  const players: Record<string, Player> = {};
  await Promise.all(DEMO_SLOTS.map(async ([slot, bonus, who], i) => {
    const r = await fetch(`${API}/api/public/slots/search?q=${encodeURIComponent(slot)}&limit=1`).then((x) => x.json()).catch(() => null);
    players[`p${i}`] = { discordId: `p${i}`, name: who, rumble: who, slot, image: r?.items?.[0]?.imageUrl ?? null, bonus, multiplier: 100, betCents: 120 };
  }));
  const tournament = { id: 0, title: "Tournoi du samedi 6 décembre", status: mode === "open" ? "open" : "live", buyCents: 12000, drawAt: new Date(Date.now() + 2 * 86400e3 + 5400e3).toISOString(), champion: null, version: 1 };
  if (mode === "open") return { tournament, players, bracket: null };
  const M = (key: string, round: number, idx: number, a: string | null, b: string | null, legs: Leg[], winner: string | null, status: string, bestOf = 1): Match =>
    ({ key, round, idx, a, b, bestOf, legs, winsA: winner === a && a ? 1 : 0, winsB: winner === b && b ? 1 : 0, winner, loser: winner ? (winner === a ? b : a) : null, status });
  const matches = [
    M("1-0", 1, 0, "p0", "p4", [{ a: 24500, b: 8000 }], "p0", "done"), M("1-1", 1, 1, "p1", "p5", [{ a: 0, b: 0 }, { a: 31200, b: 45600 }], "p5", "done"),
    M("1-2", 1, 2, "p2", "p6", [{ a: 18750, b: null }], null, "live"), M("1-3", 1, 3, "p3", "p7", [], null, "ready"),
    M("2-0", 2, 0, "p0", "p5", [], null, "waiting"), M("2-1", 2, 1, null, null, [], null, "waiting"), M("3-0", 3, 0, null, null, [], null, "waiting", 3),
  ];
  return { tournament, players, bracket: { size: 8, rounds: 3, matches, current: { key: "1-2", leg: 0, side: "b", player: "p6" }, champion: null, places: { p4: 5, p1: 5 } } };
}


function useCountdown(to: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!to) return null;
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d ? `${d} j ` : ""}${String(h).padStart(2, "0")} h ${String(m).padStart(2, "0")} min ${String(s % 60).padStart(2, "0")} s`;
}

function Side({ p, legs, side, win, playing }: { p?: Player; legs: Leg[]; side: "a" | "b"; win: boolean; playing: boolean }) {
  return (
    <div className={`bt-side ${win ? "is-win" : ""} ${playing ? "is-playing" : ""}`}>
      {p?.image ? <img src={p.image} alt={p.slot} loading="lazy" /> : <div className="bt-noimg">🎰</div>}
      <div className="bt-who">
        <strong>{who(p)}</strong>
        <span>{p ? `${p.slot} · ${p.bonus}` : "En attente"}</span>
      </div>
      <div className="bt-gains">{legs.map((l, i) => <b key={i}>{eur(l[side])}</b>)}</div>
    </div>
  );
}

function StaffEditor({ m, onSave }: { m: Match; onSave: (legs: Leg[]) => Promise<void> }) {
  const [rows, setRows] = useState<{ a: string; b: string }[]>(() => (m.legs.length ? m.legs : [{ a: null, b: null }]).map((l) => ({ a: l.a === null ? "" : String(l.a / 100), b: l.b === null ? "" : String(l.b / 100) })));
  const [busy, setBusy] = useState(false);
  const toCents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(",", ".")) * 100));
  return (
    <div className="bt-edit">
      {rows.map((r, i) => (
        <div key={i} className="bt-edit-row">
          <input inputMode="decimal" value={r.a} placeholder="gain A €" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
          <input inputMode="decimal" value={r.b} placeholder="gain B €" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} />
        </div>
      ))}
      <div className="bt-edit-actions">
        <button onClick={() => setRows([...rows, { a: "", b: "" }])}>+ manche</button>
        <button className="bt-save" disabled={busy} onClick={async () => { setBusy(true); await onSave(rows.map((r) => ({ a: toCents(r.a), b: toCents(r.b) }))); setBusy(false); }}>Enregistrer</button>
      </div>
    </div>
  );
}

export default function BelvaTournamentPage() {
  const [state, setState] = useState<State>(null);
  const [staff, setStaff] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const demo = new URLSearchParams(window.location.search).get("demo");
  const load = useCallback(async () => {
    if (demo) { setState(await demoState(demo)); return; }
    try {
      const r = await fetch(`${API}/api/public/belva/tournament`).then((x) => x.json());
      if (r?.ok) setState(r.state);
    } catch { setErr("Le serveur ne répond pas, nouvel essai dans quelques secondes."); }
  }, [demo]);
  useEffect(() => { load(); if (demo) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [load, demo]);
  useEffect(() => {
    const token = getToken(); if (!token) return;
    fetch(`${API}/api/belva/tournament/staff`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((r) => setStaff(!!r?.staff)).catch(() => {});
  }, []);
  const save = async (key: string, legs: Leg[]) => {
    const r = await fetch(`${API}/api/belva/tournament/legs`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ key, legs }) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setState(r.state); else setErr("Correction refusée : vérifie les montants.");
  };

  const t = state?.tournament, b = state?.bracket, ps = state?.players ?? {};
  const countdown = useCountdown(t?.status === "open" ? t.drawAt : null);
  const rounds = useMemo(() => (b ? Array.from({ length: b.rounds }, (_, i) => b.matches.filter((m) => m.round === i + 1)) : []), [b]);

  return (
    <main className="bt-page">
      <div className="bt-bg" aria-hidden />
      <header className="bt-head">
        <span className="bt-kicker">Belva × LeCasiNoze</span>
        <h1>{t?.title ?? "Tournoi du samedi"}</h1>
        {t && <p>Élimination directe · finale en 3 manches · {eur(t.buyCents)} par bonus · le plus gros gain passe</p>}
        {demo && <p className="bt-demo">Aperçu avec des données d’exemple</p>}
        {err && <p className="bt-err">{err}</p>}
      </header>

      {!t && <p className="bt-empty">Aucun tournoi pour l’instant.</p>}

      {t?.status === "open" && (
        <section className="bt-reg">
          <div className="bt-count"><span>Tirage du bracket dans</span><strong>{countdown ?? "bientôt"}</strong></div>
          <p className="bt-hint">Inscris-toi sur le Discord de Belva avec <code>/tournoi</code> + le nom de ta machine.</p>
          <div className="bt-reg-grid">
            {Object.values(ps).map((p) => (
              <div key={p.discordId} className="bt-reg-card">
                {p.image ? <img src={p.image} alt={p.slot} loading="lazy" /> : <div className="bt-noimg">🎰</div>}
                <strong>{p.slot}</strong><span>{p.bonus}</span><em>{who(p)}</em>
              </div>
            ))}
          </div>
        </section>
      )}

      {b && (
        <>
          {b.champion && (
            <section className="bt-champ">
              <span>🏆 Vainqueur</span><strong>{who(ps[b.champion])}</strong><em>{ps[b.champion]?.slot}</em>
            </section>
          )}
          <section className="bt-bracket">
            {rounds.map((ms, r) => (
              <div key={r} className="bt-round">
                <h2>{roundName(r + 1, b.rounds)}</h2>
                {ms.map((m) => {
                  const live = b.current?.key === m.key;
                  return (
                    <article key={m.key} className={`bt-match ${live ? "is-live" : ""} ${m.status}`}>
                      {m.status === "bye" ? (
                        <div className="bt-bye">{who(ps[m.a!])} · qualifié d’office</div>
                      ) : (
                        <>
                          <Side p={m.a ? ps[m.a] : undefined} legs={m.legs} side="a" win={!!m.winner && m.winner === m.a} playing={live && b.current?.side === "a"} />
                          <div className="bt-vs">{m.bestOf > 1 ? `${m.winsA} – ${m.winsB}` : "VS"}</div>
                          <Side p={m.b ? ps[m.b] : undefined} legs={m.legs} side="b" win={!!m.winner && m.winner === m.b} playing={live && b.current?.side === "b"} />
                          {staff && m.a && m.b && <StaffEditor key={`${m.key}-${t?.version}`} m={m} onSave={(legs) => save(m.key, legs)} />}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            ))}
          </section>
        </>
      )}
      <footer className="bt-foot">🔞 18+ · Les jeux d’argent comportent des risques. Joueurs Info Service : 09 74 75 13 13.</footer>
    </main>
  );
}
