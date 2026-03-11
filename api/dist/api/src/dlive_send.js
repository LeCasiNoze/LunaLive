const GRAPHIGO_HTTP = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
function norm(s) {
    return String(s || "").trim();
}
function getAuthHeader() {
    const raw = String(process.env.DLIVE_BOT_AUTH || "").trim();
    if (!raw)
        throw new Error("DLIVE_BOT_AUTH missing");
    // Graphigo veut le JWT brut. Si quelqu’un a mis "Bearer xxx", on strip.
    return raw.replace(/^bearer\s+/i, "").trim();
}
export async function sendDliveChatMessage(opts) {
    const streamer = norm(opts.streamerImmutableUsername);
    const message = norm(opts.message).slice(0, 180);
    if (!streamer || !message)
        return false;
    const payload = {
        operationName: "SendStreamChatMessage",
        variables: {
            input: {
                streamer,
                message,
                roomRole: "Moderator",
                subscribing: true,
            },
        },
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: "848cbe91a57458ed402716e7b57b7a128c3b5a8385a6ebe14d9deff8d1eda73c",
            },
        },
    };
    try {
        const resp = await fetch(GRAPHIGO_HTTP, {
            method: "POST",
            headers: {
                accept: "*/*",
                authorization: getAuthHeader(),
                "content-type": "application/json",
                Origin: "https://dlive.tv",
                Referer: `https://dlive.tv/${streamer}`,
                "User-Agent": "Mozilla/5.0",
            },
            body: JSON.stringify(payload),
        });
        return resp.ok;
    }
    catch {
        return false;
    }
}
