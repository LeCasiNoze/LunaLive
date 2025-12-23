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
};

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
