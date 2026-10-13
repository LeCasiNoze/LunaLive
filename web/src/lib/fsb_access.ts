import type { ApiUser } from "./api";

// Dashboard privé de LeCasiNoze. Aucun accès hérité de l'ancien board partagé.
export const FSB_ALLOWED_USER_IDS = new Set([4]);

export function canAccessFsbBoard(user: Pick<ApiUser, "id"> | null | undefined) {
  return FSB_ALLOWED_USER_IDS.has(Number(user?.id || 0));
}
