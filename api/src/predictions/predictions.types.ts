export type PredictionStatus = "open" | "locked" | "resolved";

export type PredictionRow = {
  id: number;
  streamer_id: number;
  question: string;
  option1_label: string;
  option2_label: string;
  fixed_stake: number;
  status: PredictionStatus;
  created_at: string;
  bets_close_at: string;
  resolved_option: 1 | 2 | null;
  total_pool_1: number;
  total_pool_2: number;

  // ajout schema safe
  resolved_at?: string | null;
};

export type PredictionBetRow = {
  id: number;
  prediction_id: number;
  user_id: number;
  choice: 1 | 2;
  amount: number;
  created_at: string;
};

export type PredictionSummary = {
  count1: number;
  count2: number;
  total1: number;
  total2: number;
};
