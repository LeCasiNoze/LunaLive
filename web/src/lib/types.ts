export type LiveCard = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
  thumbUrl?: string | null;
  liveStartedAt?: string | null;
};

export type User = {
  id: number;
  username: string;
  rubis: number;
  role: "viewer" | "streamer" | "admin";
};

