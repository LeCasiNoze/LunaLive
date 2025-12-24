// api/src/appearance.js

function clampViewerSkinsLevel(v) {
  const n = Number(v);
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 1;
}

export default function normalizeAppearance(input = {}) {
  const a = input && typeof input === "object" ? input : {};
  const chatRaw = a.chat && typeof a.chat === "object" ? a.chat : a;

  // garde tes règles existantes (hex/clean etc)
  const usernameColor = typeof chatRaw.usernameColor === "string" ? chatRaw.usernameColor : (chatRaw.nameColor || "#7C4DFF");
  const messageColor = typeof chatRaw.messageColor === "string" ? chatRaw.messageColor : (chatRaw.msgColor || "#FFFFFF");

  const viewerSkinsLevel = clampViewerSkinsLevel(chatRaw.viewerSkinsLevel);

  return {
    chat: {
      viewerSkinsLevel, // ✅ NEW
      usernameColor,
      messageColor,
      sub: chatRaw.sub,
    },
  };
}

export function mergeAppearance(current = {}, patch = {}) {
  const cur = current && typeof current === "object" ? current : {};
  const p = patch && typeof patch === "object" ? patch : {};

  // deep-ish merge (conserve ton merge actuel si tu en as déjà un)
  const out = {
    ...cur,
    ...p,
    chat: {
      ...(cur.chat || {}),
      ...(p.chat || {}),
    },
  };

  // ✅ clamp si patch fourni (ou garde l’existant sinon)
  const pChat = p.chat && typeof p.chat === "object" ? p.chat : p;
  if (pChat && Object.prototype.hasOwnProperty.call(pChat, "viewerSkinsLevel")) {
    out.chat = out.chat || {};
    out.chat.viewerSkinsLevel = clampViewerSkinsLevel(pChat.viewerSkinsLevel);
  }

  // retourne un format normalisé pour DB
  return normalizeAppearance(out);
}
