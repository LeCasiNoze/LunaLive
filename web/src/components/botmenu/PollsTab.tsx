// Onglet "Sondages" du bot : le streamer lance une question à N choix ;
// les viewers votent sur LunaLive (carte du chat) et sur Rumble (!1, !2…).
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import PollCard, { pollFromPayload, type PollState } from "../chat/PollCard";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

function uiToast(kind: "success" | "error" | "info", title: string, message?: string) {
  window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind, title, message } }));
}

const MAX_OPTIONS = 12;
const DURATIONS = [
  { sec: 60, label: "1 min" },
  { sec: 120, label: "2 min" },
  { sec: 180, label: "3 min" },
  { sec: 300, label: "5 min" },
  { sec: 600, label: "10 min" },
];

const REASONS: Record<string, string> = {
  question_required: "Écris une question.",
  two_options_min: "Il faut au moins deux choix.",
  too_many_options: `${MAX_OPTIONS} choix maximum.`,
  duplicate_options: "Deux choix sont identiques.",
  already_open: "Un sondage est déjà en cours.",
  prediction_active: "Une prédiction est en cours : attends la fin des paris.",
  forbidden: "Réservé au streamer.",
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(196,181,253,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#f5f2ff",
  font: "inherit",
  fontSize: 13,
};

export function PollsTab({
  token,
  slug,
  canMod,
  onRequireLogin,
}: {
  token: string | null;
  slug: string;
  canMod: boolean;
  onRequireLogin: () => void;
}) {
  const [poll, setPoll] = React.useState<PollState | null>(null);
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState<string[]>(["", ""]);
  const [duration, setDuration] = React.useState(120);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/api/bot/polls/current?streamerSlug=${encodeURIComponent(slug)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const j = await r.json();
      setPoll(j?.ok && j.poll ? pollFromPayload(j.poll) : null);
    } catch {
      /* garde l'état affiché */
    }
  }, [slug, token]);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [load]);

  async function post(path: string, body: any) {
    if (!token) { onRequireLogin(); return null; }
    const r = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return r.json().catch(() => ({ ok: false }));
  }

  async function create() {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 3) return uiToast("error", "Sondage", "Question trop courte.");
    if (opts.length < 2) return uiToast("error", "Sondage", REASONS.two_options_min);
    setBusy(true);
    try {
      const r = await post("/api/bot/polls/create", { streamerSlug: slug, question: question.trim(), options: opts, durationSec: duration });
      if (!r) return;
      if (!r.ok) return uiToast("error", "Sondage", REASONS[r.reason] || "Impossible de lancer le sondage.");
      uiToast("success", "Sondage", "Sondage lancé");
      setQuestion("");
      setOptions(["", ""]);
      setPoll(pollFromPayload(r.poll));
    } catch {
      uiToast("error", "Sondage", "Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setBusy(true);
    try {
      const r = await post("/api/bot/polls/close", { streamerSlug: slug });
      if (r && !r.ok) uiToast("error", "Sondage", REASONS[r.reason] || "Impossible de terminer le sondage.");
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function vote(choice: number) {
    if (!poll) return;
    const r = await post("/api/bot/polls/vote", { streamerSlug: slug, pollId: poll.id, choice });
    if (r?.ok && r.poll) setPoll(pollFromPayload(r.poll));
    else if (r) uiToast("error", "Sondage", r.reason === "poll_closed" ? "Le sondage est terminé." : "Vote refusé.");
  }

  const open = !!poll && poll.status === "open" && poll.endsAtMs > Date.now();

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, color: "#f5f2ff" }}>
      {poll ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <PollCard poll={poll} onVote={vote} />
          {canMod && open ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void close()}
              style={{
                alignSelf: "flex-end", padding: "7px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 12,
                border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.12)", color: "#fecaca",
              }}
            >
              Terminer maintenant
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, opacity: 0.7 }}>Aucun sondage en cours.</div>
      )}

      {canMod && !open ? (
        <div
          style={{
            display: "flex", flexDirection: "column", gap: 9, padding: 12, borderRadius: 14,
            border: "1px solid rgba(196,181,253,0.12)", background: "rgba(255,255,255,0.025)",
          }}
        >
          <div style={{ fontWeight: 850, fontSize: 13 }}>Nouveau sondage</div>
          <input
            style={input}
            value={question}
            maxLength={200}
            placeholder="Question (ex. Quelle machine ensuite ?)"
            onChange={(e) => setQuestion(e.target.value)}
          />
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 22, textAlign: "center", fontWeight: 900, fontSize: 12, opacity: 0.75 }}>{i + 1}</span>
              <input
                style={input}
                value={o}
                maxLength={80}
                placeholder={`Choix ${i + 1}`}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {options.length > 2 ? (
                <button
                  type="button"
                  aria-label={`Retirer le choix ${i + 1}`}
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  style={{ flex: "0 0 auto", padding: 7, borderRadius: 9, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#c4b5fd" }}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          ))}
          {options.length < MAX_OPTIONS ? (
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, ""])}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 10,
                cursor: "pointer", fontWeight: 800, fontSize: 12, border: "1px dashed rgba(196,181,253,0.3)", background: "transparent", color: "#c4b5fd",
              }}
            >
              <Plus size={14} /> Ajouter un choix
            </button>
          ) : null}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DURATIONS.map((d) => (
              <button
                key={d.sec}
                type="button"
                onClick={() => setDuration(d.sec)}
                style={{
                  padding: "6px 10px", borderRadius: 999, cursor: "pointer", fontWeight: 800, fontSize: 11.5,
                  border: `1px solid ${duration === d.sec ? "rgba(125,211,252,0.6)" : "rgba(255,255,255,0.1)"}`,
                  background: duration === d.sec ? "rgba(56,189,248,0.16)" : "transparent",
                  color: duration === d.sec ? "#e0f2fe" : "#91889f",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            style={{
              padding: "10px 12px", borderRadius: 11, cursor: "pointer", fontWeight: 900, fontSize: 13, color: "#fff",
              border: "1px solid rgba(125,211,252,0.45)", background: "linear-gradient(135deg,rgba(56,189,248,.35),rgba(139,92,246,.35))",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Lancer le sondage
          </button>
          <div style={{ fontSize: 11, opacity: 0.6 }}>
            Les viewers votent sur LunaLive et sur Rumble avec !1, !2… Ils peuvent changer d'avis jusqu'à la fin.
          </div>
        </div>
      ) : null}
    </div>
  );
}
