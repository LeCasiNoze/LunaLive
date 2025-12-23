// web/src/pages/streamer/hooks/useChest.ts
import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { chestDeposit, chestJoin, chestOpen, getStreamerChest } from "../../../lib/api";

type ChestOpening = {
  id: string;
  status: "open" | "closed" | "canceled";
  opensAt: string;
  closesAt: string;
  minWatchMinutes: number;
  participantsCount: number;
  joined?: boolean;
};

export type ChestState = {
  ok: true;
  streamerId: number;
  balance: number;
  breakdown: Record<string, number>;
  opening: null | ChestOpening;
};

function humanChestError(code: string, extra?: any) {
  switch (code) {
    case "owner_forbidden":
      return "Le streamer ne peut pas participer à son propre coffre.";
    case "no_opening":
      return "Aucun coffre n'est ouvert actuellement.";
    case "opening_closed":
      return "Trop tard : le coffre est déjà fermé.";
    case "stream_offline":
      return "Le stream est offline.";
    case "not_watching":
      return "Tu dois être sur le stream (en direct) pour participer.";
    case "need_watchtime":
      return `Watchtime insuffisant (${extra?.watchedMinutes ?? "?"}/${extra?.minWatchMinutes ?? "?"} min).`;
    default:
      return code || "Erreur";
  }
}

function humanDepositError(code: string) {
  switch (code) {
    case "bad_amount":
      return "Montant invalide.";
    case "insufficient_funds":
      return "Solde insuffisant.";
    case "lots_missing":
      return "Aucun lot de rubis disponible (rubis_lots).";
    case "forbidden":
      return "Interdit (tu n'es pas owner côté API).";
    default:
      return code || "Erreur dépôt";
  }
}

