// web/src/components/DailyWheelCard.tsx
import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getWheelState, type ApiWheelMe } from "../lib/api";
import { LoginModal } from "./LoginModal";
import { DailyWheelModal } from "./DailyWheelModal";

function isLeCasinoze(username?: string | null) {
  return String(username || "").trim().toLowerCase() === "lecasinoze";
}

export function DailyWheelCard() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const user = auth?.user ?? null;

  const god = isLeCasinoze(user?.username);

  const [loading, setLoading] = React.useState(false);
  const [canSpin, setCanSpin] = React.useState(false);
  const [segments, setSegments] = React.useState<ApiWheelMe["segments"] | undefined>(undefined);

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [wheelOpen, setWheelOpen] = React.useState(false);

  // ✅ solde "live" (mis à jour via l'event rubis:update)
  const [rubisLive, setRubisLive] = React.useState<number | null>(null);

  // init/reset quand user change
  React.useEffect(() => {
    if (!token) {
      setRubisLive(null);
      return;
    }
    const v = Number(user?.rubis ?? 0);
    if (Number.isFinite(v)) setRubisLive(v);
  }, [token, user?.rubis]);

  // écoute l'event global dispatché par DailyWheelModal
  React.useEffect(() => {
    const onRubisUpdate = (ev: any) => {
      const v = Number(ev?.detail?.rubis);
      if (Number.isFinite(v)) setRubisLive(v);
    };
    window.addEventListener("rubis:update", onRubisUpdate as any);
    return () => window.removeEventListener("rubis:update", onRubisUpdate as any);
  }, []);

  const refresh = React.useCallback(async () => {
    if (!token) {
      setCanSpin(false);
      setSegments(undefined);
      return;
    }
    setLoading(true);
    try {
      const r: any = await getWheelState(token);
      setCanSpin(god ? true : !!r?.canSpin);
      setSegments(Array.isArray(r?.segments) ? r.segments : undefined);
    } catch {
      setCanSpin(god ? true : false);
      setSegments(undefined);
    } finally {
      setLoading(false);
    }
  }, [token, god]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const subtitle = !token
    ? "Connecte-toi pour tourner"
    : loading
      ? "Chargement…"
      : canSpin
        ? "Prête"
        : "Déjà utilisée aujourd’hui";

  const displayRubis = Number(rubisLive ?? user?.rubis ?? 0);

  return (
    <>
      <div className="panel" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div className="panelTitle" style={{ marginBottom: 4 }}>
              🎡 Daily Wheel
            </div>
            <div className="mutedSmall">{subtitle}</div>
          </div>

          {token ? (
            <div className="pill" title="Solde rubis">
              💎 {displayRubis.toLocaleString()}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            className="btnPrimary"
            type="button"
            onClick={() => {
              if (!token) return setLoginOpen(true);
              if (!god && !canSpin) return;
              setWheelOpen(true);
            }}
            disabled={loading || (!god && token && !canSpin)}
          >
            {!token ? "Se connecter" : !god && !canSpin ? "Roue déjà utilisée" : "Faire tourner la roue"}
          </button>
        </div>
      </div>

      <DailyWheelModal
        open={wheelOpen}
        onClose={() => setWheelOpen(false)}
        canSpin={canSpin}
        segments={segments}
        onAfterSpin={refresh}
      />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
