// api/src/dlive.ts
type DliveLiveInfo = {
  username: string | null;
  isLive: boolean;
  watchingCount: number | null;
  title: string | null;
  thumbnailUrl: string | null;
};

const ENDPOINT =
  process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";

function esc(s: string) {
  // évite d'injecter des guillemets dans la query
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

async function gql(query: string) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      // headers "browser-like" (souvent nécessaires)
      origin: "https://dlive.tv",
      referer: "https://dlive.tv/",
    },
    body: JSON.stringify({ query }),
  });

  if (!r.ok) throw new Error(`dlive_gql_http_${r.status}`);
  return (await r.json()) as any;
}

export async function fetchDliveLiveInfo(displayname: string): Promise<DliveLiveInfo> {
  const dn = esc(displayname);

  // Query "riche" (watchingCount + thumbnail + title)
  const queryRich = `query{
    userByDisplayName(displayname:"${dn}") {
      username
      livestream {
        title
        thumbnailUrl
        watchingCount
      }
    }
  }`;

  try {
    const j = await gql(queryRich);
    const u = j?.data?.userByDisplayName;
    const ls = u?.livestream || null;

  return {
    username: typeof u?.username === "string" ? u.username : null,
    isLive: !!ls,
    watchingCount: typeof ls?.watchingCount === "number" ? ls.watchingCount : null,
    title: typeof ls?.title === "string" ? ls.title : null,
    thumbnailUrl: typeof ls?.thumbnailUrl === "string" ? ls.thumbnailUrl : null,
    };
  } catch (e) {
    // Fallback minimal (juste live/not live) — inspiré des impls publiques :contentReference[oaicite:1]{index=1}
    const queryLite = `query{
      userByDisplayName(displayname:"${dn}") {
        livestream { title }
      }
    }`;
    const j = await gql(queryLite);
    const ls = j?.data?.userByDisplayName?.livestream || null;

    return {
    username: typeof j?.data?.userByDisplayName?.username === "string"
        ? j.data.userByDisplayName.username
        : null,
    isLive: !!ls,
    watchingCount: null,
    title: null,
    thumbnailUrl: null,
    };
  }
}
