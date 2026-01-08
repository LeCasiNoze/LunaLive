// web/src/lib/hunt_types.ts
export type HuntPhase = "edit" | "open" | "closed";

export type HuntItem = {
  id: string;
  name: string;
  image_url?: string | null;
  bet?: number | null;
  pay?: number | null;
  provider?: string | null;
  bounty?: boolean | null;
  caller?: string | null;
};

export type HuntState = {
  phase: HuntPhase;
  opened: boolean;
  items: HuntItem[];
  start?: number | null;
  archive_id?: number | null;
};

export type SuggestItem = {
  name: string;
  provider?: string | null;
  image_url?: string | null;
  score: number;
};

export type SavedHunt = {
  id: number;
  created_at?: string | null;
  title?: string | null;
  start?: number | null;
  total_pay?: number | null;
  items_count?: number | null;
  snapshot?: HuntState | null;
};
