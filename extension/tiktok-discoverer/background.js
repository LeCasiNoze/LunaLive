// Background service worker — orchestrates TikTok scraping in user's browser.
// Receives requests from content_lunalive.js, opens TikTok tabs in background,
// waits for content_tiktok.js to scrape, returns results.

const PENDING = new Map(); // tabId -> { resolve, reject, timeout }

// ─── chrome.debugger helper for TRUSTED clicks ─────────────────────────────
// TikTok ignores synthetic clicks (event.isTrusted = false). chrome.debugger
// uses Chrome DevTools Protocol to dispatch real Input.dispatchMouseEvent
// which produces isTrusted = true events that React handlers accept.
const DEBUGGER_ATTACHED = new Set();

async function attachDebugger(tabId) {
  if (DEBUGGER_ATTACHED.has(tabId)) return;
  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        // Already attached or ignorable
        const msg = chrome.runtime.lastError.message || "";
        if (/already attached/i.test(msg)) {
          DEBUGGER_ATTACHED.add(tabId);
          resolve();
        } else {
          reject(new Error(msg));
        }
        return;
      }
      DEBUGGER_ATTACHED.add(tabId);
      resolve();
    });
  });
}

async function detachDebugger(tabId) {
  if (!DEBUGGER_ATTACHED.has(tabId)) return;
  await new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      DEBUGGER_ATTACHED.delete(tabId);
      resolve();
    });
  });
}

async function cdpSend(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
      if (chrome.runtime.lastError)
        return reject(new Error(chrome.runtime.lastError.message));
      resolve(result);
    });
  });
}

// Click an element by its bounding rect center via CDP (trusted event).
async function trustedClickRect(tabId, rect) {
  const x = Math.floor(rect.left + rect.width / 2);
  const y = Math.floor(rect.top + rect.height / 2);
  try {
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
    });
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    return { ok: true, x, y };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// Trusted keyboard event via CDP. Useful when wheel doesn't trigger
// virtual list loading. Common keys: "PageDown", "End", "ArrowDown".
async function trustedKey(tabId, key, code) {
  try {
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: code || key,
      windowsVirtualKeyCode: KEY_CODES[key] || 0,
    });
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: code || key,
      windowsVirtualKeyCode: KEY_CODES[key] || 0,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
const KEY_CODES = {
  PageDown: 34,
  PageUp: 33,
  End: 35,
  Home: 36,
  ArrowDown: 40,
  ArrowUp: 38,
};

