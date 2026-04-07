// web/src/pages/streamer/hooks/useStreamerData.ts
import * as React from "react";
import { enablePushNotifications } from "../../../lib/push";
import { followStreamer, getStreamer, setFollowNotify, unfollowStreamer } from "../../../lib/api";

export type StreamerNormalized = {
  raw: any;
  title: string;
  displayName: string;
  isLive: boolean;
  viewers: number;
  channelSlug: string | null;
  channelUsername: string | null;
  offlineBgUrl: string | null;
  liveStartedAtMs: number | null;
  ownerUserId: number;

  // ✅ SUBS owner
  ownerHasViewerSub: boolean;
  ownerHasStreamerSub: boolean;

  // HOST
  hostTargetSlug: string | null;
  hostTargetDisplayName: string | null;
  hostTargetIsLive: boolean;

  // Rumble fields (LeCasiNoze support)
  rumbleHlsUrl: string | null;
  rumbleThumbnailUrl: string | null;
  rumbleStaticVideoUrl: string | null;

  // Platform info (temporaire pour LeCasiNoze)
  platform: "dlive" | "rumble" | null;
  rumbleEmbedUrl: string | null;
};

// Fonction utilitaire pour déterminer automatiquement la plateforme
function getPlatform(streamer: any): "dlive" | "rumble" | null {
  // Si le champ platform est explicitement défini, l'utiliser (pour compatibilité)
  if (streamer?.platform) {
    return streamer.platform === "rumble" ? "rumble" : "dlive";
  }
  
  // NOUVELLE LOGIQUE : Priorité DLive enabled > Rumble disponible > Inactif
  // Si le streamer a une connexion DLive active et enabled, utiliser DLive
  if (streamer?.dliveConnection?.enabled && streamer?.dliveConnection?.channelSlug) {
    return "dlive";
  }
  
  // Si le streamer a une connexion Rumble disponible, utiliser Rumble
  if (streamer?.rumbleConnection?.username || streamer?.rumbleEmbedUrl || streamer?.rumble_embed_url) {
    return "rumble";
  }
  
  // Ancienne logique de compatibilité (si pas de nouvelles structures)
  // Si le streamer a une chaîne DLive liée (channelSlug), utiliser DLive
  if (streamer?.channelSlug || streamer?.channel_slug) {
    return "dlive";
  }
  
  // Si le streamer a une URL Rumble embed configurée, utiliser Rumble
  if (streamer?.rumbleEmbedUrl || streamer?.rumble_embed_url) {
    return "rumble";
  }
  
  // Par défaut, si aucune plateforme n'est détectée, retourner null (inactif)
  return null;
}

