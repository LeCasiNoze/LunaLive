const CHANNELS = new Map();
const MAX_MESSAGES = 50;
const RESET_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours
function now() {
    return Date.now();
}
function normSlug(slug) {
    return String(slug || "").trim().toLowerCase();
}
function getOrCreate(slug) {
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
    getMessages(slug, limit = MAX_MESSAGES) {
        const st = getOrCreate(slug);
        const n = Math.max(1, Math.min(Number(limit) || MAX_MESSAGES, 200));
        return st.msgs.slice(-n);
    },
    addMessage(slug, msg) {
        const st = getOrCreate(slug);
        st.lastActivity = now();
        const full = {
            id: st.nextId++,
            createdAt: new Date().toISOString(),
            deleted: false,
            deletedAt: null,
            deletedBy: null,
            ...msg,
        };
        st.msgs.push(full);
        if (st.msgs.length > MAX_MESSAGES)
            st.msgs.splice(0, st.msgs.length - MAX_MESSAGES);
        // track users for mentions (ignore system)
        if (full.userId > 0) {
            const key = full.username.toLowerCase();
            st.recentUsers.set(key, { id: full.userId, username: full.username, lastSeen: now() });
        }
        return full;
    },
    addSystem(slug, text) {
        return this.addMessage(slug, {
            userId: 0,
            username: "LunaLive",
            body: String(text || "").slice(0, 200),
        });
    },
    removeMessage(slug, messageId) {
        const st = getOrCreate(slug);
        const id = Number(messageId);
        const i = st.msgs.findIndex((m) => Number(m.id) === id);
        if (i === -1)
            return false;
        st.msgs.splice(i, 1); // ✅ disparition totale
        st.lastActivity = now();
        return true;
    },
    clear(slug) {
        const st = getOrCreate(slug);
        st.msgs = [];
        st.lastActivity = now();
    },
    listRecentUsers(slug, q, limit = 10) {
        const st = getOrCreate(slug);
        const qq = String(q || "").toLowerCase();
        return [...st.recentUsers.values()]
            .filter((u) => u.username.toLowerCase().startsWith(qq))
            .sort((a, b) => b.lastSeen - a.lastSeen)
            .slice(0, limit)
            .map((u) => ({ id: u.id, username: u.username }));
    },
    pruneIdle() {
        const t = now();
        for (const [slug, st] of CHANNELS) {
            if (t - st.lastActivity > RESET_AFTER_MS)
                CHANNELS.delete(slug);
        }
    },
};
// prune périodique
setInterval(() => {
    try {
        chatStore.pruneIdle();
    }
    catch { }
}, 60 * 60 * 1000).unref?.();