// Click at coords without re-finding rect (used to focus the panel before keyboard input)
async function trustedClickAt(tabId, x, y) {
  try {
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
    });
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// Trusted wheel scroll at coordinates via CDP. Many TikTok virtual lists only
// load more content when they receive a real wheel event with isTrusted=true.
async function trustedWheel(tabId, x, y, deltaY) {
  try {
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      deltaX: 0,
      deltaY,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// Find an element matching a JS finder fn (in page) and return its rect.
async function findRect(tabId, finderFn, ...args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: finderFn,
    args,
  });
  return (results && results[0] && results[0].result) || null;
}


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
        affilPatterns = [],
        scrapeFollowing = true,
        followingLimit = 200,
        excludeVideoUrls = [],
      } = message.payload || {};

      const excludeSet = new Set(
        (Array.isArray(excludeVideoUrls) ? excludeVideoUrls : []).map((u) => String(u))
      );

      // Patterns à matcher en substring case-insensitive dans les descriptions
      // (ex: "taap.it/abc123", "lunalive.win/r/golden-chest", etc.)
      const patterns = (Array.isArray(affilPatterns) ? affilPatterns : [])
        .map((p) => String(p || "").trim().toLowerCase().replace(/^https?:\/\//, ""))
        .filter((p) => p.length >= 2);

      function descHasAffil(desc) {
        if (!desc) return false;
        const lower = String(desc).toLowerCase();
        for (const p of patterns) {
          if (lower.includes(p)) return true;
        }
        return false;
      }

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
      // We grab a bigger pool than videoLimit so we can skip already-scraped
      // ones and still have enough fresh ones to scrape.
      const videoPoolSize = Math.max(videoLimit * 4, videoLimit + excludeSet.size + 5);
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
                    func: (max, seedHandle) => {
                      // Multi-strategy video URL extraction.
                      // CRITICAL: only keep videos whose author === seedHandle.
                      // TikTok now renders "You may like" / recommended videos
                      // on profile pages, which would otherwise pollute the set.
                      const seed = String(seedHandle || "").toLowerCase();
                      const set = new Set();
                      const stats = {
                        anchorsTotal: 0,
                        anchorsVideo: 0,
                        anchorsForeign: 0,
                        userPostItems: 0,
                        loginWall: false,
                        hasUniversalData: false,
                        title: (document.title || "").slice(0, 80),
                      };

                      // Trigger lazy load
                      window.scrollBy(0, 1500);

                      // Strategy 1: anchors with /@user/video/123 — filter by seed
                      // Restrict to the user-post grid when possible to be extra safe.
                      const grid =
                        document.querySelector('[data-e2e="user-post-item-list"]') ||
                        document.querySelector('[data-e2e="user-post-item-desc"]')?.closest("div") ||
                        document;
                      const anchors = (grid || document).querySelectorAll("a[href]");
                      stats.anchorsTotal = anchors.length;
                      for (const a of Array.from(anchors)) {
                        const href = a.getAttribute("href") || "";
                        const m = href.match(/\/@([A-Za-z0-9._]{1,30})\/video\/(\d+)/);
                        if (m) {
                          stats.anchorsVideo++;
                          if (m[1].toLowerCase() !== seed) {
                            stats.anchorsForeign++;
                            continue;
                          }
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

                      // Strategy 2: SSR JSON — filter by seed author
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
                                  const author = (v?.author?.uniqueId || "").toLowerCase();
                                  if (id && author && author === seed) {
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

                      // Strategy 3: regex on outerHTML — filter by seed
                      if (set.size < max) {
                        const html = document.documentElement.outerHTML;
                        const re =
                          /\/@([A-Za-z0-9._]{1,30})\/video\/(\d{15,25})/g;
                        let m;
                        while ((m = re.exec(html)) && set.size < max) {
                          if (m[1].toLowerCase() !== seed) continue;
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
                    args: [videoPoolSize, cleaned],
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

      // STEP 3 — scrape /following list (logged session required)
      async function scrapeFollowingList() {
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
            const timer = setTimeout(
              () => finish({ error: "following_tab_timeout" }),
              90_000
            );

            const onUpdated = async (tabId, info) => {
              if (tabId !== tab.id || info.status !== "complete") return;
              chrome.tabs.onUpdated.removeListener(onUpdated);
              await new Promise((r) => setTimeout(r, 3500));

              // Click on the "Following" / "Abonnements" stat to open the modal.
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () => {
                    const btn = document.querySelector(
                      '[data-e2e="following-count"], [data-e2e="following"]'
                    );
                    if (btn) {
                      const clickable =
                        btn.closest("button,a,[role='button']") || btn.parentElement || btn;
                      if (clickable && typeof clickable.click === "function") {
                        clickable.click();
                      }
                    }
                  },
                  args: [],
                });
              } catch {}

              await new Promise((r) => setTimeout(r, 2500));

              // Scroll inside the modal — find the actual scrollable container.
              // TikTok's class names are obfuscated, so we detect any element
              // inside [role="dialog"] that has overflow-y:auto/scroll AND
              // scrollHeight > clientHeight, and scroll the deepest one.
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () =>
                    new Promise((resolve) => {
                      function findScrollables() {
                        const dialog =
                          document.querySelector('[role="dialog"]') ||
                          document.querySelector('div[aria-modal="true"]');
                        const root = dialog || document.body;
                        const out = [];
                        const all = root.querySelectorAll("*");
                        for (const el of Array.from(all)) {
                          try {
                            const cs = getComputedStyle(el);
                            if (
                              (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
                              el.scrollHeight - el.clientHeight > 50
                            ) {
                              out.push(el);
                            }
                          } catch {}
                        }
                        // Also include the dialog itself if scrollable
                        if (
                          dialog &&
                          dialog.scrollHeight - dialog.clientHeight > 50 &&
                          !out.includes(dialog)
                        ) {
                          out.push(dialog);
                        }
                        return out;
                      }

                      let i = 0;
                      let lastCount = -1;
                      let stableTicks = 0;
                      const tick = () => {
                        const targets = findScrollables();
                        if (targets.length === 0) {
                          // fallback: dispatch wheel on dialog
                          const d =
                            document.querySelector('[role="dialog"]') ||
                            document.querySelector('div[aria-modal="true"]');
                          if (d) {
                            d.dispatchEvent(
                              new WheelEvent("wheel", {
                                deltaY: 1500,
                                bubbles: true,
                                cancelable: true,
                              })
                            );
                          }
                        } else {
                          for (const el of targets) {
                            try {
                              el.scrollBy({ top: 1500 });
                              if (el.scrollTop === 0) {
                                el.scrollTop += 1500;
                              }
                            } catch {}
                          }
                        }

                        // Count current loaded handles to detect when we plateau
                        const dialogEl =
                          document.querySelector('[role="dialog"]') ||
                          document.querySelector('div[aria-modal="true"]') ||
                          document.body;
                        const currCount = dialogEl
                          ? dialogEl.querySelectorAll('a[href^="/@"]').length
                          : 0;
                        if (currCount === lastCount) stableTicks++;
                        else {
                          stableTicks = 0;
                          lastCount = currCount;
                        }

                        i++;
                        // stop after 25 ticks OR after 4 stable ticks (no new handles)
                        if (i < 25 && stableTicks < 4) setTimeout(tick, 800);
                        else
                          resolve({
                            ticks: i,
                            finalCount: currCount,
                            scrollableCount: targets.length,
                          });
                      };
                      tick();
                    }),
                  args: [],
                });
              } catch {}

              try {
                const results = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: (max) => {
                    const HRE = /^[A-Za-z0-9._]{1,30}$/;
                    const set = new Set();
                    // Important: ONLY look inside the modal/dialog so we don't
                    // capture handles from videos rendered in the background.
                    const dialog =
                      document.querySelector('[role="dialog"]') ||
                      document.querySelector('div[aria-modal="true"]');
                    const scope = dialog || document;

                    const links = scope.querySelectorAll('a[href^="/@"]');
                    for (const a of Array.from(links)) {
                      const href = a.getAttribute("href") || "";
                      const m = href.match(/^\/@([A-Za-z0-9._]{1,30})/);
                      if (m && HRE.test(m[1])) {
                        set.add(m[1].toLowerCase());
                        if (set.size >= max) break;
                      }
                    }
                    return {
                      handles: Array.from(set),
                      diag: {
                        modalFound: !!dialog,
                        anchorsInScope: links.length,
                        anchorsTotalPage:
                          document.querySelectorAll('a[href^="/@"]').length,
                      },
                    };
                  },
                  args: [followingLimit],
                });
                const out = results && results[0] && results[0].result;
                return finish(
                  out || { handles: [], diag: { reason: "no_result" } }
                );
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

      // Filter out already-scraped videos from the pool, then take videoLimit fresh ones
      const freshVideos = seedRes.videos.filter((u) => !excludeSet.has(u));
      const skippedCount = seedRes.videos.length - freshVideos.length;
      const videosToScrape = freshVideos.slice(0, videoLimit);
      const scannedVideoUrls = []; // ce qu'on a effectivement scrapé avec succès
      dispatch({
        kind: "videos_filtered",
        source: `@${cleaned}`,
        found: videosToScrape.length,
        skipped: skippedCount,
      });

      let affilVideosCount = 0;
      for (const videoUrl of videosToScrape) {
        const r = await scrapeVideo(videoUrl);
        if (r?.error) {
          dispatch({
            kind: "video_error",
            source: videoUrl,
            error: r.error,
          });
          continue;
        }
        scannedVideoUrls.push(videoUrl);
        const isAffilVideo = descHasAffil(r.desc || "");
        if (isAffilVideo) affilVideosCount++;
        const commentType = isAffilVideo ? "affil_comment" : "comment";
        const mentionType = isAffilVideo ? "affil_mention" : "mention";

        for (const h of r.commenters || []) {
          if (!HRE.test(h) || h === cleaned) continue;
          const k = `${commentType}:${h}`;
          if (seenSignals.has(k)) continue;
          seenSignals.add(k);
          signals.push({ handle: h, type: commentType, sourceVideoUrl: videoUrl });
        }
        const re = /@([A-Za-z0-9._]{1,30})/g;
        let m;
        while ((m = re.exec(r.desc || ""))) {
          const h = m[1].toLowerCase();
          if (!HRE.test(h) || h === cleaned) continue;
          const k = `${mentionType}:${h}`;
          if (seenSignals.has(k)) continue;
          seenSignals.add(k);
          signals.push({ handle: h, type: mentionType, sourceVideoUrl: videoUrl });
        }
        dispatch({
          kind: "video_done",
          source: videoUrl,
          found: (r.commenters || []).length,
          isAffil: isAffilVideo,
        });
        await new Promise((r) => setTimeout(r, 600));
      }

      // Following list (logged session)
      let followingCount = 0;
      if (scrapeFollowing) {
        dispatch({ kind: "following_start", source: `@${cleaned}` });
        const f = await scrapeFollowingList();
        if (f?.error) {
          dispatch({
            kind: "following_error",
            source: `@${cleaned}`,
            error: f.error,
          });
        } else if (Array.isArray(f.handles)) {
          for (const h of f.handles) {
            if (!HRE.test(h) || h === cleaned) continue;
            const k = `following:${h}`;
            if (seenSignals.has(k)) continue;
            seenSignals.add(k);
            signals.push({ handle: h, type: "following" });
            followingCount++;
          }
          dispatch({
            kind: "following_done",
            source: `@${cleaned}`,
            found: followingCount,
          });
        }
      }

      dispatch({
        kind: "seed_done",
        source: `@${cleaned}`,
        found: signals.length,
        affilVideos: affilVideosCount,
        following: followingCount,
      });
      sendResponse({
        ok: true,
        signals,
        videosScraped: scannedVideoUrls.length,
        videosSkipped: skippedCount,
        scannedVideoUrls,
        affilVideosCount,
        followingCount,
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

  // Dump full /following list for a single handle (seed or candidate).
  // Used by the FSB Board to build the follow-graph (peer discovery).
  // Briefly focuses the new tab so TikTok's SPA fully boots, then scrolls
  // the modal (NOT the page background) until handles plateau.
  if (message?.type === "LUNALIVE_TIKTOK_DUMP_FOLLOWING") {
    (async () => {
      const { handle = "", maxScrollTicks = 80, maxHandles = 20000 } =
        message.payload || {};
      const cleaned = String(handle).trim().replace(/^@/, "").toLowerCase();
      if (!cleaned) {
        sendResponse({ ok: false, error: "invalid_handle" });
        return;
      }
      const senderTabId = sender.tab?.id || null;
      const url = `https://www.tiktok.com/@${encodeURIComponent(cleaned)}`;

      const result = await new Promise((resolve) => {
        // Open tab as ACTIVE so TikTok's SPA actually mounts (background
        // tabs are throttled and the user reported pages not loading).
        chrome.tabs.create({ url, active: true }, async (tab) => {
          if (chrome.runtime.lastError || !tab?.id) {
            return resolve({
              ok: false,
              error: chrome.runtime.lastError?.message || "tab_create_failed",
            });
          }
          let done = false;
          const finish = (r) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            // Detach debugger if still attached (idempotent)
            detachDebugger(tab.id).catch(() => {});
            // Restore focus to the original (lunalive) tab.
            if (senderTabId) {
              chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
            }
            chrome.tabs.remove(tab.id).catch(() => {});
            resolve(r);
          };
          const timer = setTimeout(
            () => finish({ ok: false, error: "following_timeout" }),
            120_000
          );

          const onUpdated = async (tabId, info) => {
            if (tabId !== tab.id || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(onUpdated);

            // Wait for SPA to mount.
            await new Promise((r) => setTimeout(r, 4500));

            // PRIVATE ACCOUNT CHECK — read SSR data; if profile is private,
            // bail explicitly so we don't capture suggestions as "follows".
            try {
              const probeRes = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                  let priv = false;
                  let secret = false;
                  let followingCount = null;
                  try {
                    const script = document.getElementById(
                      "__UNIVERSAL_DATA_FOR_REHYDRATION__"
                    );
                    if (script && script.textContent) {
                      const json = JSON.parse(script.textContent);
                      const scope = (json && json.__DEFAULT_SCOPE__) || {};
                      const ud = scope["webapp.user-detail"];
                      const u = ud?.userInfo?.user || null;
                      const s = ud?.userInfo?.stats || {};
                      if (u) {
                        priv = !!u.privateAccount;
                        secret = !!u.secret;
                        followingCount =
                          typeof s.followingCount === "number"
                            ? s.followingCount
                            : null;
                      }
                    }
                  } catch {}
                  return { priv, secret, followingCount };
                },
              });
              const probe = probeRes && probeRes[0] && probeRes[0].result;
              if (probe?.priv || probe?.secret) {
                return finish({
                  ok: false,
                  error: "private_account",
                  diag: probe,
                });
              }
            } catch {}

            // Attach chrome.debugger to send TRUSTED clicks (TikTok's React
            // handlers ignore synthetic events with isTrusted=false).
            try {
              await attachDebugger(tab.id);
            } catch (err) {
              return finish({
                ok: false,
                error: "debugger_attach_failed",
                diag: { reason: String(err?.message || err) },
              });
            }

            // Pre-click DOM snapshot for diagnostics
            let preSnap = null;
            try {
              const snapRes = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                  followBtns: document.querySelectorAll(
                    '[data-e2e="follow-button"]'
                  ).length,
                  anchors: document.querySelectorAll('a[href^="/@"]').length,
                  hasUserListContainer: !!document.querySelector(
                    '[class*="UserListContainer"]'
                  ),
                }),
              });
              preSnap = snapRes && snapRes[0] && snapRes[0].result;
            } catch {}

            // Try opening the modal up to 4 times with TRUSTED clicks
            let modalOpened = false;
            const allDiag = { preSnap, attempts: [] };
            for (let attempt = 0; attempt < 4 && !modalOpened; attempt++) {
              const attemptDiag = { attempt };
              try {
                // Find the rect of the "Following" stat to click via CDP
                const rectInfo = await findRect(tab.id, () => {
                  function findClickable(seed) {
                    if (!seed) return null;
                    let n = seed;
                    for (let i = 0; i < 6 && n; i++) {
                      const cls = (n.className || "").toString();
                      if (
                        n.tagName === "BUTTON" ||
                        n.tagName === "A" ||
                        n.tagName === "STRONG" ||
                        n.getAttribute?.("role") === "button" ||
                        /count-item|stat|FollowInfo|tab/i.test(cls)
                      ) {
                        return n;
                      }
                      n = n.parentElement;
                    }
                    return seed;
                  }
                  const seeds = [
                    document.querySelector('strong[data-e2e="following-count"]'),
                    document.querySelector('[data-e2e="following-count"]'),
                    document.querySelector('[data-e2e="following"]'),
                    ...Array.from(
                      document.querySelectorAll('button,a,[role="button"],div,strong,span')
                    ).filter((el) => {
                      const txt = (el.textContent || "").trim().toLowerCase();
                      if (!txt || txt.length > 60) return false;
                      return /(\bfollowing\b|\babonnements\b|\babonnement\b|\bsuivis\b)/.test(txt);
                    }),
                  ].filter(Boolean);
                  if (!seeds.length) return { found: false, count: 0 };
                  const target = findClickable(seeds[0]);
                  if (!target) return { found: false, count: seeds.length };
                  // Make sure target is in viewport
                  target.scrollIntoView({ block: "center", behavior: "auto" });
                  const r = target.getBoundingClientRect();
                  return {
                    found: true,
                    count: seeds.length,
                    rect: {
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                    },
                    text: (target.textContent || "").slice(0, 60),
                    cls: (target.className || "").toString().slice(0, 60),
                    tag: target.tagName,
                  };
                });
                attemptDiag.rectInfo = rectInfo;
                if (rectInfo?.found && rectInfo.rect) {
                  // Wait briefly for scrollIntoView to settle
                  await new Promise((r) => setTimeout(r, 400));
                  const clickRes = await trustedClickRect(tab.id, rectInfo.rect);
                  attemptDiag.click = clickRes;
                }
                // Wait for modal to actually appear (poll up to 4s).
                // TikTok no longer uses role="dialog". Detect by CONTENT SHAPE:
                // a container with ≥3 user links AND ≥3 follow-buttons is the
                // user list (Following or Followers modal).
                let lastCheck = null;
                for (let pollI = 0; pollI < 8; pollI++) {
                  await new Promise((r) => setTimeout(r, 500));
                  const checkRes = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                      // Priorité 1: la classe TikTok UserListContainer est
                      // PREUVE SUFFISANTE qu'on est dans la modale.
                      let scope =
                        document.querySelector(
                          '[class*="DivUserListContainer"]'
                        ) ||
                        document.querySelector(
                          '[class*="UserListContainer"]'
                        ) ||
                        null;
                      let scopeSource = scope ? "class" : null;
                      // Priorité 2: legacy role=dialog (TikTok ne l'utilise
                      // plus mais on garde pour compat)
                      if (!scope) {
                        scope =
                          document.querySelector('[role="dialog"]') ||
                          document.querySelector('div[aria-modal="true"]') ||
                          null;
                        if (scope) scopeSource = "dialog";
                      }
                      // Priorité 3: shape — div avec ≥3 follow-buttons + anchors
                      if (!scope) {
                        const fb = document.querySelectorAll(
                          '[data-e2e="follow-button"]'
                        );
                        if (fb.length >= 3) {
                          let node = fb[0].parentElement;
                          while (node && node !== document.body) {
                            const lb = node.querySelectorAll(
                              '[data-e2e="follow-button"]'
                            );
                            const ll = node.querySelectorAll(
                              'a[href^="/@"]'
                            );
                            if (
                              lb.length >= 3 &&
                              ll.length >= 3 &&
                              lb.length >= fb.length / 2
                            ) {
                              scope = node;
                              scopeSource = "shape";
                              break;
                            }
                            node = node.parentElement;
                          }
                        }
                      }
                      if (!scope) return { open: false };
                      const links = scope.querySelectorAll('a[href^="/@"]');
                      const followBtns = scope.querySelectorAll(
                        '[data-e2e="follow-button"]'
                      );
                      return {
                        open: true,
                        anchors: links.length,
                        followBtns: followBtns.length,
                        scopeSource,
                        scopeClass: (scope.className || "").toString().slice(0, 60),
                      };
                    },
                  });
                  const out = checkRes && checkRes[0] && checkRes[0].result;
                  lastCheck = out;
                  // ACCEPT if:
                  // - scope detected via class match (truly the modal) AND ≥3 anchors
                  // - OR scope detected via shape (≥3 follow-buttons by construction)
                  // - OR legacy dialog AND ≥3 anchors
                  if (
                    out?.open &&
                    out.anchors >= 3 &&
                    (out.scopeSource === "class" ||
                      out.scopeSource === "dialog" ||
                      out.followBtns >= 3)
                  ) {
                    modalOpened = true;
                    break;
                  }
                }
                attemptDiag.lastCheck = lastCheck;
                allDiag.attempts.push(attemptDiag);
                // Last resort for next attempt: scroll up to ensure stats bar visible
                if (!modalOpened) {
                  await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => window.scrollTo(0, 0),
                  });
                  await new Promise((r) => setTimeout(r, 1500));
                }
              } catch (err) {
                attemptDiag.error = String(err?.message || err);
                allDiag.attempts.push(attemptDiag);
              }
            }
            if (!modalOpened) {
              await detachDebugger(tab.id).catch(() => {});
              return finish({
                ok: false,
                error: "modal_not_opened",
                diag: { handle: cleaned, ...allDiag },
              });
            }

            // Aggressive scroll loop: hybrid programmatic + TRUSTED wheel.
            // Multiple wheel ticks per iteration to force virtual list growth.
            await new Promise((r) => setTimeout(r, 1500)); // Let modal settle
            allDiag.scrollAnchors = [];
            allDiag.scrollStable = 0;
            try {
              for (let scrollI = 0; scrollI < maxScrollTicks; scrollI++) {
                const rectInfo = await findRect(tab.id, () => {
                  let scope =
                    document.querySelector('[class*="DivUserListContainer"]') ||
                    document.querySelector('[class*="UserListContainer"]') ||
                    document.querySelector('[role="dialog"]') ||
                    document.querySelector('div[aria-modal="true"]') ||
                    null;
                  if (!scope) return { found: false };
                  const r = scope.getBoundingClientRect();
                  // Find ALL scrollable candidates (ancestors + descendants)
                  const candidates = [];
                  let node = scope;
                  for (let i = 0; i < 6 && node; i++) {
                    try {
                      const cs = getComputedStyle(node);
                      if (
                        (cs.overflowY === "auto" ||
                          cs.overflowY === "scroll") &&
                        node.scrollHeight - node.clientHeight > 10
                      ) {
                        candidates.push(node);
                      }
                    } catch {}
                    node = node.parentElement;
                  }
                  const all = scope.querySelectorAll("*");
                  for (const el of Array.from(all)) {
                    try {
                      const cs = getComputedStyle(el);
                      if (
                        (cs.overflowY === "auto" ||
                          cs.overflowY === "scroll") &&
                        el.scrollHeight - el.clientHeight > 10
                      ) {
                        candidates.push(el);
                      }
                    } catch {}
                  }
                  // Scroll EVERY candidate (the scroller might be elsewhere
                  // than expected; scrolling many is harmless)
                  for (const t of candidates) {
                    try {
                      t.scrollBy({ top: 4000 });
                      t.scrollTop = t.scrollTop + 4000;
                    } catch {}
                  }
                  // Also scroll into view the LAST list item (forces virtual list to load next)
                  const items = scope.querySelectorAll("li, [class*='UserContainer']");
                  if (items.length) {
                    try {
                      items[items.length - 1].scrollIntoView({ block: "end" });
                    } catch {}
                  }
                  const links = scope.querySelectorAll('a[href^="/@"]').length;
                  return {
                    found: true,
                    anchors: links,
                    candidatesCount: candidates.length,
                    itemsCount: items.length,
                    rect: {
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                    },
                  };
                });
                if (!rectInfo?.found || !rectInfo.rect) break;
                // 3 trusted wheels per tick at modal center for extra punch
                const cx = Math.floor(rectInfo.rect.left + rectInfo.rect.width / 2);
                const cy = Math.floor(rectInfo.rect.top + rectInfo.rect.height / 2);
                await trustedWheel(tab.id, cx, cy, 3500);
                await new Promise((r) => setTimeout(r, 250));
                await trustedWheel(tab.id, cx, cy, 3500);
                await new Promise((r) => setTimeout(r, 250));
                await trustedWheel(tab.id, cx, cy, 3500);
                await new Promise((r) => setTimeout(r, 700));
                // Track plateau
                const last =
                  allDiag.scrollAnchors[allDiag.scrollAnchors.length - 1];
                allDiag.scrollAnchors.push(rectInfo.anchors);
                if (last === rectInfo.anchors) {
                  allDiag.scrollStable++;
                } else {
                  allDiag.scrollStable = 0;
                }
                // Plateau threshold raised from 6 → 12 (~12s of no growth)
                if (allDiag.scrollStable >= 12) break;
              }
            } catch (err) {
              allDiag.scrollError = String(err?.message || err);
            }
            // Old in-page scroll loop kept as belt-and-braces (truncated)
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (max) =>
                  new Promise((resolve) => {
                    function findDialog() {
                      // Same detection as the open-check (TikTok no longer
                      // uses role=dialog). Match any container with ≥3
                      // follow-buttons + user anchors.
                      let scope =
                        document.querySelector('[role="dialog"]') ||
                        document.querySelector('div[aria-modal="true"]') ||
                        null;
                      if (!scope) {
                        const fb = document.querySelectorAll(
                          '[data-e2e="follow-button"]'
                        );
                        if (fb.length >= 3) {
                          let node = fb[0].parentElement;
                          while (node && node !== document.body) {
                            const lb = node.querySelectorAll(
                              '[data-e2e="follow-button"]'
                            );
                            const ll = node.querySelectorAll('a[href^="/@"]');
                            if (
                              lb.length >= 3 &&
                              ll.length >= 3 &&
                              lb.length >= fb.length / 2
                            ) {
                              scope = node;
                              break;
                            }
                            node = node.parentElement;
                          }
                        }
                      }
                      if (!scope) {
                        scope =
                          document.querySelector(
                            '[class*="DivUserListContainer"]'
                          ) ||
                          document.querySelector(
                            '[class*="UserListContainer"]'
                          );
                      }
                      return scope;
                    }
                    function findModalScrollable(dialog) {
                      if (!dialog) return null;
                      // Walk ancestors first — sometimes the list element
                      // itself doesn't scroll, but its parent does.
                      let node = dialog;
                      for (let i = 0; i < 5 && node; i++) {
                        try {
                          const cs = getComputedStyle(node);
                          if (
                            (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
                            node.scrollHeight - node.clientHeight > 30
                          ) {
                            return node;
                          }
                        } catch {}
                        node = node.parentElement;
                      }
                      // Prefer the deepest scrollable child within the dialog
                      const all = dialog.querySelectorAll("*");
                      let best = null;
                      let bestDepth = -1;
                      for (const el of Array.from(all)) {
                        try {
                          const cs = getComputedStyle(el);
                          if (
                            (cs.overflowY === "auto" ||
                              cs.overflowY === "scroll") &&
                            el.scrollHeight - el.clientHeight > 50
                          ) {
                            // Compute depth so we pick the innermost scroller
                            let depth = 0;
                            let p = el;
                            while (p && p !== dialog) {
                              p = p.parentElement;
                              depth++;
                            }
                            if (depth > bestDepth) {
                              best = el;
                              bestDepth = depth;
                            }
                          }
                        } catch {}
                      }
                      // Fall back to the dialog itself if nothing scrollable inside
                      if (
                        !best &&
                        dialog.scrollHeight - dialog.clientHeight > 50
                      ) {
                        best = dialog;
                      }
                      return best;
                    }
                    let i = 0;
                    let lastCount = -1;
                    let stableTicks = 0;
                    const tick = () => {
                      const dialog = findDialog();
                      const target = findModalScrollable(dialog);

                      if (target) {
                        try {
                          target.scrollBy({ top: 2400, behavior: "auto" });
                          // Some implementations ignore scrollBy and need scrollTop manual write
                          target.scrollTop = target.scrollTop + 2400;
                          // Also dispatch a wheel inside the target — rarely needed
                          target.dispatchEvent(
                            new WheelEvent("wheel", {
                              deltaY: 2400,
                              bubbles: true,
                              cancelable: true,
                            })
                          );
                        } catch {}
                      } else if (dialog) {
                        // Modal exists but no scrollable detected → wheel on dialog
                        try {
                          dialog.dispatchEvent(
                            new WheelEvent("wheel", {
                              deltaY: 2400,
                              bubbles: true,
                              cancelable: true,
                            })
                          );
                        } catch {}
                      }
                      // EXPLICITLY DO NOT scroll window/body — that was the
                      // bug user reported: list of 'follows of background page'.

                      const scope = dialog || document.body;
                      const links = scope.querySelectorAll('a[href^="/@"]');
                      const currCount = links.length;

                      if (currCount === lastCount) stableTicks++;
                      else {
                        stableTicks = 0;
                        lastCount = currCount;
                      }
                      i++;
                      // Stop after 6 stable ticks (truly plateaued) or max ticks
                      if (i < max && stableTicks < 6) {
                        setTimeout(tick, 700);
                      } else {
                        resolve({
                          ticks: i,
                          finalAnchorCount: currCount,
                          modalFound: !!dialog,
                          scrollTargetFound: !!target,
                        });
                      }
                    };
                    tick();
                  }),
                args: [maxScrollTicks],
              });
            } catch {}

            // Final extraction — ONLY from inside the modal
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (max, ownHandle) => {
                  const HRE = /^[A-Za-z0-9._]{1,30}$/;
                  const set = new Set();
                  // Priorité: class match TikTok (preuve = vraie modale)
                  let scope =
                    document.querySelector('[class*="DivUserListContainer"]') ||
                    document.querySelector('[class*="UserListContainer"]') ||
                    null;
                  if (!scope) {
                    scope =
                      document.querySelector('[role="dialog"]') ||
                      document.querySelector('div[aria-modal="true"]') ||
                      null;
                  }
                  if (!scope) {
                    const fb = document.querySelectorAll(
                      '[data-e2e="follow-button"]'
                    );
                    if (fb.length >= 3) {
                      let node = fb[0].parentElement;
                      while (node && node !== document.body) {
                        const lb = node.querySelectorAll(
                          '[data-e2e="follow-button"]'
                        );
                        const ll = node.querySelectorAll('a[href^="/@"]');
                        if (
                          lb.length >= 3 &&
                          ll.length >= 3 &&
                          lb.length >= fb.length / 2
                        ) {
                          scope = node;
                          break;
                        }
                        node = node.parentElement;
                      }
                    }
                  }
                  if (!scope) {
                    return {
                      handles: [],
                      diag: {
                        modalFound: false,
                        anchorsInScope: 0,
                        followBtnsTotalPage: document.querySelectorAll(
                          '[data-e2e="follow-button"]'
                        ).length,
                        anchorsTotalPage: document.querySelectorAll('a[href^="/@"]').length,
                        title: document.title.slice(0, 80),
                        bail: "no_modal_at_extract",
                      },
                    };
                  }
                  const links = scope.querySelectorAll('a[href^="/@"]');
                  for (const a of Array.from(links)) {
                    const href = a.getAttribute("href") || "";
                    const m = href.match(/^\/@([A-Za-z0-9._]{1,30})/);
                    if (m && HRE.test(m[1])) {
                      const h = m[1].toLowerCase();
                      if (h !== ownHandle) set.add(h);
                      if (set.size >= max) break;
                    }
                  }
                  return {
                    handles: Array.from(set),
                    diag: {
                      modalFound: true,
                      anchorsInScope: links.length,
                      anchorsTotalPage: document.querySelectorAll('a[href^="/@"]').length,
                      scopeClass: (scope.className || "").slice(0, 80),
                      title: document.title.slice(0, 80),
                    },
                  };
                },
                args: [maxHandles, cleaned],
              });
              const out = (results && results[0] && results[0].result) || null;
              // Reject if extraction bailed (no dialog) or got 0 handles
              const handlesOk = out && out.handles && out.handles.length > 0;
              // Merge scroll diag into the final diag for visibility
              const mergedDiag = {
                ...(out?.diag || {}),
                scrollAnchors: allDiag?.scrollAnchors || [],
                scrollStable: allDiag?.scrollStable ?? null,
                scrollTicks: (allDiag?.scrollAnchors || []).length,
              };
              return finish({
                ok: !!handlesOk,
                error: handlesOk ? undefined : "no_handles_extracted",
                handle: cleaned,
                handles: out?.handles || [],
                total: out?.handles?.length || 0,
                diag: mergedDiag,
              });
            } catch (err) {
              return finish({ ok: false, error: String(err?.message || err) });
            }
          };
          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      });

      sendResponse(result);
    })();
    return true;
  }

  // TEST: scrape commenters of a single TikTok video URL (standalone).
  // Used by the FSB Board test panel to validate that the comment-list
  // scrolling works before running the full pipeline.
  if (message?.type === "LUNALIVE_TIKTOK_TEST_VIDEO_COMMENTS") {
    (async () => {
      const { videoUrl = "", maxScrollTicks = 12 } = message.payload || {};
      if (!/^https?:\/\/(www\.)?tiktok\.com\/.+\/video\/\d+/i.test(videoUrl)) {
        sendResponse({ ok: false, error: "invalid_video_url" });
        return;
      }
      const senderTabId = sender.tab?.id || null;
      const result = await new Promise((resolve) => {
        chrome.tabs.create({ url: videoUrl, active: true }, async (tab) => {
          if (chrome.runtime.lastError || !tab?.id) {
            return resolve({
              ok: false,
              error: chrome.runtime.lastError?.message || "tab_create_failed",
            });
          }
          let done = false;
          const finish = (r) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            detachDebugger(tab.id).catch(() => {});
            if (senderTabId)
              chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
            chrome.tabs.remove(tab.id).catch(() => {});
            resolve(r);
          };
          const timer = setTimeout(
            () => finish({ ok: false, error: "video_test_timeout" }),
            90_000
          );
          const onUpdated = async (tabId, info) => {
            if (tabId !== tab.id || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            await new Promise((r) => setTimeout(r, 4500));

            // STEP A — Make sure the "Commentaires" tab is selected.
            // Use chrome.debugger to dispatch a TRUSTED click (TikTok ignores
            // synthetic clicks on its custom div tabs).
            const tabDiag = {
              attached: false,
              foundTab: false,
              clicked: false,
              commentListAfter: false,
            };
            try {
              await attachDebugger(tab.id);
              tabDiag.attached = true;
            } catch (err) {
              tabDiag.attachError = String(err?.message || err);
            }
            try {
              const rectInfo = await findRect(tab.id, () => {
                // Only target the actual tabbar-item div with text=Commentaires
                const spans = Array.from(
                  document.querySelectorAll('[data-testid="tux-web-text"]')
                ).filter((el) => {
                  const txt = (el.textContent || "").trim().toLowerCase();
                  return /^(commentaires?|comments)$/.test(txt);
                });
                if (!spans.length) {
                  // Fallback: any span/div with exact text match
                  const all = Array.from(
                    document.querySelectorAll("span,div,button,a")
                  ).filter((el) => {
                    const txt = (el.textContent || "").trim().toLowerCase();
                    if (txt.length > 30) return false;
                    return /^(commentaires?|comments)$/.test(txt);
                  });
                  if (!all.length) return { found: false, spansFound: 0 };
                  spans.push(...all);
                }
                spans.sort(
                  (a, b) =>
                    (a.textContent || "").length - (b.textContent || "").length
                );
                let target = spans[0];
                let walks = 0;
                for (let depth = 0; depth < 6 && target; depth++) {
                  walks = depth;
                  const cls = (target.className || "").toString();
                  if (
                    target.tagName === "BUTTON" ||
                    target.tagName === "A" ||
                    target.getAttribute?.("role") === "tab" ||
                    target.getAttribute?.("role") === "button" ||
                    /tabbar-item|TabBar/.test(cls)
                  ) {
                    break;
                  }
                  target = target.parentElement;
                }
                if (!target) return { found: false, spansFound: spans.length };
                target.scrollIntoView({ block: "center" });
                const r = target.getBoundingClientRect();
                return {
                  found: true,
                  spansFound: spans.length,
                  walks,
                  rect: {
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                  },
                  text: (target.textContent || "").slice(0, 30),
                  cls: (target.className || "").toString().slice(0, 60),
                };
              });
              tabDiag.foundTab = !!rectInfo?.found;
              tabDiag.rectInfo = rectInfo;
              if (rectInfo?.found && rectInfo.rect) {
                await new Promise((r) => setTimeout(r, 400));
                const click = await trustedClickRect(tab.id, rectInfo.rect);
                tabDiag.clicked = !!click.ok;
                tabDiag.click = click;
                // Wait for tab swap then verify comment-list is now in DOM
                await new Promise((r) => setTimeout(r, 1500));
                const verifyRes = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () => {
                    const list = document.querySelector(
                      '[data-e2e="comment-list"]'
                    );
                    return {
                      hasList: !!list,
                      listVisible: !!(
                        list &&
                        list.getBoundingClientRect().height > 50
                      ),
                      commentNodes: document.querySelectorAll(
                        '[data-e2e^="comment-username"], [data-e2e*="comment-author"]'
                      ).length,
                    };
                  },
                });
                tabDiag.commentListAfter =
                  verifyRes && verifyRes[0] && verifyRes[0].result;
              }
            } catch (err) {
              tabDiag.error = String(err?.message || err);
            }
            await new Promise((r) => setTimeout(r, 1500));

            // STEP B — Scroll the comment list with TRUSTED wheel + keyboard.
            // Find the EXACT scrollable element and use ITS rect (clamped to
            // viewport) for the wheel. Also dispatch PageDown as backup.
            const scrollDiag = { ticks: 0, counts: [] };
            try {
              // First: click somewhere inside the comment panel to focus it
              // (required for keyboard events to reach the list).
              const focusInfo = await findRect(tab.id, () => {
                const list = document.querySelector('[data-e2e="comment-list"]');
                if (!list) return { found: false };
                const r = list.getBoundingClientRect();
                return {
                  found: true,
                  rect: { left: r.left, top: r.top, width: r.width, height: r.height },
                };
              });
              if (focusInfo?.found && focusInfo.rect) {
                // Clamp to viewport
                const vw = focusInfo.rect.width;
                const vh = focusInfo.rect.height;
                void vw;
                void vh;
                const cx = Math.floor(focusInfo.rect.left + focusInfo.rect.width / 2);
                const cy = Math.floor(
                  Math.max(50, Math.min(focusInfo.rect.top + 100, 600))
                );
                // Click to focus, then a small wait
                await trustedClickAt(tab.id, cx, cy);
                await new Promise((r) => setTimeout(r, 300));
              }

              for (let scrollI = 0; scrollI < maxScrollTicks; scrollI++) {
                // Find the actual SCROLLER (deepest scrollable inside comment-list)
                // and return ITS rect, clamped to viewport.
                const rectInfo = await findRect(tab.id, () => {
                  const list = document.querySelector('[data-e2e="comment-list"]');
                  if (!list) return { found: false };
                  // Find deepest scrollable inside or the list itself
                  let target = list;
                  const all = list.querySelectorAll("*");
                  let bestDepth = 0;
                  for (const el of Array.from(all)) {
                    try {
                      const cs = getComputedStyle(el);
                      if (
                        (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
                        el.scrollHeight - el.clientHeight > 30
                      ) {
                        let d = 0;
                        let p = el;
                        while (p && p !== list) {
                          p = p.parentElement;
                          d++;
                        }
                        if (d > bestDepth) {
                          target = el;
                          bestDepth = d;
                        }
                      }
                    } catch {}
                  }
                  if (target === list) {
                    let node = list;
                    for (let i = 0; i < 4 && node; i++) {
                      try {
                        const cs = getComputedStyle(node);
                        if (
                          (cs.overflowY === "auto" ||
                            cs.overflowY === "scroll") &&
                          node.scrollHeight - node.clientHeight > 30
                        ) {
                          target = node;
                          break;
                        }
                      } catch {}
                      node = node.parentElement;
                    }
                  }
                  // Programmatic scroll
                  try {
                    target.scrollBy({ top: 2000 });
                    target.scrollTop = target.scrollTop + 2000;
                    const items = target.querySelectorAll(
                      '[data-e2e^="comment-level"], [data-e2e*="comment-item"]'
                    );
                    if (items.length) {
                      items[items.length - 1].scrollIntoView({ block: "end" });
                    }
                  } catch {}
                  // Return SCROLLER rect (not list) clamped to viewport
                  const r = target.getBoundingClientRect();
                  const vpW = window.innerWidth;
                  const vpH = window.innerHeight;
                  const left = Math.max(0, r.left);
                  const top = Math.max(0, r.top);
                  const right = Math.min(vpW, r.right);
                  const bottom = Math.min(vpH, r.bottom);
                  const count = document.querySelectorAll(
                    '[data-e2e^="comment-username"], [data-e2e*="comment-author"]'
                  ).length;
                  return {
                    found: true,
                    count,
                    targetClass: (target.className || "").toString().slice(0, 60),
                    scrollHeight: target.scrollHeight,
                    clientHeight: target.clientHeight,
                    scrollTop: target.scrollTop,
                    rect: {
                      left,
                      top,
                      width: Math.max(50, right - left),
                      height: Math.max(50, bottom - top),
                    },
                  };
                });
                if (!rectInfo?.found || !rectInfo.rect) break;
                const cx = Math.floor(
                  rectInfo.rect.left + rectInfo.rect.width / 2
                );
                const cy = Math.floor(
                  rectInfo.rect.top + rectInfo.rect.height / 2
                );
                // 3 trusted wheels at the SCROLLER center
                await trustedWheel(tab.id, cx, cy, 2500);
                await new Promise((r) => setTimeout(r, 200));
                await trustedWheel(tab.id, cx, cy, 2500);
                await new Promise((r) => setTimeout(r, 200));
                // Backup: keyboard PageDown (focus must be on panel)
                await trustedKey(tab.id, "PageDown");
                await new Promise((r) => setTimeout(r, 600));
                scrollDiag.ticks = scrollI + 1;
                scrollDiag.counts.push(rectInfo.count);
                scrollDiag.lastTarget = rectInfo.targetClass;
                scrollDiag.lastScrollTop = rectInfo.scrollTop;
                scrollDiag.lastScrollHeight = rectInfo.scrollHeight;
                // Plateau: if last 6 same count, bail
                const arr = scrollDiag.counts;
                if (arr.length >= 6) {
                  const last6 = arr.slice(-6);
                  if (last6.every((v) => v === last6[0])) break;
                }
              }
            } catch (err) {
              scrollDiag.error = String(err?.message || err);
            }
            tabDiag.scroll = scrollDiag;
            // Belt-and-braces in-page scroll loop (kept for safety)
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (max) =>
                  new Promise((resolve) => {
                    function findCommentScroller() {
                      const list = document.querySelector(
                        '[data-e2e="comment-list"]'
                      );
                      if (!list) return null;
                      // Walk DOM up & down to find the actual scroll container
                      let node = list;
                      // Check ancestors first (sometimes the list is inside the scroller)
                      for (let i = 0; i < 4 && node; i++) {
                        try {
                          const cs = getComputedStyle(node);
                          if (
                            (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
                            node.scrollHeight - node.clientHeight > 30
                          ) {
                            return node;
                          }
                        } catch {}
                        node = node.parentElement;
                      }
                      // Else, the deepest scrollable child inside the list
                      const all = list.querySelectorAll("*");
                      for (const el of Array.from(all)) {
                        try {
                          const cs = getComputedStyle(el);
                          if (
                            (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
                            el.scrollHeight - el.clientHeight > 30
                          ) {
                            return el;
                          }
                        } catch {}
                      }
                      return list;
                    }
                    let i = 0;
                    let last = -1;
                    let stable = 0;
                    const tick = () => {
                      const target = findCommentScroller();
                      if (target) {
                        try {
                          // Multi-method scroll
                          target.scrollBy({ top: 1500, behavior: "auto" });
                          target.scrollTop = target.scrollTop + 1500;
                          target.dispatchEvent(
                            new WheelEvent("wheel", {
                              deltaY: 1500,
                              bubbles: true,
                              cancelable: true,
                            })
                          );
                          // Also focus the last comment to encourage virtual list to load
                          const items = target.querySelectorAll(
                            '[data-e2e^="comment-level"], [data-e2e*="comment-item"]'
                          );
                          if (items.length) {
                            items[items.length - 1].scrollIntoView({
                              block: "end",
                              behavior: "auto",
                            });
                          }
                        } catch {}
                      }
                      const count = document.querySelectorAll(
                        '[data-e2e^="comment-username"], [data-e2e*="comment-author"]'
                      ).length;
                      if (count === last) stable++;
                      else {
                        stable = 0;
                        last = count;
                      }
                      i++;
                      if (i < max && stable < 5) setTimeout(tick, 900);
                      else resolve({ ticks: i, finalCount: count, hasTarget: !!target });
                    };
                    tick();
                  }),
                args: [maxScrollTicks],
              });
            } catch {}
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                  const HRE = /^[A-Za-z0-9._]{1,30}$/;
                  const set = new Set();
                  const nodes = document.querySelectorAll(
                    '[data-e2e^="comment-username"] a, [data-e2e*="comment-author"] a, [data-e2e^="comment-username"]'
                  );
                  for (const n of Array.from(nodes)) {
                    const href = (n.getAttribute && n.getAttribute("href")) || "";
                    const m = href.match(/^\/@([A-Za-z0-9._]{1,30})/);
                    if (m && HRE.test(m[1])) set.add(m[1].toLowerCase());
                  }
                  // Fallback: scan all anchors but only inside comment containers
                  if (set.size === 0) {
                    const containers = document.querySelectorAll(
                      '[data-e2e="comment-list"], [data-e2e*="comment-item"]'
                    );
                    for (const c of Array.from(containers)) {
                      const links = c.querySelectorAll('a[href^="/@"]');
                      for (const a of Array.from(links)) {
                        const href = a.getAttribute("href") || "";
                        const m = href.match(/^\/@([A-Za-z0-9._]{1,30})/);
                        if (m && HRE.test(m[1])) set.add(m[1].toLowerCase());
                      }
                    }
                  }
                  const descEl = document.querySelector(
                    '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]'
                  );
                  return {
                    commenters: Array.from(set),
                    desc: descEl?.innerText || "",
                    diag: {
                      anchorsTotal: document.querySelectorAll('a[href^="/@"]').length,
                      hasDesc: !!descEl,
                      title: document.title.slice(0, 80),
                    },
                  };
                },
                args: [],
              });
              const out = (results && results[0] && results[0].result) || null;
              const mergedDiag = {
                ...(out?.diag || {}),
                tab: tabDiag,
              };
              return finish({
                ok: !!out && out.commenters?.length > 0,
                error: out && out.commenters?.length > 0 ? undefined : "no_commenters",
                commenters: out?.commenters || [],
                desc: out?.desc || "",
                diag: mergedDiag,
              });
            } catch (err) {
              return finish({ ok: false, error: String(err?.message || err) });
            }
          };
          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      });
      sendResponse(result);
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