function normalizeStreamer(response: any): StreamerNormalized {
  const s = response?.streamer || response;

  const liveStartedAtRaw = s?.liveStartedAt ?? s?.live_started_at ?? null;
  const liveStartedAtMs = liveStartedAtRaw ? new Date(liveStartedAtRaw).getTime() : null;

  // ✅ owner id robuste (c’est ça qui débloque le bouton "Ouvrir coffre")
  const ownerRaw =
    s?.ownerUserId ??
    s?.owner_user_id ??
    s?.user_id ??
    s?.userId ??
    s?.user?.id ??
    s?.owner?.id ??
    response?.ownerUserId ??
    response?.owner_user_id ??
    response?.user_id ??
    response?.userId ??
    0;

  // ✅ HOST fields (API renvoie camelCase)
  const hostTargetSlug = (s?.hostTargetSlug ?? s?.host_target_slug) || null;
  const hostTargetDisplayName = (s?.hostTargetDisplayName ?? s?.host_target_display_name) || null;
  const hostTargetIsLive = !!(s?.hostTargetIsLive ?? s?.host_target_is_live);
  const subsRaw =
    s?.user?.user_subscriptions ??
    s?.user?.subscriptions ??
    s?.user_subscriptions ??
    response?.user?.user_subscriptions ??
    [];

  const subs = Array.isArray(subsRaw) ? subsRaw : [];

  const isSubActive = (x: any) => {
    const status = String(x?.status || "").toLowerCase();
    if (status === "active" || status === "trialing") return true;

    // fallback: si t’as pas status fiable, check end date
    const end = x?.current_period_end ?? x?.currentPeriodEnd ?? null;
    if (end) return new Date(end).getTime() > Date.now();

    return false;
  };

  const ownerHasViewerSub = subs.some(
    (x: any) => String(x?.plan_code ?? x?.planCode ?? "").toLowerCase() === "viewer" && isSubActive(x)
  );

  const ownerHasStreamerSub = subs.some(
    (x: any) => String(x?.plan_code ?? x?.planCode ?? "").toLowerCase() === "streamer" && isSubActive(x)
  );

  return {
    raw: s,
    title: String(s?.title || "Stream"),
    displayName: String(s?.display_name ?? s?.displayName ?? ""),
    isLive: !!(s?.is_live ?? s?.isLive),
    viewers: Number(s?.viewers ?? s?.watchingCount ?? 0),
    channelSlug: (s?.channel_slug ?? s?.channelSlug) || null,
    channelUsername: (s?.channel_username ?? s?.channelUsername) || null,
    offlineBgUrl: (s?.offlineBgUrl ?? s?.offline_bg_url) || null,
    liveStartedAtMs,
    ownerUserId: Number(ownerRaw || 0),

    hostTargetSlug: hostTargetSlug ? String(hostTargetSlug) : null,
    hostTargetDisplayName: hostTargetDisplayName ? String(hostTargetDisplayName) : null,
    hostTargetIsLive: !!hostTargetIsLive,
    ownerHasViewerSub,
    ownerHasStreamerSub,

    // Rumble fields (LeCasiNoze support)
    rumbleHlsUrl: (s?.rumbleHlsUrl ?? s?.rumble_hls_url) || null,
    rumbleThumbnailUrl: (s?.rumbleThumbnailUrl ?? s?.rumble_thumbnail_url) || null,
    rumbleStaticVideoUrl: (s?.rumbleStaticVideoUrl ?? s?.rumble_static_video_url) || null,

    // Platform info (temporaire pour LeCasiNoze)
    platform: getPlatform(s),
    rumbleEmbedUrl: (s?.rumbleEmbedUrl ?? s?.rumble_embed_url) || null,
  };
}

export function useStreamerData(slug: string | null | undefined, token: string | null, onRequireLogin: () => void) {
  const [loading, setLoading] = React.useState(true);
  const [streamer, setStreamer] = React.useState<StreamerNormalized | null>(null);

  const [isFollowing, setIsFollowing] = React.useState(false);
  const [notifyEnabled, setNotifyEnabled] = React.useState(false);
  const [followsCount, setFollowsCount] = React.useState<number | null>(null);

  const [followLoading, setFollowLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        if (!slug) return;

        const r = await getStreamer(String(slug), token);
        if (!mounted) return;
        setStreamer(normalizeStreamer(r));

        const following = !!(r?.isFollowing ?? false);
        setIsFollowing(following);

        setFollowsCount(typeof r?.followsCount === "number" ? Number(r.followsCount) : null);

        if (typeof r?.notifyEnabled === "boolean") setNotifyEnabled(Boolean(r.notifyEnabled));
        else setNotifyEnabled(following ? true : false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [slug, token]);

  const toggleFollow = React.useCallback(async () => {
    if (!token) return onRequireLogin();
    if (!slug) return;

    setFollowLoading(true);
    try {
      const r = isFollowing ? await unfollowStreamer(String(slug), token) : await followStreamer(String(slug), token);
      if (r?.ok) {
        const followingNow = !!r.following;
        setIsFollowing(followingNow);
        setFollowsCount(Number(r.followsCount));
        if (typeof r.notifyEnabled === "boolean") setNotifyEnabled(Boolean(r.notifyEnabled));
        else setNotifyEnabled(followingNow ? true : false);
      }
    } finally {
      setFollowLoading(false);
    }
  }, [token, slug, isFollowing, onRequireLogin]);

  const toggleNotify = React.useCallback(async () => {
    if (!token) return onRequireLogin();
    if (!slug) return;

    const next = !notifyEnabled;

    if (next) {
      try {
        await enablePushNotifications(token);
      } catch {
        setNotifyEnabled(false);
        return;
      }
    }

    setNotifyEnabled(next);
    try {
      const r = await setFollowNotify(String(slug), next, token);
      if (typeof r?.notifyEnabled === "boolean") setNotifyEnabled(Boolean(r.notifyEnabled));
    } catch {
      setNotifyEnabled((x) => !x);
    }
  }, [token, slug, notifyEnabled, onRequireLogin]);

  return {
    loading,
    streamer,
    followsCount,
    setFollowsCount,
    isFollowing,
    notifyEnabled,
    followLoading,
    toggleFollow,
    toggleNotify,
  };
}
