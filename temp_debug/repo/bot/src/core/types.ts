export type StreamerRow = {
  id: number;
  slug: string;
  displayName: string;
  isLive: boolean;
};

export type BotStreamerSettings = {
  enabled: boolean;
  prefix: string;
  liveOnly: boolean;
};

export type ChatMsg = {
  // ✅ DB / transport
  id?: number;            // important: optionnel => pas de casse ailleurs
  streamerId?: number;    // optionnel aussi si certains providers ne le set pas

  // ✅ cœur
  userId: number;
  username: string;
  body: string;
  createdAt: string;

  // ✅ flags (pour la feature repost + règles mod/owner)
  role?: string;
  isModLike?: boolean;
  isOwner?: boolean;
};


export type BotCommand = {
  trigger: string;          // "!ping"
  response: string;         // template
  enabled: boolean;
  cooldownSec: number;
};

export type BotAutopost = {
  message: string;
  everySec: number;
  enabled: boolean;
};

export type CommandContext = {
  prefix: string;
  streamer: {
    id: number;
    slug: string;
    displayName: string;
  };

  send: (msg: string) => Promise<void>;

  // ✅ NEW: repost vers DLive (optionnel)
  sendDlive?: (text: string, meta?: { trigger?: string }) => Promise<void>;
  
  // ✅ À AJOUTER
  predictions?: {
    bet: (params: {
      userId: number;
      username: string;
      choice: 1 | 2;
      streamerId: number;
    }) => Promise<void>;
  };
};
