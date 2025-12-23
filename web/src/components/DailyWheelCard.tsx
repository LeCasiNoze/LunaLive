import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getMyWheel, type ApiWheelMe } from "../lib/api";
import { LoginModal } from "./LoginModal";
import { DailyWheelModal } from "./DailyWheelModal";

function isLeCasinoze(username?: string | null) {
  return String(username || "").trim().toLowerCase() === "lecasinoze";
}

export function DailyWheelCard() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const user = auth?.user ?? null;
  const refreshMe = auth?.refreshMe as undefined | (() => Promise<void>);

  const god = isLeCasinoze(user?.username);

  const [loading, setLoading] = React.useState(false);
  const [canSpin, setCanSpin] = React.useState(false);
  const [segments, setSegments] = React.useState<ApiWheelMe["segments"]>([]);

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [wheelOpen, setWheelOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!token) {
      setCanSpin(false);
      setSegments([]);
      return;
    }
    setLoading(true);
    try {
      const r = await getMyWheel(token);
      setSegments(Array.isArray((r as any)?.segments) ? (r as any).segments : []);
      setCanSpin(god ? true : !!(r as any)?.canSpin);
    } catch {
      setCanSpin(god ? true : false);
      setSegments([]);
    } finally {
      setLoading(false);
    }
  }, [token, god]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <div className="panel" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div className="panelTitle" style={{ marginBottom: 4 }}>
              🎡 Daily Wheel
            </div>
            <div className="mutedSmall">{loading ? "…" : canSpin ? "Prête" : "Déjà utilisée aujourd’hui"}</div>
          </div>

          <div className="pill" title="Solde rubis">
            💎 {Number(user?.rubis ?? 0).toLocaleString()}
          </div>
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
        onAfterSpin={async () => {
          // ✅ update le solde rubis tout de suite
          try {
            await refreshMe?.();
          } catch {}
          await refresh();
        }}
      />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
