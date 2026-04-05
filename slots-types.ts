// src/slots/types.ts
// Types réutilisables pour le système de slots

export type SlotRow = {
  name: string;
  provider: string | null;
  imageUrl?: string | null;
};

export type InsertedSlotRow = {
  name: string;
  provider: string | null;
  slotKey: string;
  imageUrl: string | null;
};

export type ResolvedSlot = {
  name: string;
  provider: string | null;
  imageUrl: string | null;
};

export type CallItem = {
  id: string;
  slotName: string;
  provider: string | null;
  userId: number;
  username: string;
  pos: number;
  createdAt: string;
  bet: number | null;
  pay: number | null;
  bounty: boolean | null;
};
