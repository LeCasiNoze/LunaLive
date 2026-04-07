// api/src/trovo.ts
// Client GraphQL Trovo minimal pour POC debug

export type TrovoDebugInfo = {
  ok: boolean;
  spaceName: string;
  isLive: boolean;
  title: string | null;
  channelId: number | null;
  roomId: number | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  defaultLevelType: number | null;
  isAdaptiveBitrate: boolean | null;
  isLhlsStream: boolean | null;
  qualities: Array<{
    desc: string | null;
    levelType: number | null;
    bitrate: number | null;
    playUrl: string | null;
    playTimeShiftUrl: string | null;
  }>;
  bestPlayUrl: string | null;
  bestTimeShiftUrl: string | null;
  rawAvailable: boolean;
  notes: string[];
};

type TrovoGraphQLResponse = {
  data?: {
    space_SpaceReadService_GetRoomInfo?: {
      jsData?: string;
    };
  };
  errors?: Array<{ message: string }>;
};

type TrovoJsData = {
  programInfo?: {
    streamInfo?: Array<{
      desc?: string;
      levelType?: number;
      bitrate?: number;
      playUrl?: string;
      playTimeShiftUrl?: string;
    }>;
    title?: string;
    defaultLevelType?: number;
    isAdaptiveBitrate?: boolean;
    isLhlsStream?: boolean;
  };
  channelId?: number;
  roomId?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  isLive?: boolean;
};

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

function generateRandomHex(): string {
  return Math.random().toString(16).substring(2, 18);
}

function encodeClientInfo(): string {
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

async function callTrovoGraphQL(spaceName: string): Promise<TrovoGraphQLResponse> {
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

  let lastError: Error | null = null;

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

      const data = JSON.parse(responseText) as TrovoGraphQLResponse;
      
      if (data.errors && data.errors.length > 0) {
        throw new Error(`GraphQL errors: ${data.errors.map(e => e.message).join(", ")}`);
      }

      console.log(`[trovo] Success from endpoint: ${requestUrl}`);
      return data;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[trovo] Endpoint ${endpoint} failed:`, (error as Error).message);
      continue;
    }
  }

  throw lastError || new Error("All Trovo endpoints failed");
}

function parseTrovoJsData(raw: string): TrovoJsData {
  try {
    return JSON.parse(raw) as TrovoJsData;
  } catch (error) {
    throw new Error(`Failed to parse jsData JSON: ${(error as Error).message}`);
  }
}

export async function fetchTrovoRoomInfo(spaceName: string): Promise<TrovoDebugInfo> {
  const notes: string[] = [];
  
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
        notes: ["No jsData found in Trovo response"]
      };
    }

    const jsData = parseTrovoJsData(response.data.space_SpaceReadService_GetRoomInfo.jsData);
    const streamInfo = jsData.programInfo?.streamInfo || [];

    notes.push(`Found ${streamInfo.length} stream qualities`);
    notes.push(`isLive: ${!!jsData.isLive}`);

    const qualities = streamInfo.map((stream, index) => ({
      desc: stream.desc || `Quality ${index + 1}`,
      levelType: stream.levelType || null,
      bitrate: stream.bitrate || null,
      playUrl: stream.playUrl || null,
      playTimeShiftUrl: stream.playTimeShiftUrl || null
    }));

    // Sélection de la meilleure qualité
    let bestPlayUrl: string | null = null;
    let bestTimeShiftUrl: string | null = null;

    if (qualities.length > 0) {
      // Priorité: defaultLevelType si disponible
      const defaultQuality = qualities.find(q => q.levelType === jsData.programInfo?.defaultLevelType);
      const selectedQuality = defaultQuality || qualities[0];

      bestPlayUrl = selectedQuality.playUrl;
      bestTimeShiftUrl = selectedQuality.playTimeShiftUrl;

      notes.push(`Selected quality: ${selectedQuality.desc}`);
      if (defaultQuality) {
        notes.push(`Used defaultLevelType: ${jsData.programInfo?.defaultLevelType}`);
      }
    }

    // Validation des URLs
    if (bestPlayUrl) notes.push(`Best play URL: ${bestPlayUrl.substring(0, 100)}...`);
    if (bestTimeShiftUrl) notes.push(`Best timeshift URL: ${bestTimeShiftUrl.substring(0, 100)}...`);

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

  } catch (error) {
    const errorMessage = (error as Error).message;
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
