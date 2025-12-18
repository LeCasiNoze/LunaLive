import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";

export const MOCK_LIVES: LiveCard[] = [
  {
    id: "1",
    slug: "wayzebi",
    displayName: "Wayzebi",
    title: "Slots session — bonus hunt",
    viewers: 842,
    thumbUrl: svgThumb("Wayzebi"),
    liveStartedAt: null,
  },
  {
    id: "2",
    slug: "sinisterzs",
    displayName: "Sinisterzs",
    title: "Morning grind — chill",
    viewers: 510,
    thumbUrl: svgThumb("Sinisterzs"),
    liveStartedAt: null,
  },
  {
    id: "3",
    slug: "nico-carasso",
    displayName: "Nico Carasso",
    title: "Big balance / risky spins",
    viewers: 321,
    thumbUrl: svgThumb("Nico Carasso"),
    liveStartedAt: null,
  },
  {
    id: "4",
    slug: "teoman",
    displayName: "Teoman",
    title: "Community picks — let’s go",
    viewers: 205,
    thumbUrl: svgThumb("Teoman"),
    liveStartedAt: null,
  },
  {
    id: "5",
    slug: "bryan-cars",
    displayName: "BryanCars",
    title: "Late session — last shots",
    viewers: 96,
    thumbUrl: svgThumb("BryanCars"),
    liveStartedAt: null,
  },
];
