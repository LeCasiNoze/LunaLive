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

            // Try opening the modal up to 4 times with different strategies
            let modalOpened = false;
            for (let attempt = 0; attempt < 4 && !modalOpened; attempt++) {
              try {
                const clickRes = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: (which) => {
                    const tried = [];
                    function tryClick(el) {
                      if (!el) return false;
                      try {
                        // Prefer the closest interactive ancestor
                        const interactive =
                          el.closest("button,a,[role='button']") ||
                          el.closest("strong,span")?.parentElement ||
                          el.parentElement ||
                          el;
                        if (typeof interactive.click === "function") {
                          interactive.click();
                          tried.push(interactive.tagName + ":" + (interactive.className || "").slice(0, 30));
                          return true;
                        }
                      } catch {}
                      return false;
                    }
                    // Strategy variants
                    const candidates = [
                      // primary stat element
                      document.querySelector('[data-e2e="following-count"]'),
                      document.querySelector('[data-e2e="following"]'),
                      // its parent strong/anchor (TikTok wraps the count)
                      document.querySelector('strong[data-e2e="following-count"]'),
                      // text-based: button/anchor whose accessible name contains "following"
                      ...(Array.from(document.querySelectorAll('button,a,[role="button"]')).filter((el) => {
                        const txt = (el.textContent || "").trim().toLowerCase();
                        return /(following|abonnements|abonnement\b)/.test(txt) && txt.length < 80;
                      })),
                    ].filter(Boolean);

                    let clicked = false;
                    for (const c of candidates) {
                      if (tryClick(c)) {
                        clicked = true;
                        break;
                      }
                    }
                    return { clicked, tried, candidatesFound: candidates.length, attempt: which };
                  },
                  args: [attempt],
                });
                // Wait for modal to actually appear (poll up to 4s)
                for (let pollI = 0; pollI < 8; pollI++) {
                  await new Promise((r) => setTimeout(r, 500));
                  const checkRes = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                      const dialog =
                        document.querySelector('[role="dialog"]') ||
                        document.querySelector('div[aria-modal="true"]');
                      if (!dialog) return { open: false };
                      // Verify it has user anchors (otherwise it's a different dialog)
                      const links = dialog.querySelectorAll('a[href^="/@"]');
                      return {
                        open: true,
                        anchors: links.length,
                        title: (dialog.querySelector('h1,h2,[role="heading"]')?.textContent || "").slice(0, 40),
                      };
                    },
                  });
                  const out = checkRes && checkRes[0] && checkRes[0].result;
                  if (out?.open && (out.anchors > 0 || /follow|abon/i.test(out.title || ""))) {
                    modalOpened = true;
                    break;
                  }
                }
                // Last resort for next attempt: scroll up to ensure stats bar visible
                if (!modalOpened) {
                  await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => window.scrollTo(0, 0),
                  });
                  await new Promise((r) => setTimeout(r, 1500));
                }
              } catch {
                // continue to next attempt
              }
            }
            if (!modalOpened) {
              return finish({
                ok: false,
                error: "modal_not_opened",
                diag: { handle: cleaned },
              });
            }

            // Robust scroll loop: target ONLY the modal/dialog scroller,
            // never the page background.
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (max) =>
                  new Promise((resolve) => {
                    function findDialog() {
                      return (
                        document.querySelector('[role="dialog"]') ||
                        document.querySelector('div[aria-modal="true"]') ||
                        null
                      );
                    }
                    function findModalScrollable(dialog) {
                      if (!dialog) return null;
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
                  const dialog =
                    document.querySelector('[role="dialog"]') ||
                    document.querySelector('div[aria-modal="true"]');
                  // STRICT: if no dialog, return empty + bail. Do NOT fall back
                  // to document — that's how we used to capture sidebar
                  // recommendations as if they were /following.
                  if (!dialog) {
                    return {
                      handles: [],
                      diag: {
                        modalFound: false,
                        anchorsInModal: 0,
                        anchorsTotalPage: document.querySelectorAll('a[href^="/@"]').length,
                        title: document.title.slice(0, 80),
                        bail: "no_dialog_at_extract",
                      },
                    };
                  }
                  const links = dialog.querySelectorAll('a[href^="/@"]');
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
                      modalFound: !!dialog,
                      anchorsInModal: links.length,
                      anchorsTotalPage: document.querySelectorAll('a[href^="/@"]').length,
                      title: document.title.slice(0, 80),
                    },
                  };
                },
                args: [maxHandles, cleaned],
              });
              const out = (results && results[0] && results[0].result) || null;
              // Reject if extraction bailed (no dialog) or got 0 handles
              const handlesOk = out && out.handles && out.handles.length > 0;
              return finish({
                ok: !!handlesOk,
                error: handlesOk ? undefined : "no_handles_extracted",
                handle: cleaned,
                handles: out?.handles || [],
                total: out?.handles?.length || 0,
                diag: out?.diag || null,
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
            await new Promise((r) => setTimeout(r, 4000));
            // Scroll the comment panel
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (max) =>
                  new Promise((resolve) => {
                    let i = 0;
                    let last = -1;
                    let stable = 0;
                    const tick = () => {
                      const panels = [
                        document.querySelector('[data-e2e="comment-list"]'),
                        document.querySelector('[data-e2e="comment-list-container"]'),
                        ...Array.from(document.querySelectorAll('[data-e2e*="comment"]')),
                      ].filter(Boolean);
                      let scrolled = false;
                      for (const p of panels) {
                        try {
                          // Find the deepest scrollable inside or use the panel itself
                          let target = p;
                          const all = p.querySelectorAll("*");
                          for (const el of Array.from(all)) {
                            try {
                              const cs = getComputedStyle(el);
                              if (
                                (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
                                el.scrollHeight - el.clientHeight > 50
                              ) {
                                target = el;
                                break;
                              }
                            } catch {}
                          }
                          target.scrollBy({ top: 1800 });
                          target.scrollTop = target.scrollTop + 1800;
                          scrolled = true;
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
                      if (i < max && stable < 4) setTimeout(tick, 800);
                      else resolve({ ticks: i, finalCount: count, scrolled });
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
              return finish({
                ok: !!out && out.commenters?.length > 0,
                error: out && out.commenters?.length > 0 ? undefined : "no_commenters",
                commenters: out?.commenters || [],
                desc: out?.desc || "",
                diag: out?.diag || null,
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
