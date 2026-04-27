// Background service worker — orchestrates TikTok scraping in user's browser.
// Receives requests from content_lunalive.js, opens TikTok tabs in background,
// waits for content_tiktok.js to scrape, returns results.

const PENDING = new Map(); // tabId -> { resolve, reject, timeout }

function openTabAndScrape(url, options = {}) {
  return new Promise((resolve, reject) => {
    const visible = !!options.visible;
    chrome.tabs.create({ url, active: visible }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        return reject(new Error(chrome.runtime.lastError?.message || "tab_create_failed"));
      }
      const timeout = setTimeout(() => {
        if (PENDING.has(tab.id)) {
          PENDING.delete(tab.id);
          chrome.tabs.remove(tab.id).catch(() => {});
          reject(new Error("scrape_timeout"));
        }
      }, options.timeoutMs || 35_000);

      PENDING.set(tab.id, {
        resolve: (data) => {
          clearTimeout(timeout);
          chrome.tabs.remove(tab.id).catch(() => {});
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeout);
          chrome.tabs.remove(tab.id).catch(() => {});
          reject(err);
        },
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // From content_tiktok.js after scraping a TikTok hashtag/search page
  if (message?.type === "LUNALIVE_TIKTOK_RESULT" && sender.tab?.id) {
    const pending = PENDING.get(sender.tab.id);
    if (pending) {
      PENDING.delete(sender.tab.id);
      pending.resolve(message.payload);
    }
    sendResponse({ ok: true });
    return false;
  }

  // From content_tiktok.js after scraping a /@handle profile page
  if (message?.type === "LUNALIVE_TIKTOK_PROFILE_RESULT" && sender.tab?.id) {
    const pending = PENDING.get(sender.tab.id);
    if (pending) {
      PENDING.delete(sender.tab.id);
      pending.resolve(message.payload);
    }
    sendResponse({ ok: true });
    return false;
  }

  // From content_lunalive.js — triggered by lunalive.win UI
  if (message?.type === "LUNALIVE_TIKTOK_DISCOVER") {
    (async () => {
      const { hashtags = [], queries = [], limit = 50, visible = false } = message.payload || {};
      const events = [];
      const allHandles = new Set();

      const dispatch = (event) => {
        events.push(event);
        try {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: "LUNALIVE_TIKTOK_PROGRESS",
            event,
          }).catch(() => {});
        } catch {}
      };

      for (const tag of hashtags) {
        const cleaned = String(tag).trim().replace(/^#+/, "").toLowerCase();
        if (!cleaned) continue;
        const url = `https://www.tiktok.com/tag/${encodeURIComponent(cleaned)}`;
        dispatch({ kind: "start", source: `#${cleaned}` });
        try {
          const data = await openTabAndScrape(url, { visible });
          (data?.handles || []).forEach((h) => allHandles.add(h));
          dispatch({
            kind: "done",
            source: `#${cleaned}`,
            found: data?.handles?.length || 0,
            diag: data?.diag,
          });
        } catch (err) {
          dispatch({ kind: "error", source: `#${cleaned}`, error: String(err?.message || err) });
        }
        if (allHandles.size >= limit * 2) break;
      }

      for (const query of queries) {
        const q = String(query).trim();
        if (!q) continue;
        const url = `https://www.tiktok.com/search/user?q=${encodeURIComponent(q)}`;
        dispatch({ kind: "start", source: `?${q}` });
        try {
          const data = await openTabAndScrape(url, { visible });
          (data?.handles || []).forEach((h) => allHandles.add(h));
          dispatch({
            kind: "done",
            source: `?${q}`,
            found: data?.handles?.length || 0,
            diag: data?.diag,
          });
        } catch (err) {
          dispatch({ kind: "error", source: `?${q}`, error: String(err?.message || err) });
        }
      }

      sendResponse({
        ok: true,
        handles: Array.from(allHandles).slice(0, limit),
        events,
      });
    })();
    return true; // async response
  }

  if (message?.type === "LUNALIVE_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  // Scrape full profile data (one tab per handle, throttled)
  if (message?.type === "LUNALIVE_TIKTOK_SCRAPE_PROFILES") {
    (async () => {
      const { handles = [], visible = false } = message.payload || {};
      const dispatch = (event) => {
        try {
          chrome.tabs
            .sendMessage(sender.tab.id, { type: "LUNALIVE_TIKTOK_PROGRESS", event })
            .catch(() => {});
        } catch {}
      };

      const profiles = [];
      let idx = 0;
      for (const handle of handles) {
        idx += 1;
        const cleaned = String(handle).trim().replace(/^@/, "").toLowerCase();
        if (!cleaned) continue;
        const url = `https://www.tiktok.com/@${encodeURIComponent(cleaned)}`;
        dispatch({ kind: "profile_start", source: `@${cleaned}`, found: idx });
        try {
          const data = await openTabAndScrape(url, { visible, timeoutMs: 25_000 });
          if (data?.profile) {
            profiles.push(data.profile);
            dispatch({
              kind: "profile_done",
              source: `@${cleaned}`,
              found: data.profile.bioEmail ? 1 : 0,
            });
          } else {
            dispatch({ kind: "profile_error", source: `@${cleaned}`, error: "no_profile" });
          }
        } catch (err) {
          dispatch({
            kind: "profile_error",
            source: `@${cleaned}`,
            error: String(err?.message || err),
          });
        }
        // Light throttle between tabs to avoid TikTok rate-limit
        await new Promise((r) => setTimeout(r, 600));
      }

      sendResponse({ ok: true, profiles });
    })();
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const pending = PENDING.get(tabId);
  if (pending) {
    PENDING.delete(tabId);
    pending.reject(new Error("tab_closed"));
  }
});
