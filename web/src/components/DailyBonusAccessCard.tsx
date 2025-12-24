import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getDailyBonusState } from "../lib/api";
import { DailyBonusAgendaModal, type DailyBonusState } from "./DailyBonusAgendaModal";

export function DailyBonusAccessCard() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const [state, setState] = React.useState<DailyBonusState | null>(null);
  const [open, setOpen] = React.useState(false);
  const [opening, setOpening] = React.useState(false);

  const openAgenda = React.useCallback(async () => {
    if (!token) return;

    if (state?.ok) {
      setOpen(true);
      return;
    }

    setOpening(true);
    try {
      const s = await getDailyBonusState(token);
      if (s?.ok) setState(s as any);
      setOpen(true);
    } catch (e) {
      console.error(e);
      // si tu veux, on pourra afficher un toast ici plus tard
    } finally {
      setOpening(false);
    }
  }, [token, state]);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div className="panelTitle" style={{ marginBottom: 0 }}>
            Bonus quotidien
          </div>
          <div className="mutedSmall" style={{ opacity: 0.8 }}>
            Agenda hebdo + paliers mensuels
          </div>
        </div>

        <button
          type="button"
          className="btnPrimarySmall"
          onClick={openAgenda}
          disabled={!token || opening}
          title={!token ? "Connecte-toi pour accéder à l’agenda" : undefined}
        >
          {opening ? "…" : "Ouvrir"}
        </button>
      </div>

      {open && state?.ok ? (
        <DailyBonusAgendaModal
          state={state}
          onState={(s) => setState(s)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
