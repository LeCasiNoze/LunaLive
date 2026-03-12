const DLIVE_ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
function norm(s) {
    return String(s || "").trim();
}
async function gql(query, variables) {
    const r = await fetch(DLIVE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: variables ?? undefined }),
    });
    return await r.json();
}
/**
 * displayname/slug -> username immutable (dlive-xxxx)
 */
export async function resolveImmutableUsernameForDlive(displaynameOrUsername) {
    const displayname = norm(displaynameOrUsername);
    if (!displayname)
        return null;
    // 1) try displayname
    {
        const query = `
      query ($displayname: String!) {
        userByDisplayName(displayname: $displayname) { username displayname }
      }
    `;
        const j = await gql(query, { displayname });
        const u = j?.data?.userByDisplayName;
        const username = norm(u?.username);
        if (username)
            return username;
    }
    // 2) fallback username
    {
        const query = `
      query ($username: String!) {
        user(username: $username) { username displayname }
      }
    `;
        const j = await gql(query, { username: displayname });
        const u = j?.data?.user;
        const username = norm(u?.username);
        if (username)
            return username;
    }
    return null;
}
