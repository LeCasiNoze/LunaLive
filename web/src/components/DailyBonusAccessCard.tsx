import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getDailyBonusState, publicGetContent } from "../lib/api";
import { DailyBonusAgendaModal, type DailyBonusState } from "./DailyBonusAgendaModal";
import { UnreadBadge } from "./UnreadBadge";
import { contentVersionFromItem, isUnread } from "../lib/unread_seen";

export function DailyBonusAccessCard() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const CONTENT_KEYS = ["daily_bonus_infos", "guide_viewer", "guide_streamer"] as const;

  const [unreadAny, setUnreadAny] = React.useState(false);

  const reloadUnread = React.useCallback(async () => {
    if (!token) {
      setUnreadAny(false);
      return;
    }
    try {
      const results = await Promise.all(
        CONTENT_KEYS.map(async (k) => {
          const r: any = await publicGetContent(k);
          const item = r?.item ?? null;
          if (!item) return false;
          const v = contentVersionFromItem(item);
          return isUnread(`content:${k}`, v);
        })
      );
      setUnreadAny(results.some(Boolean));
    } catch {
      setUnreadAny(false);
    }
  }, [token]);

  // load initial + token change
  React.useEffect(() => {
    reloadUnread();
  }, [reloadUnread]);

  // refresh instant quand la modale marque "vu"
  React.useEffect(() => {
    const onSeen = () => reloadUnread();
    window.addEventListener("ll:content-seen", onSeen as any);

    const onStorage = () => reloadUnread();
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("ll:content-seen", onSeen as any);
      window.removeEventListener("storage", onStorage);
    };
  }, [reloadUnread]);

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
            Bonus quotidien <UnreadBadge show={unreadAny} title="Nouveautés à lire" />
          </div>
          <div className="mutedSmall" style={{ opacity: 0.8 }}>
            {token ? (unreadAny ? "Nouveautés disponibles" : "") : "Connecte-toi pour voir l’agenda"}
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
