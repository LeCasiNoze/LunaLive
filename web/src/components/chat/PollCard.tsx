// Carte "Sondage" du chat LunaLive : vote gratuit, modifiable jusqu'à la fin.
// L'état vient du serveur (poll:update) ; myChoice est propre au viewer.
import * as React from "react";
import "./pollCard.css";

export type PollState = {
  id: number;
  question: string;
  options: string[];
  counts: number[];
  total: number;
  endsAtMs: number;
  status: "open" | "closed";
  myChoice: number | null;
};

export function pollFromPayload(p: any, previous?: PollState): PollState | null {
  const id = Number(p?.id ?? p?.pollId);
  if (!id || !Array.isArray(p?.options)) return null;
  const options = p.options.map(String);
  const counts = Array.isArray(p.counts) ? options.map((_: string, i: number) => Number(p.counts[i] ?? 0)) : options.map(() => 0);
  return {
    id,
    question: String(p.question ?? previous?.question ?? ""),
    options,
    counts,
    total: Number(p.total ?? counts.reduce((a: number, b: number) => a + b, 0)),
    endsAtMs: Number(p.endsAtMs ?? previous?.endsAtMs ?? 0),
    status: p.status === "closed" ? "closed" : "open",
    // le broadcast ne contient pas le vote du viewer : on garde le sien
    myChoice: p.myChoice != null ? Number(p.myChoice) : previous?.myChoice ?? null,
  };
}

function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function PollCard({
  poll,
  onVote,
  readOnly = false,
}: {
  poll: PollState | null;
  onVote?: (choice: number) => Promise<void> | void;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = React.useState<number | null>(null);
  const live = !!poll && poll.status === "open" && poll.endsAtMs > Date.now();
  const now = useNow(live);
  if (!poll) return <div className="llpoll llpoll--done">Sondage terminé</div>;

  const remaining = poll.endsAtMs - now;
  const open = poll.status === "open" && remaining > 0;
  const top = Math.max(0, ...poll.counts);
  const canVote = open && !readOnly && !!onVote;

  const vote = async (choice: number) => {
    if (!canVote || busy != null || choice === poll.myChoice) return;
    setBusy(choice);
    try { await onVote!(choice); } finally { setBusy(null); }
  };

  return (
    <div className={`llpoll${open ? "" : " llpoll--closed"}`}>
      <div className="llpoll__head">
        <span className="llpoll__badge">📊 Sondage</span>
        <span className={`llpoll__time${open && remaining < 15000 ? " llpoll__time--hot" : ""}`}>
          {open ? fmt(remaining) : "Terminé"}
        </span>
      </div>
      <div className="llpoll__q">{poll.question}</div>
      <div className="llpoll__opts">
        {poll.options.map((label, i) => {
          const choice = i + 1;
          const count = poll.counts[i] ?? 0;
          const pct = poll.total > 0 ? Math.round((count / poll.total) * 100) : 0;
          const mine = poll.myChoice === choice;
          const winner = !open && poll.total > 0 && count === top;
          const Tag = canVote ? "button" : "div";
          return (
            <Tag
              key={i}
              type={canVote ? "button" : undefined}
              className={`llpoll__opt${mine ? " is-mine" : ""}${winner ? " is-winner" : ""}${busy === choice ? " is-busy" : ""}`}
              onClick={canVote ? () => void vote(choice) : undefined}
              aria-pressed={canVote ? mine : undefined}
            >
              <span className="llpoll__fill" style={{ width: `${pct}%` }} />
              <span className="llpoll__num">{choice}</span>
              <span className="llpoll__label">{label}</span>
              <span className="llpoll__pct">
                {winner ? "👑 " : mine ? "✓ " : ""}{pct}%
              </span>
            </Tag>
          );
        })}
      </div>
      <div className="llpoll__foot">
        {poll.total} vote{poll.total > 1 ? "s" : ""}
        {open ? (canVote ? " · Tu peux changer ton vote" : "") + ` · Rumble : !1 à !${poll.options.length}` : ""}
      </div>
    </div>
  );
}
