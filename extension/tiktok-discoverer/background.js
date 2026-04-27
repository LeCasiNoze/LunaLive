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

  // Scrape full profile data (one tab per handle, throttled).
  // Uses chrome.scripting.executeScript so it does NOT depend on the
  // content_tiktok.js version cached by Chrome.
  if (message?.type === "LUNALIVE_TIKTOK_SCRAPE_PROFILES") {
    (async () => {
      const { handles = [], visible = false, timeoutMs = 35_000 } = message.payload || {};
      const dispatch = (event) => {
        try {
          chrome.tabs
            .sendMessage(sender.tab.id, { type: "LUNALIVE_TIKTOK_PROGRESS", event })
            .catch(() => {});
        } catch {}
      };

      async function scrapeProfile(handle) {
        const cleaned = String(handle).trim().replace(/^@/, "").toLowerCase();
        if (!cleaned) return null;
        const url = `https://www.tiktok.com/@${encodeURIComponent(cleaned)}`;
        return new Promise((resolve) => {
          chrome.tabs.create({ url, active: visible }, async (tab) => {
            if (chrome.runtime.lastError || !tab?.id) {
              return resolve({
                error: chrome.runtime.lastError?.message || "tab_create_failed",
              });
            }
            let done = false;
            const finish = (result) => {
              if (done) return;
              done = true;
              try {
                chrome.tabs.onUpdated.removeListener(onUpdated);
              } catch {}
              clearTimeout(timer);
              chrome.tabs.remove(tab.id).catch(() => {});
              resolve(result);
            };
            const timer = setTimeout(() => finish({ error: "tab_timeout" }), timeoutMs);

            async function tryExtract() {
              try {
                const results = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: (handleArg) => {
                    let userInfo = null;
                    const script = document.getElementById(
                      "__UNIVERSAL_DATA_FOR_REHYDRATION__"
                    );
                    if (script && script.textContent) {
                      try {
                        const json = JSON.parse(script.textContent);
                        const scope = (json && json.__DEFAULT_SCOPE__) || {};
                        const ud = scope["webapp.user-detail"];
                        if (ud && ud.userInfo && ud.userInfo.user) {
                          userInfo = ud.userInfo;
                        }
                      } catch {}
                    }
                    const titleText = document.title || "";
                    const bodyLen = (document.body && document.body.innerText
                      ? document.body.innerText.length
                      : 0);
                    if (!userInfo || !userInfo.user) {
                      // Fallback: read DOM (limited but better than nothing)
                      const bio =
                        (document.querySelector('[data-e2e="user-bio"]') || {}).textContent ||
                        "";
                      const nickname =
                        (document.querySelector('[data-e2e="user-subtitle"]') || {})
                          .textContent ||
                        (document.querySelector('h1[data-e2e="user-title"]') || {})
                          .textContent ||
                        "";
                      const avatar =
                        (document.querySelector('[data-e2e="user-avatar"] img') || {}).src ||
                        "";
                      if (!bio && !nickname && !avatar) {
                        return {
                          ready: false,
                          diag: { titleText: titleText.slice(0, 80), bodyLen },
                        };
                      }
                      return {
                        ready: true,
                        profile: {
                          handle: handleArg,
                          displayName: nickname || null,
                          bio: bio || null,
                          bioEmail: null,
                          verified: false,
                          region: null,
                          avatarUrl: avatar || null,
                          followerCount: null,
                          followingCount: null,
                          heartCount: null,
                          videoCount: null,
                          source: "dom-fallback",
                        },
                      };
                    }
                    const u = userInfo.user;
                    const s = userInfo.stats || {};
                    return {
                      ready: true,
                      profile: {
                        handle: handleArg,
                        displayName: u.nickname || u.uniqueId || null,
                        bio: u.signature || null,
                        bioEmail: u.bioEmail || null,
                        verified: !!u.verified,
                        region: u.region || null,
                        avatarUrl:
                          u.avatarLarger || u.avatarMedium || u.avatarThumb || null,
                        followerCount:
                          typeof s.followerCount === "number" ? s.followerCount : null,
                        followingCount:
                          typeof s.followingCount === "number" ? s.followingCount : null,
                        heartCount:
                          typeof s.heartCount === "number" ? s.heartCount : null,
                        videoCount:
                          typeof s.videoCount === "number" ? s.videoCount : null,
                        source: "ssr",
                      },
                    };
                  },
                  args: [cleaned],
                });
                const out = results && results[0] && results[0].result;
                return out || { ready: false, diag: { reason: "no_result" } };
              } catch (err) {
                return { ready: false, diag: { error: String(err?.message || err) } };
              }
            }

            // Poll the page after load — SPA may take a few seconds to populate.
            const onUpdated = async (tabId, info) => {
              if (tabId !== tab.id) return;
              if (info.status !== "complete") return;
              chrome.tabs.onUpdated.removeListener(onUpdated);
              // Try a few times with increasing delay
              for (const delay of [1500, 1500, 2000, 2500, 3000]) {
                if (done) return;
                await new Promise((r) => setTimeout(r, delay));
                const r = await tryExtract();
                if (r && r.ready && r.profile) {
                  return finish({ profile: r.profile });
                }
              }
              return finish({ error: "no_data_after_poll" });
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
          });
        });
      }

      const profiles = [];
      let idx = 0;
      for (const handle of handles) {
        idx += 1;
        const cleaned = String(handle).trim().replace(/^@/, "").toLowerCase();
        if (!cleaned) continue;
        dispatch({ kind: "profile_start", source: `@${cleaned}`, found: idx });
        const result = await scrapeProfile(cleaned);
        if (result?.profile) {
          profiles.push(result.profile);
          dispatch({
            kind: "profile_done",
            source: `@${cleaned}`,
            found: result.profile.bioEmail ? 1 : 0,
          });
        } else {
          dispatch({
            kind: "profile_error",
            source: `@${cleaned}`,
            error: result?.error || "unknown",
          });
        }
        // Light throttle between tabs
        await new Promise((r) => setTimeout(r, 400));
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
