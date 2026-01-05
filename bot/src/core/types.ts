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
  id: number;
  streamerId: number;
  userId: number;
  username: string;
  body: string;
  createdAt: string;
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
  streamer: StreamerRow;
  prefix: string;
  send: (text: string) => Promise<void>;
};
