// web/src/lib/api_streamer_clips.ts

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}
export type ApiTopClip = ApiClip & {
  streamerDisplayName: string;
  ownerUserId: number | null;
  avatarUrl: string | null;
};

export type GetTopClipsResp = {
  ok: boolean;
  total: number;
  clips: ApiTopClip[];
};

export type ApiClip = {
  id: number;
  streamerSlug: string;

  title: string | null;
  createdAtMs: number;

  // lecture
  vodUrl: string | null;     // m3u8
  startSec: number;          // début du clip (at - pre)
  durationSec: number;       // pre + post

  // preview (pris ~1min dans le clip)
  thumbUrl: string | null;

  // social
  likesCount: number;
  myLiked: boolean;
};

export type ApiPageInfo = {
  endCursor: string | null;
  hasNextPage: boolean;
};

export type GetStreamerClipsResp = {
  ok: boolean;
  clips: ApiClip[];
  pageInfo: ApiPageInfo;
  error?: string;
};

async function getJson<T>(url: string, token?: string | null): Promise<T> {
  const r = await fetch(`${apiBase()}${url}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j && j.ok === false)) {
    const reason = (j && (j.error || j.reason)) || `http_${r.status}`;
    throw new Error(String(reason));
  }
  return j as T;
}

async function postJson<T>(url: string, body: any, token?: string | null): Promise<T> {
  const r = await fetch(`${apiBase()}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j && j.ok === false)) {
    const reason = (j && (j.error || j.reason)) || `http_${r.status}`;
    throw new Error(String(reason));
  }
  return j as T;
}

/**
 * Public list (viewer OK).
 * sort: "recent" | "top"
 */
export async function getStreamerClips(
  slug: string,
  cursor: string | null,
  limit: number,
  sort: "recent" | "top",
  token?: string | null
) {
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  qs.set("limit", String(Math.max(1, Math.min(50, Number(limit || 24)))));
  qs.set("sort", sort);

  return await getJson<GetStreamerClipsResp>(
    `/streamers/${encodeURIComponent(String(slug))}/clips?${qs.toString()}`,
    token
  );
}

/**
 * Toggle like (auth required).
 * Retour attendu: { ok:true, likesCount:number, myLiked:boolean }
 */
export async function toggleClipLike(clipId: number, like: boolean, token: string) {
  return await postJson<{ ok: true; likesCount: number; myLiked: boolean }>(
    `/clips/${encodeURIComponent(String(clipId))}/like`,
    { like: !!like },
    token
  );
}

/**
 * Delete clip from streamer page list (owner/admin).
 * IMPORTANT: ce delete doit aussi retirer du module bot (côté API).
 */
export async function deleteStreamerClip(clipId: number, token: string) {
  return await postJson<{ ok: true; removed: boolean }>(
    `/clips/${encodeURIComponent(String(clipId))}/delete`,
    {},
    token
  );
}
export async function getTopClips(range: "month" | "30d", limit: number, token?: string | null) {
  const qs = new URLSearchParams();
  qs.set("range", range);
  qs.set("limit", String(Math.max(1, Math.min(50, Number(limit || 24)))));

  return await getJson<GetTopClipsResp>(`/clips/top?${qs.toString()}`, token);
}
