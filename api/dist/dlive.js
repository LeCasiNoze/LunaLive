const ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
function esc(s) {
    // évite d'injecter des guillemets dans la query
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}
async function gql(query) {
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
    if (!r.ok)
        throw new Error(`dlive_gql_http_${r.status}`);
    return (await r.json());
}
export async function fetchDliveLiveInfo(displayname) {
    const dn = esc(displayname);
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
    }
    catch (e) {
        // ✅ FIX: demander username aussi
        const queryLite = `query{
      userByDisplayName(displayname:"${dn}") {
        username
        livestream { title }
      }
    }`;
        const j = await gql(queryLite);
        const u = j?.data?.userByDisplayName;
        const ls = u?.livestream || null;
        return {
            username: typeof u?.username === "string" ? u.username : null,
            isLive: !!ls,
            watchingCount: null,
            title: typeof ls?.title === "string" ? ls.title : null,
            thumbnailUrl: null,
        };
    }
}
