export type ChatMsg = {
  id: number;
  userId: number;
  username: string;
  body: string;
  deleted?: boolean;
  createdAt: string;
};

type ChannelState = {
  msgs: ChatMsg[];
  lastActivity: number;
  nextId: number;
  recentUsers: Map<string, { id: number; username: string; lastSeen: number }>;
};

const CHANNELS = new Map<string, ChannelState>();

const MAX_MESSAGES = 50; // tu as dit 50 ok
const RESET_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours

function now() {
  return Date.now();
}

function normSlug(slug: string) {
  return String(slug || "").trim().toLowerCase();
}

function getOrCreate(slug: string): ChannelState {
  const key = normSlug(slug);
  let st = CHANNELS.get(key);
  if (!st) {
    st = { msgs: [], lastActivity: now(), nextId: 1, recentUsers: new Map() };
    CHANNELS.set(key, st);
  }
  // reset si inactif 3 jours
  if (now() - st.lastActivity > RESET_AFTER_MS) {
    st.msgs = [];
    st.recentUsers.clear();
    st.nextId = 1;
    st.lastActivity = now();
  }
  return st;
}

export const chatStore = {
  getMessages(slug: string, limit = MAX_MESSAGES): ChatMsg[] {
    const st = getOrCreate(slug);
    const n = Math.max(1, Math.min(Number(limit) || MAX_MESSAGES, 200));
    return st.msgs.slice(-n);
  },

  addMessage(slug: string, msg: Omit<ChatMsg, "id" | "createdAt">): ChatMsg {
    const st = getOrCreate(slug);
    st.lastActivity = now();

    const full: ChatMsg = {
      id: st.nextId++,
      createdAt: new Date().toISOString(),
      ...msg,
    };

    st.msgs.push(full);
    if (st.msgs.length > MAX_MESSAGES) st.msgs.splice(0, st.msgs.length - MAX_MESSAGES);

    // track users for mentions
    const key = msg.username.toLowerCase();
    st.recentUsers.set(key, { id: msg.userId, username: msg.username, lastSeen: now() });

    return full;
  },

  clear(slug: string) {
    const st = getOrCreate(slug);
    st.msgs = [];
    st.lastActivity = now();
  },

  listRecentUsers(slug: string, q: string, limit = 10) {
    const st = getOrCreate(slug);
    const qq = String(q || "").toLowerCase();
    const items = [...st.recentUsers.values()]
      .filter((u) => u.username.toLowerCase().startsWith(qq))
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit)
      .map((u) => ({ id: u.id, username: u.username }));
    return items;
  },

  pruneIdle() {
    const t = now();
    for (const [slug, st] of CHANNELS) {
      if (t - st.lastActivity > RESET_AFTER_MS) {
        CHANNELS.delete(slug);
      }
    }
  },
};

// prune périodique (ne bloque pas)
setInterval(() => {
  try {
    chatStore.pruneIdle();
  } catch {}
}, 60 * 60 * 1000).unref?.();
