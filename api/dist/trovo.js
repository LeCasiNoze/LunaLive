// api/src/trovo.ts
// Client GraphQL Trovo minimal pour POC debug
const TROVO_ENDPOINTS = [
    "https://api-web.trovo.live/graphql",
    "https://api-web-backup.trovo.live/graphql"
];
const TROVO_HEADERS = {
    "Accept": "*/*",
    "Origin": "https://trovo.live",
    "Referer": "https://trovo.live/",
    "Content-Type": "text/plain"
};
function generateRandomHex() {
    return Math.random().toString(16).substring(2, 18);
}
function encodeClientInfo() {
    const clientInfo = {
        platform: "web",
        browser: "chrome",
        version: "120.0.0.0",
        os: "windows",
        os_version: "10.0",
        device_type: "desktop"
    };
    return encodeURIComponent(JSON.stringify(clientInfo));
}
async function callTrovoGraphQL(spaceName) {
    const chunk = "1";
    const reqms = Date.now().toString();
    const qid = generateRandomHex();
    const cli = "4";
    const client_info = encodeClientInfo();
    const from = encodeURIComponent(`%2Fs%2F${spaceName}`);
    const locale = "FR";
    const resolution = "1050*1680";
    // Construire l'URL complète avec query string
    const url = `${TROVO_ENDPOINTS[0]}?chunk=${chunk}&reqms=${reqms}&qid=${qid}&cli=${cli}&client_info=${client_info}&from=${from}&locale=${locale}&resolution=${resolution}`;
    // Body exact comme string brute
    const body = `[{"operationName":"space_SpaceReadService_GetRoomInfo","variables":{"params":{"terminalSpaceID":{"spaceName":"${spaceName}"},"dataVer":"SPACE_ROOM_VER_V0","dataFormat":"SPACE_ROOM_DATA_TYPE_JSON","needRecVisit":true}},"extensions":{"singleReq":true}}]`;
    // Logging avant l'appel
    console.log(`[trovo] Request URL: ${url}`);
    console.log(`[trovo] Request Headers:`, TROVO_HEADERS);
    console.log(`[trovo] Request Body: ${body}`);
    let lastError = null;
    for (const endpoint of TROVO_ENDPOINTS) {
        try {
            const requestUrl = `${endpoint}?chunk=${chunk}&reqms=${reqms}&qid=${qid}&cli=${cli}&client_info=${client_info}&from=${from}&locale=${locale}&resolution=${resolution}`;
            console.log(`[trovo] Trying endpoint: ${requestUrl} for spaceName: ${spaceName}`);
            const response = await fetch(requestUrl, {
                method: "POST",
                headers: TROVO_HEADERS,
                body
            });
            console.log(`[trovo] Response Status: ${response.status} ${response.statusText}`);
            console.log(`[trovo] Response Headers:`, Object.fromEntries(response.headers.entries()));
            if (!response.ok) {
                const responseText = await response.text();
                console.error(`[trovo] Non-200 Response Body: ${responseText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const responseText = await response.text();
            console.log(`[trovo] Raw Response: ${responseText}`);
            // Parser la réponse - peut être un objet ou un tableau
            let parsedResponse;
            try {
                const parsed = JSON.parse(responseText);
                if (Array.isArray(parsed)) {
                    // Forme tableau: response[0].data.space_SpaceReadService_GetRoomInfo
                    const hasArrayResponse = true;
                    const room = parsed[0]?.data?.space_SpaceReadService_GetRoomInfo;
                    const hasRoomInfo = !!room;
                    const hasJsData = !!room?.jsData;
                    console.log(`[trovo] Parsing: hasArrayResponse=${hasArrayResponse}, hasRoomInfo=${hasRoomInfo}, hasJsData=${hasJsData}`);
                    if (hasRoomInfo && hasJsData) {
                        parsedResponse = {
                            data: {
                                space_SpaceReadService_GetRoomInfo: {
                                    jsData: room.jsData
                                }
                            }
                        };
                    }
                    else {
                        throw new Error(`Array response missing data: hasRoomInfo=${hasRoomInfo}, hasJsData=${hasJsData}`);
                    }
                }
                else {
                    // Forme objet: response.data.space_SpaceReadService_GetRoomInfo
                    const hasArrayResponse = false;
                    const room = parsed.data?.space_SpaceReadService_GetRoomInfo;
                    const hasRoomInfo = !!room;
                    const hasJsData = !!room?.jsData;
                    console.log(`[trovo] Parsing: hasArrayResponse=${hasArrayResponse}, hasRoomInfo=${hasRoomInfo}, hasJsData=${hasJsData}`);
                    parsedResponse = parsed;
                }
            }
            catch (parseError) {
                throw new Error(`Failed to parse response JSON: ${parseError.message}`);
            }
            if (parsedResponse.errors && parsedResponse.errors.length > 0) {
                throw new Error(`GraphQL errors: ${parsedResponse.errors.map(e => e.message).join(", ")}`);
            }
            console.log(`[trovo] Success from endpoint: ${requestUrl}`);
            return parsedResponse;
        }
        catch (error) {
            lastError = error;
            console.warn(`[trovo] Endpoint ${endpoint} failed:`, error.message);
            continue;
        }
    }
    throw lastError || new Error("All Trovo endpoints failed");
}
function parseTrovoJsData(raw) {
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Failed to parse jsData JSON: ${error.message}`);
    }
}
export async function fetchTrovoRoomInfo(spaceName) {
    const notes = [];
    if (!spaceName || spaceName.trim().length === 0) {
        return {
            ok: false,
            spaceName,
            isLive: false,
            title: null,
            channelId: null,
            roomId: null,
            sourceWidth: null,
            sourceHeight: null,
            defaultLevelType: null,
            isAdaptiveBitrate: null,
            isLhlsStream: null,
            qualities: [],
            bestPlayUrl: null,
            bestTimeShiftUrl: null,
            rawAvailable: false,
            notes: ["Invalid spaceName provided"]
        };
    }
    try {
        const response = await callTrovoGraphQL(spaceName.trim());
        if (!response.data?.space_SpaceReadService_GetRoomInfo?.jsData) {
            notes.push(`No jsData found in Trovo response`);
            return {
                ok: false,
                spaceName: spaceName.trim(),
                isLive: false,
                title: null,
                channelId: null,
                roomId: null,
                sourceWidth: null,
                sourceHeight: null,
                defaultLevelType: null,
                isAdaptiveBitrate: null,
                isLhlsStream: null,
                qualities: [],
                bestPlayUrl: null,
                bestTimeShiftUrl: null,
                rawAvailable: false,
                notes
            };
        }
        const jsDataRaw = response.data.space_SpaceReadService_GetRoomInfo.jsData;
        console.log(`[trovo] jsDataRaw length: ${jsDataRaw.length}, preview: ${jsDataRaw.substring(0, 200)}...`);
        const jsData = parseTrovoJsData(jsDataRaw);
        const programInfo = jsData?.programInfo || {};
        const streamInfo = programInfo.streamInfo || [];
        const channelInfo = jsData?.channelInfo || {};
        const roomInfo = jsData?.roomInfo || {};
        // Corriger le mapping pour channelId et roomId
        const channelId = channelInfo.channelID || null;
        const roomId = roomInfo.roomID || null;
        // Logs détaillés pour debugging
        console.log("[trovo-debug] jsData parsed:", {
            hasProgramInfo: !!programInfo,
            hasStreamInfo: !!streamInfo,
            streamInfoCount: streamInfo.length,
            channelInfoKeys: Object.keys(channelInfo),
            roomInfoKeys: Object.keys(roomInfo),
            channelId,
            roomId
        });
        const streamInfoCount = streamInfo.length;
        console.log(`[trovo] streamInfoCount: ${streamInfoCount}`);
        console.log(`[trovo] isLive: ${!!jsData.isLive}`);
        console.log(`[trovo] programInfo.title: ${jsData.programInfo?.title || 'null'}`);
        notes.push(`Found ${streamInfoCount} stream qualities`);
        notes.push(`isLive: ${!!jsData.isLive}`);
        const qualities = streamInfo.map((stream, index) => ({
            desc: stream.desc || `Quality ${index + 1}`,
            levelType: stream.levelType || null,
            bitrate: stream.bitrate || null,
            playUrl: stream.playUrl || null,
            playTimeShiftUrl: stream.playTimeShiftUrl || null
        }));
        // Sélection de la meilleure qualité
        let bestPlayUrl = null;
        let bestTimeShiftUrl = null;
        if (qualities.length > 0) {
            // Priorité: defaultLevelType si disponible
            const defaultQuality = qualities.find(q => q.levelType === jsData.programInfo?.defaultLevelType);
            const selectedQuality = defaultQuality || qualities[0];
            bestPlayUrl = selectedQuality.playUrl;
            bestTimeShiftUrl = selectedQuality.playTimeShiftUrl;
            console.log(`[trovo] selectedBestPlayUrl: ${bestPlayUrl?.substring(0, 100) || 'null'}...`);
            console.log(`[trovo] selectedBestTimeShiftUrl: ${bestTimeShiftUrl?.substring(0, 100) || 'null'}...`);
            notes.push(`Selected quality: ${selectedQuality.desc}`);
            if (defaultQuality) {
                notes.push(`Used defaultLevelType: ${jsData.programInfo?.defaultLevelType}`);
            }
        }
        // Validation des URLs
        if (bestPlayUrl)
            notes.push(`Best play URL: ${bestPlayUrl.substring(0, 100)}...`);
        if (bestTimeShiftUrl)
            notes.push(`Best timeshift URL: ${bestTimeShiftUrl.substring(0, 100)}...`);
        return {
            ok: true,
            spaceName: spaceName.trim(),
            isLive: !!jsData.isLive,
            title: jsData.programInfo?.title || null,
            channelId: jsData.channelId || null,
            roomId: jsData.roomId || null,
            sourceWidth: jsData.sourceWidth || null,
            sourceHeight: jsData.sourceHeight || null,
            defaultLevelType: jsData.programInfo?.defaultLevelType || null,
            isAdaptiveBitrate: jsData.programInfo?.isAdaptiveBitrate || null,
            isLhlsStream: jsData.programInfo?.isLhlsStream || null,
            qualities,
            bestPlayUrl,
            bestTimeShiftUrl,
            rawAvailable: true,
            notes
        };
    }
    catch (error) {
        const errorMessage = error.message;
        notes.push(`Error: ${errorMessage}`);
        return {
            ok: false,
            spaceName: spaceName.trim(),
            isLive: false,
            title: null,
            channelId: null,
            roomId: null,
            sourceWidth: null,
            sourceHeight: null,
            defaultLevelType: null,
            isAdaptiveBitrate: null,
            isLhlsStream: null,
            qualities: [],
            bestPlayUrl: null,
            bestTimeShiftUrl: null,
            rawAvailable: false,
            notes
        };
    }
}
