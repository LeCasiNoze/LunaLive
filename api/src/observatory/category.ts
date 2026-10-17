// Pure category discovery extracted from rumble.ts; no DB, relay, HLS or bot imports.
export type CategoryLive = {
  username: string;
  videoId: string;
  videoIdNumeric: string | null;
  viewersCount: number | null;
  title: string | null;
  thumbnailUrl: string | null;
  videoUrl: string;
  profileUrl: string;
  followers: number;
  followersKnown?: boolean;
  createdAt: string | null;
};
export type CategoryPage = {
  lives: Map<string, CategoryLive>;
  itemCount: number;
  limit: number;
  hasMore?: boolean;
};
export function parseRumbleCategoryLives(html: string): CategoryPage {
  const gridStart = html.indexOf("<rum-videos-grid");
  if (gridStart < 0) throw new Error("rumble_category_grid_missing");
  const gridEnd = html.indexOf(">", gridStart);
  if (gridEnd < 0) throw new Error("rumble_category_grid_unclosed");
  const gridTag = html.slice(gridStart, gridEnd + 1).replaceAll("&amp;", "&");
  if (
    !/collection=["']category\.videos["']/i.test(gridTag) ||
    !/filter=["'][^"']*category=gambling-slots[^"']*video_type=live/i.test(
      gridTag,
    )
  ) {
    throw new Error("rumble_category_grid_unexpected");
  }
  const limit = Math.max(
    1,
    Math.min(100, Number(gridTag.match(/\blimit=["'](\d+)["']/i)?.[1] || 24)),
  );
  const scriptStart = html.indexOf(
    '<script type="application/json">',
    gridStart,
  );
  if (scriptStart < 0) throw new Error("rumble_category_json_missing");
  const jsonStart = html.indexOf(">", scriptStart) + 1;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  if (jsonEnd < 0) throw new Error("rumble_category_json_unclosed");
  const payload = JSON.parse(html.slice(jsonStart, jsonEnd)) as {
    items?: unknown;
  };
  if (!Array.isArray(payload.items))
    throw new Error("rumble_category_items_missing");
  return normalizeCategoryItems(payload.items as any[], limit);
}
export function parsePublicCategoryJson(
  payload: any,
  limit = 24,
): CategoryPage {
  const items = payload?.data?.items ?? payload?.data?.videos;
  if (!Array.isArray(items) || typeof payload?.data?.has_more !== "boolean")
    throw new Error("category_public_contract");
  return {
    ...normalizeCategoryItems(items, limit),
    hasMore: payload.data.has_more,
  };
}
function normalizeCategoryItems(items: any[], limit: number): CategoryPage {
  const lives = new Map<string, CategoryLive>();
  for (const item of items) {
    if (item?.object_type !== "video" || item?.live !== true) continue;
    const profilePath = String(item?.by?.relative_url || "");
    const username =
      profilePath.split("/").filter(Boolean).at(-1) ||
      String(item?.by?.name || "");
    const videoId = String(item?.permalink_id || "").toLowerCase();
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(username) ||
      !/^v[a-z0-9]{5,20}$/i.test(videoId)
    )
      throw new Error("category_live_identity_invalid");
    const viewers =
      typeof item?.watching_now === "number" ||
      (typeof item?.watching_now === "string" &&
        /^\d+$/.test(item.watching_now))
        ? Number(item.watching_now)
        : NaN;
    const rawFollowers = item?.by?.followers;
    const followers = (typeof rawFollowers === 'number' || (typeof rawFollowers === 'string' && /^\d+$/.test(rawFollowers))) ? Number(rawFollowers) : NaN;
    lives.set(username.toLowerCase(), {
      username,
      videoId,
      videoIdNumeric: /^\d+$/.test(String(item?.id ?? ""))
        ? String(item.id)
        : null,
      viewersCount:
        Number.isFinite(viewers) && viewers >= 0
          ? Math.max(0, Math.round(viewers))
          : null,
      title: typeof item?.title === "string" ? item.title : null,
      thumbnailUrl: typeof item?.thumb === "string" ? item.thumb : null,
      videoUrl:
        typeof item?.url === "string"
          ? item.url
          : `https://rumble.com/${videoId}.html`,
      profileUrl:
        typeof item?.by?.url === "string"
          ? item.by.url
          : `https://rumble.com/user/${username}`,
      followers: Number.isFinite(followers)
        ? Math.max(0, Math.round(followers))
        : 0,
      followersKnown: Number.isSafeInteger(followers) && followers >= 0,
      createdAt:
        typeof item?.live_streamed_on === "string"
          ? item.live_streamed_on
          : null,
    });
  }
  return { lives, itemCount: items.length, limit };
}

export async function fetchPublicCategoryPage(
  page: number,
  onBytes: (n: number) => void = () => {},
): Promise<CategoryPage> {
  if (!Number.isInteger(page) || page < 1 || page > 100)
    throw new Error("category_page_range");
  const limit = 24,
    url = new URL("https://rumble.com/service.php");
  for (const [key, value] of Object.entries({
    api: "7",
    name: "category.videos",
    category: "gambling-slots",
    video_type: "live",
    limit: String(limit),
    offset: String((page - 1) * limit),
    options: "video.full",
  }))
    url.searchParams.set(key, value);
  const r = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { accept: "application/json" },
  });
  if (!r.ok || !r.body) {
    await r.body?.cancel();
    throw new Error("category_public_http_" + r.status);
  }
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of r.body as any) {
    size += chunk.length;
    onBytes(chunk.length);
    if (size > 2097152) throw new Error("category_public_size");
    chunks.push(chunk);
  }
  return parsePublicCategoryJson(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
    limit,
  );
}