export function useChest(opts: {
  slug: string | null | undefined;
  token: string | null;
  apiBase: string;
  isOwner: boolean;
  isLive: boolean;
  onRequireLogin: () => void;
}) {
  const { slug, token, apiBase, isOwner, isLive, onRequireLogin } = opts;

  const CHEST_DURATION_SEC = 120;
  const CHEST_MIN_WATCH_MIN = 5;

  const [chest, setChest] = React.useState<ChestState | null>(null);
  const [chestLoading, setChestLoading] = React.useState(false);
  const [chestError, setChestError] = React.useState<string | null>(null);

  const [chestModalOpen, setChestModalOpen] = React.useState(false);

  const [joinedOpeningId, setJoinedOpeningId] = React.useState<string | null>(null);
  const [joinLoading, setJoinLoading] = React.useState(false);
  const [ownerLoading, setOwnerLoading] = React.useState(false);

  const [depositAmount, setDepositAmount] = React.useState<string>("100");
  const [depositNote, setDepositNote] = React.useState<string>("");
  const [depositLoading, setDepositLoading] = React.useState(false);

  const [toast, setToast] = React.useState<null | { openingId: string; closesAt?: string | null; minWatchMinutes?: number }>(
    null
  );
  const lastOpeningSeenRef = React.useRef<string | null>(null);

  const opening = chest?.opening ?? null;
  const openingId = opening?.id ? String(opening.id) : null;
  const chestBalance = Number(chest?.balance ?? 0);
  const chestHasOpen = !!openingId;
  const alreadyJoined = !!(openingId && joinedOpeningId && joinedOpeningId === openingId);
  const canJoinNow = !!openingId && !isOwner;

  // Countdown local
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!opening?.closesAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [opening?.closesAt]);

  const closesAtMs = opening?.closesAt ? new Date(opening.closesAt).getTime() : null;
  const remainingSec = closesAtMs ? Math.max(0, Math.ceil((closesAtMs - now) / 1000)) : 0;
  const progress = closesAtMs
    ? Math.max(0, Math.min(1, (closesAtMs - now) / (CHEST_DURATION_SEC * 1000)))
    : 0;

  const refreshChest = React.useCallback(async () => {
    if (!slug) return;
    setChestError(null);

    try {
      setChestLoading(true);
      const r = (await getStreamerChest(String(slug))) as any;
      if (r?.ok) {
        setChest(r as ChestState);

        const oid = r?.opening?.id ? String(r.opening.id) : null;

        // joined (si backend l'envoie un jour) + fallback local
        const joined = !!r?.opening?.joined;
        if (oid && joined) setJoinedOpeningId(oid);

        setJoinedOpeningId((prev) => {
          if (!oid) return null;
          if (prev && prev !== oid) return null;
          return prev;
        });
      }
    } catch (e: any) {
      setChestError(String(e?.message || "chest_failed"));
    } finally {
      setChestLoading(false);
    }
  }, [slug]);

  // initial load
  React.useEffect(() => {
    if (!slug) return;
    refreshChest();
  }, [slug, refreshChest]);

  // socket open/close => refresh + toast
  React.useEffect(() => {
    const sSlug = String(slug || "").trim();
    if (!sSlug) return;

    const slugLower = sSlug.toLowerCase();
    let socket: Socket | null = null;

    try {
      socket = io(apiBase, {
        transports: ["websocket", "polling"],
        withCredentials: false,
        auth: token ? { token } : {},
      });

      socket.on("chest:open", (payload: any) => {
        const evSlug = String(payload?.slug || "").trim().toLowerCase();
        if (!evSlug || evSlug !== slugLower) return;

        refreshChest();

        const oid = String(payload?.openingId || payload?.opening?.id || "");
        if (oid && lastOpeningSeenRef.current !== oid) {
          lastOpeningSeenRef.current = oid;
          setToast({
            openingId: oid,
            closesAt: payload?.closesAt ? String(payload.closesAt) : null,
            minWatchMinutes: Number(payload?.minWatchMinutes || CHEST_MIN_WATCH_MIN),
          });
        }
      });

      socket.on("chest:close", (payload: any) => {
        const evSlug = String(payload?.slug || "").trim().toLowerCase();
        if (!evSlug || evSlug !== slugLower) return;
        refreshChest();
        setToast(null);
        setJoinedOpeningId(null);
      });
    } catch {}

    return () => {
      try {
        socket?.disconnect();
      } catch {}
    };
  }, [slug, token, apiBase, refreshChest]);

  // auto-hide toast
  React.useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 12_000);
    return () => window.clearTimeout(t);
  }, [toast?.openingId]);

  const join = React.useCallback(async () => {
    setChestError(null);
    if (!token) return onRequireLogin();
    if (!slug) return;

    setJoinLoading(true);
    try {
      const r: any = await chestJoin(String(slug), token);
      if (r?.ok) {
        setJoinedOpeningId(openingId || r.openingId || null);
        setToast(null);
        await refreshChest();
        return;
      }
      setChestError(humanChestError(String(r?.error || "join_failed"), r));
    } catch (e: any) {
      setChestError(humanChestError(String(e?.message || "join_failed"), e));
    } finally {
      setJoinLoading(false);
    }
  }, [token, slug, onRequireLogin, openingId, refreshChest]);

  const open = React.useCallback(async () => {
    setChestError(null);
    if (!token) return onRequireLogin();
    if (!slug) return;

    // streamer ne ferme pas => fermeture auto via jobs
    if (!isLive) {
      setChestError("Le stream est offline.");
      return;
    }

    setOwnerLoading(true);
    try {
      const r: any = await chestOpen(String(slug), token, CHEST_DURATION_SEC, CHEST_MIN_WATCH_MIN);
      if (r?.ok) {
        await refreshChest();
        setChestModalOpen(false);
      } else {
        setChestError(humanChestError(String(r?.error || "open_failed")));
      }
    } catch (e: any) {
      setChestError(String(e?.message || "open_failed"));
    } finally {
      setOwnerLoading(false);
    }
  }, [token, slug, onRequireLogin, isLive, refreshChest]);

  const deposit = React.useCallback(async () => {
    setChestError(null);
    if (!token) return onRequireLogin();
    if (!slug) return;

    const amt = Math.floor(Number(depositAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      setChestError("Montant invalide.");
      return;
    }

    setDepositLoading(true);
    try {
      await chestDeposit(String(slug), token, amt, depositNote.trim() || null);
      await refreshChest();
    } catch (e: any) {
      setChestError(humanDepositError(String(e?.message || "deposit_failed")));
    } finally {
      setDepositLoading(false);
    }
  }, [token, slug, onRequireLogin, depositAmount, depositNote, refreshChest]);

  return {
    chest,
    chestLoading,
    chestError,
    setChestError,

    chestModalOpen,
    setChestModalOpen,

    toast,
    setToast,

    opening,
    openingId,
    chestBalance,
    chestHasOpen,
    canJoinNow,
    alreadyJoined,

    remainingSec,
    progress,

    joinedOpeningId,
    setJoinedOpeningId,

    joinLoading,
    ownerLoading,

    depositAmount,
    setDepositAmount,
    depositNote,
    setDepositNote,
    depositLoading,

    refreshChest,
    join,
    open,
    deposit,
  };
}
