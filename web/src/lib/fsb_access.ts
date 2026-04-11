import type { ApiUser } from "./api";

export const FSB_ALLOWED_USER_IDS = new Set([4, 15, 71]);

export function canAccessFsbBoard(user: Pick<ApiUser, "id"> | null | undefined) {
  return FSB_ALLOWED_USER_IDS.has(Number(user?.id || 0));
}
