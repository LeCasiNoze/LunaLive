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

  // Scrape a seed's network: open seed profile (logged session sees videos in SSR),
  // extract last N video URLs, then open each video to scrape commenters + mentions.
  if (message?.type === "LUNALIVE_TIKTOK_SEED_NETWORK") {
    (async () => {
      const {
        seedHandle = "",
        videoLimit = 5,
        commentsPerVideo = 30,
        visible = false,
        timeoutMs = 60_000,
      } = message.payload || {};

      const cleaned = String(seedHandle).trim().replace(/^@/, "").toLowerCase();
      if (!cleaned) {
        sendResponse({ ok: false, error: "invalid_handle" });
        return;
      }

      const dispatch = (event) => {
        try {
          chrome.tabs
            .sendMessage(sender.tab.id, { type: "LUNALIVE_TIKTOK_PROGRESS", event })
            .catch(() => {});
        } catch {}
      };

      // STEP 1 — open seed profile, extract recent video URLs
      async function getSeedVideos() {
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
              clearTimeout(timer);
              chrome.tabs.remove(tab.id).catch(() => {});
              resolve(result);
            };
            const timer = setTimeout(() => finish({ error: "tab_timeout" }), timeoutMs);

            const onUpdated = async (tabId, info) => {
              if (tabId !== tab.id || info.status !== "complete") return;
              chrome.tabs.onUpdated.removeListener(onUpdated);

              for (const delay of [2000, 2500, 3000, 3500]) {
                if (done) return;
                await new Promise((r) => setTimeout(r, delay));
                try {
                  const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (max) => {
                      // Multi-strategy video URL extraction
                      const set = new Set();
                      const stats = {
                        anchorsTotal: 0,
                        anchorsVideo: 0,
                        userPostItems: 0,
                        loginWall: false,
                        hasUniversalData: false,
                        title: (document.title || "").slice(0, 80),
                      };

                      // Trigger lazy load
                      window.scrollBy(0, 1500);

                      // Strategy 1: anchors with /@user/video/123
                      const anchors = document.querySelectorAll("a[href]");
                      stats.anchorsTotal = anchors.length;
                      for (const a of Array.from(anchors)) {
                        const href = a.getAttribute("href") || "";
                        const m = href.match(/\/@([A-Za-z0-9._]{1,30})\/video\/(\d+)/);
                        if (m) {
                          stats.anchorsVideo++;
                          const abs = href.startsWith("http")
                            ? href
                            : `https://www.tiktok.com${href}`;
                          set.add(abs);
                          if (set.size >= max) break;
                        }
                      }
                      stats.userPostItems = document.querySelectorAll(
                        '[data-e2e="user-post-item"]'
                      ).length;

                      // Strategy 2: SSR JSON
                      if (set.size < max) {
                        const script = document.getElementById(
                          "__UNIVERSAL_DATA_FOR_REHYDRATION__"
                        );
                        if (script && script.textContent) {
                          stats.hasUniversalData = true;
                          try {
                            const parsed = JSON.parse(script.textContent);
                            const scope = (parsed && parsed.__DEFAULT_SCOPE__) || {};
                            const candidates = [
                              scope["webapp.user-post"]?.itemList,
                              scope["webapp.user-detail"]?.itemList,
                              scope["webapp.video-list"]?.itemList,
                            ];
                            for (const list of candidates) {
                              if (Array.isArray(list)) {
                                for (const v of list) {
                                  const id = v?.id;
                                  const author = v?.author?.uniqueId;
                                  if (id && author) {
                                    set.add(
                                      `https://www.tiktok.com/@${author}/video/${id}`
                                    );
                                    if (set.size >= max) break;
                                  }
                                }
                              }
                              if (set.size >= max) break;
                            }
                          } catch {}
                        }
                      }

                      // Strategy 3: regex on outerHTML
                      if (set.size < max) {
                        const html = document.documentElement.outerHTML;
                        const re =
                          /\/@([A-Za-z0-9._]{1,30})\/video\/(\d{15,25})/g;
                        let m;
                        while ((m = re.exec(html)) && set.size < max) {
                          set.add(`https://www.tiktok.com/@${m[1]}/video/${m[2]}`);
                        }
                      }

                      const bodyText = (document.body?.innerText || "")
                        .slice(0, 4000)
                        .toLowerCase();
                      stats.loginWall =
                        bodyText.includes("log in to tiktok") ||
                        bodyText.includes("connectez-vous") ||
                        bodyText.includes("connecte-toi");

                      return { videos: Array.from(set), stats };
                    },
                    args: [videoLimit],
                  });
                  const out = results && results[0] && results[0].result;
                  if (out && out.videos && out.videos.length > 0) {
                    return finish({ videos: out.videos, stats: out.stats });
                  }
                } catch (err) {
                  // continue polling
                }
              }
              return finish({ error: "no_videos_after_poll" });
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
          });
        });
      }

      // STEP 2 — open one video, scrape commenters & description mentions
      async function scrapeVideo(videoUrl) {
        return new Promise((resolve) => {
          chrome.tabs.create({ url: videoUrl, active: visible }, async (tab) => {
            if (chrome.runtime.lastError || !tab?.id) {
              return resolve({
                error: chrome.runtime.lastError?.message || "tab_create_failed",
              });
            }
            let done = false;
            const finish = (result) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              chrome.tabs.remove(tab.id).catch(() => {});
              resolve(result);
            };
            const timer = setTimeout(
              () => finish({ error: "video_tab_timeout" }),
              45_000
            );

            const onUpdated = async (tabId, info) => {
              if (tabId !== tab.id || info.status !== "complete") return;
              chrome.tabs.onUpdated.removeListener(onUpdated);

              await new Promise((r) => setTimeout(r, 3500));

              // Scroll comments + extract
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () => {
                    return new Promise((resolve) => {
                      let i = 0;
                      const tick = () => {
                        const panel = document.querySelector(
                          '[data-e2e="comment-list"], [data-e2e*="comment"]'
                        );
                        if (panel) panel.scrollBy(0, 1500);
                        else window.scrollBy(0, 1200);
                        i++;
                        if (i < 6) setTimeout(tick, 1000);
                        else resolve(true);
                      };
                      tick();
                    });
                  },
                  args: [],
                });
              } catch {}

              try {
                const results = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: (max) => {
                    const out = {
                      commenters: [],
                      desc: "",
                      diag: { commentNodes: 0, hasDesc: false },
                    };
                    const HRE = /^[A-Za-z0-9._]{1,30}$/;
                    const seen = new Set();
                    const nodes = document.querySelectorAll(
                      '[data-e2e^="comment-username"], a[href^="/@"]'
                    );
                    out.diag.commentNodes = nodes.length;
                    for (const n of Array.from(nodes)) {
                      const href = n.getAttribute("href") || "";
                      const m = href.match(/^\/@([A-Za-z0-9._]{1,30})/);
                      if (m && HRE.test(m[1])) {
                        const h = m[1].toLowerCase();
                        if (!seen.has(h)) {
                          seen.add(h);
                          out.commenters.push(h);
                          if (out.commenters.length >= max) break;
                        }
                      }
                    }
                    const descEl = document.querySelector(
                      '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]'
                    );
                    if (descEl) {
                      out.desc = descEl.innerText || "";
                      out.diag.hasDesc = true;
                    }
                    return out;
                  },
                  args: [commentsPerVideo],
                });
                const out = results && results[0] && results[0].result;
                return finish(out || { commenters: [], desc: "", diag: {} });
              } catch (err) {
                return finish({ error: String(err?.message || err) });
              }
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
          });
        });
      }

      // RUN
      dispatch({ kind: "seed_start", source: `@${cleaned}` });
      const seedRes = await getSeedVideos();
      if (seedRes.error || !seedRes.videos?.length) {
        dispatch({
          kind: "seed_error",
          source: `@${cleaned}`,
          error: seedRes.error || "no_videos",
        });
        sendResponse({
          ok: false,
          error: seedRes.error || "no_videos",
          diag: seedRes.stats,
        });
        return;
      }

      dispatch({
        kind: "seed_videos_found",
        source: `@${cleaned}`,
        found: seedRes.videos.length,
      });

      const HRE = /^[A-Za-z0-9._]{1,30}$/;
      const seenSignals = new Set();
      const signals = [];

      for (const videoUrl of seedRes.videos.slice(0, videoLimit)) {
        const r = await scrapeVideo(videoUrl);
        if (r?.error) {
          dispatch({
            kind: "video_error",
            source: videoUrl,
            error: r.error,
          });
          continue;
        }
        for (const h of r.commenters || []) {
          if (!HRE.test(h) || h === cleaned) continue;
          const k = `comment:${h}`;
          if (seenSignals.has(k)) continue;
          seenSignals.add(k);
          signals.push({ handle: h, type: "comment" });
        }
        const re = /@([A-Za-z0-9._]{1,30})/g;
        let m;
        while ((m = re.exec(r.desc || ""))) {
          const h = m[1].toLowerCase();
          if (!HRE.test(h) || h === cleaned) continue;
          const k = `mention:${h}`;
          if (seenSignals.has(k)) continue;
          seenSignals.add(k);
          signals.push({ handle: h, type: "mention" });
        }
        dispatch({
          kind: "video_done",
          source: videoUrl,
          found: (r.commenters || []).length,
        });
        // Light throttle
        await new Promise((r) => setTimeout(r, 600));
      }

      dispatch({
        kind: "seed_done",
        source: `@${cleaned}`,
        found: signals.length,
      });
      sendResponse({ ok: true, signals, videosScraped: seedRes.videos.length });
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
