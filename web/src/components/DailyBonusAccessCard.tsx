// web/src/components/DailyBonusAccessCard.tsx
import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getDailyBonusState, publicListContentTabs, type ApiPublicContentTab } from "../lib/api";
import { DailyBonusAgendaModal, type DailyBonusState } from "./DailyBonusAgendaModal";
import { UnreadBadge } from "./UnreadBadge";
import { contentVersionFromItem, isUnread } from "../lib/unread_seen";

type Role = "viewer" | "moderator" | "streamer" | "admin";

function roleRank(r: any): number {
  const v = String(r || "viewer").toLowerCase();
  if (v === "admin") return 3;
  if (v === "streamer") return 2;
  if (v === "moderator" || v === "mod") return 1;
  return 0; // viewer
}

function canSee(minRole: Role, userRole: any) {
  return roleRank(userRole) >= roleRank(minRole);
}

// version stable pour listing (updated_at)
function versionFromAnyItem(item: any) {
  return contentVersionFromItem({
    ...item,
    updatedAt: (item as any)?.updatedAt ?? (item as any)?.updated_at,
  } as any);
}

export function DailyBonusAccessCard() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const userRole: Role = String(auth?.user?.role || "viewer").toLowerCase() as any;

  const [unreadAny, setUnreadAny] = React.useState(false);

  const reloadUnread = React.useCallback(async () => {
    if (!token) {
      setUnreadAny(false);
      return;
    }
    try {
      const r: any = await publicListContentTabs();
      const items = Array.isArray(r?.items) ? (r.items as ApiPublicContentTab[]) : [];

      const visible = items.filter((it: any) => {
        const minRole = String(it?.min_role || "viewer").toLowerCase() as Role;
        return canSee(minRole, userRole);
      });

      const results = visible.map((it: any) => {
        const key = String(it?.key || "").trim();
        if (!key) return false;
        const v = versionFromAnyItem(it);
        return v ? isUnread(`content:${key}`, v) : false;
      });

      setUnreadAny(results.some(Boolean));
    } catch {
      setUnreadAny(false);
    }
  }, [token, userRole]);

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
        <DailyBonusAgendaModal state={state} onState={(s) => setState(s)} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}
