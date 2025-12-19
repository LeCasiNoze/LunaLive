// web/src/lib/appearance.ts
import type React from "react";

export type StreamerAppearance = {
  chat: {
    usernameColor: string; // ✅ aligné API / dashboard
    messageColor: string;  // ✅ aligné API / dashboard
    sub?: any;             // réservé, plus tard
  };
};

export const NAME_PRESETS = [
  { id: "ghost_purple", label: "Ghost Purple", value: "#7C4DFF" },
  { id: "blue_lotus", label: "Blue Lotus", value: "#3B82F6" },
  { id: "ice_cyan", label: "Ice Cyan", value: "#4DD0E1" },
  { id: "aurora_mint", label: "Aurora Mint", value: "#2EE59D" },
  { id: "ember_gold", label: "Ember Gold", value: "#FFD54A" },
  { id: "rose_neon", label: "Rose Neon", value: "#FF4FD8" },
  { id: "sunset_orange", label: "Sunset Orange", value: "#FF8A3D" },
  { id: "ruby_pop", label: "Ruby Pop", value: "#FF3B6B" },
] as const;

export const MSG_PRESETS = [
  { id: "moon_white", label: "Moon White", value: "#FFFFFF" },
  { id: "lavender_mist", label: "Lavender Mist", value: "#F2EEFF" },
  { id: "ice_mint", label: "Ice Mint", value: "#E9FFF7" },
  { id: "soft_sky", label: "Soft Sky", value: "#EAF2FF" },
  { id: "rose_milk", label: "Rose Milk", value: "#FFEAF4" },
  { id: "warm_sand", label: "Warm Sand", value: "#FFF6E2" },
] as const;

export const DEFAULT_APPEARANCE: StreamerAppearance = {
  chat: {
    usernameColor: "#7C4DFF",
    messageColor: "#FFFFFF",
  },
};

export function isHexColor(v: any) {
  const s = String(v || "").trim();
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s);
}

export function cleanHex(v: any, fallback: string) {
  return isHexColor(v) ? String(v).trim().toUpperCase() : fallback;
}

/**
 * ✅ Normalise et supporte aussi l'ancien format nameColor/msgColor (fallback).
 */
export function normalizeAppearance(x: any): StreamerAppearance {
  const a = x && typeof x === "object" ? x : {};
  const chatRaw = a.chat && typeof a.chat === "object" ? a.chat : a;

  const usernameColor = cleanHex(
    chatRaw.usernameColor ?? chatRaw.nameColor,
    DEFAULT_APPEARANCE.chat.usernameColor
  );

  const messageColor = cleanHex(
    chatRaw.messageColor ?? chatRaw.msgColor,
    DEFAULT_APPEARANCE.chat.messageColor
  );

  return {
    chat: {
      usernameColor,
      messageColor,
      sub: chatRaw.sub,
    },
  };
}

export function cssVarsFromAppearance(a: StreamerAppearance) {
  return {
    ["--chat-name-color" as any]: a.chat.usernameColor,
    ["--chat-msg-color" as any]: a.chat.messageColor,
  } as React.CSSProperties;
}
