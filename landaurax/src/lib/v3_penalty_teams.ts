import type { M4ThemeColors } from "./editor_v2_types";

export type V3PenaltyTeamKey =
  | "france"
  | "brazil"
  | "argentina"
  | "morocco"
  | "spain"
  | "portugal";

export type V3PenaltyTeam = {
  key: V3PenaltyTeamKey;
  label: string;
  shortLabel: string;
  accent: string;
  accentLight: string;
  accentGlow: string;
  accentSoft: string;
  accentBorder: string;
  bgPage: string;
  bgCard: string;
  borderColor: string;
  pitchTop: string;
  pitchBottom: string;
  skyTop: string;
  skyBottom: string;
  crowd: string;
  jerseyPrimary: string;
  jerseySecondary: string;
  keeperPrimary: string;
  keeperSecondary: string;
  buttonText: string;
};

export const V3_PENALTY_TEAMS: readonly V3PenaltyTeam[] = [
  {
    key: "france", label: "France", shortLabel: "FRA",
    accent: "#2563eb", accentLight: "#93c5fd",
    accentGlow: "rgba(37,99,235,.45)", accentSoft: "rgba(37,99,235,.12)", accentBorder: "rgba(147,197,253,.35)",
    bgPage: "#051223", bgCard: "#0b1c34", borderColor: "rgba(147,197,253,.28)",
    pitchTop: "#1c6b52", pitchBottom: "#0d4f40", skyTop: "#08254d", skyBottom: "#15438a",
    crowd: "#dbeafe", jerseyPrimary: "#1d4ed8", jerseySecondary: "#f8fafc",
    keeperPrimary: "#ef4444", keeperSecondary: "#7f1d1d", buttonText: "#07111f",
  },
  {
    key: "brazil", label: "Brésil", shortLabel: "BRA",
    accent: "#facc15", accentLight: "#fde68a",
    accentGlow: "rgba(250,204,21,.45)", accentSoft: "rgba(250,204,21,.12)", accentBorder: "rgba(254,240,138,.38)",
    bgPage: "#071a12", bgCard: "#0f281f", borderColor: "rgba(250,204,21,.28)",
    pitchTop: "#1f7a47", pitchBottom: "#0f5e35", skyTop: "#06312b", skyBottom: "#0b5d48",
    crowd: "#fef3c7", jerseyPrimary: "#facc15", jerseySecondary: "#14532d",
    keeperPrimary: "#2563eb", keeperSecondary: "#1e3a8a", buttonText: "#172400",
  },
  {
    key: "argentina", label: "Argentine", shortLabel: "ARG",
    accent: "#38bdf8", accentLight: "#bae6fd",
    accentGlow: "rgba(56,189,248,.45)", accentSoft: "rgba(56,189,248,.12)", accentBorder: "rgba(186,230,253,.38)",
    bgPage: "#061723", bgCard: "#102432", borderColor: "rgba(56,189,248,.3)",
    pitchTop: "#1e7b66", pitchBottom: "#146150", skyTop: "#0b3b59", skyBottom: "#1d7ab0",
    crowd: "#e0f2fe", jerseyPrimary: "#38bdf8", jerseySecondary: "#f8fafc",
    keeperPrimary: "#f59e0b", keeperSecondary: "#92400e", buttonText: "#061922",
  },
  {
    key: "morocco", label: "Maroc", shortLabel: "MAR",
    accent: "#ef4444", accentLight: "#fca5a5",
    accentGlow: "rgba(239,68,68,.44)", accentSoft: "rgba(239,68,68,.12)", accentBorder: "rgba(252,165,165,.34)",
    bgPage: "#240709", bgCard: "#341014", borderColor: "rgba(248,113,113,.28)",
    pitchTop: "#1f6d48", pitchBottom: "#0f5939", skyTop: "#3b0a12", skyBottom: "#6d1425",
    crowd: "#fee2e2", jerseyPrimary: "#dc2626", jerseySecondary: "#fecaca",
    keeperPrimary: "#10b981", keeperSecondary: "#065f46", buttonText: "#2b0a0e",
  },
  {
    key: "spain", label: "Espagne", shortLabel: "ESP",
    accent: "#f59e0b", accentLight: "#fcd34d",
    accentGlow: "rgba(245,158,11,.42)", accentSoft: "rgba(245,158,11,.12)", accentBorder: "rgba(252,211,77,.34)",
    bgPage: "#231108", bgCard: "#341a0f", borderColor: "rgba(245,158,11,.28)",
    pitchTop: "#1e774f", pitchBottom: "#105c3a", skyTop: "#551b10", skyBottom: "#9a3412",
    crowd: "#ffedd5", jerseyPrimary: "#dc2626", jerseySecondary: "#f59e0b",
    keeperPrimary: "#1d4ed8", keeperSecondary: "#1e3a8a", buttonText: "#241203",
  },
  {
    key: "portugal", label: "Portugal", shortLabel: "POR",
    accent: "#22c55e", accentLight: "#86efac",
    accentGlow: "rgba(34,197,94,.42)", accentSoft: "rgba(34,197,94,.12)", accentBorder: "rgba(134,239,172,.34)",
    bgPage: "#07160f", bgCard: "#10241b", borderColor: "rgba(34,197,94,.28)",
    pitchTop: "#1b7449", pitchBottom: "#0d5f3a", skyTop: "#0b3322", skyBottom: "#14532d",
    crowd: "#dcfce7", jerseyPrimary: "#16a34a", jerseySecondary: "#ef4444",
    keeperPrimary: "#facc15", keeperSecondary: "#854d0e", buttonText: "#07150c",
  },
] as const;

export function getPenaltyTeam(key?: string): V3PenaltyTeam {
  return V3_PENALTY_TEAMS.find((team) => team.key === key) || V3_PENALTY_TEAMS[0];
}

export function getPenaltyThemeColors(key?: string): M4ThemeColors {
  const team = getPenaltyTeam(key);
  return {
    accent: team.accent,
    accentLight: team.accentLight,
    accentGlow: team.accentGlow,
    accentSoft: team.accentSoft,
    accentBorder: team.accentBorder,
    bgPage: team.bgPage,
    bgCard: team.bgCard,
    borderColor: team.borderColor,
  };
}
