// Content script injected on lunalive.win.
// Bridges window.postMessage (page) <-> chrome.runtime (background).
// Lets the LunaLive UI detect the extension and trigger TikTok scraping.

(() => {
  const VERSION = chrome.runtime.getManifest().version;

  // Announce the extension's presence right away
  function announce() {
    window.postMessage(
      { source: "lunalive-tiktok-ext", type: "PRESENT", version: VERSION },
      window.location.origin
    );
  }
  // Also attach a marker on the document so synchronous detection works too
  try {
    document.documentElement.setAttribute("data-lunalive-tiktok-ext", VERSION);
  } catch {}
  announce();
  // Re-announce a few times in case the page mounts late
  setTimeout(announce, 500);
  setTimeout(announce, 1500);
  setTimeout(announce, 4000);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "lunalive-tiktok-page") return;

    if (data.type === "PING") {
      window.postMessage(
        {
          source: "lunalive-tiktok-ext",
          type: "PONG",
          version: VERSION,
          requestId: data.requestId,
        },
        window.location.origin
      );
      return;
    }

    if (data.type === "SCRAPE_PROFILES") {
      const requestId = data.requestId;
      chrome.runtime.sendMessage(
        { type: "LUNALIVE_TIKTOK_SCRAPE_PROFILES", payload: data.payload || {} },
        (resp) => {
          window.postMessage(
            {
              source: "lunalive-tiktok-ext",
              type: "SCRAPE_PROFILES_RESULT",
              requestId,
              ok: !!resp?.ok,
              profiles: resp?.profiles || [],
              error: resp ? null : chrome.runtime.lastError?.message || "no_response",
            },
            window.location.origin
          );
        }
      );
      return;
    }

    if (data.type === "DISCOVER") {
      const requestId = data.requestId;
      chrome.runtime.sendMessage(
        { type: "LUNALIVE_TIKTOK_DISCOVER", payload: data.payload || {} },
        (resp) => {
          window.postMessage(
            {
              source: "lunalive-tiktok-ext",
              type: "DISCOVER_RESULT",
              requestId,
              ok: !!resp?.ok,
              handles: resp?.handles || [],
              events: resp?.events || [],
              error: resp ? null : chrome.runtime.lastError?.message || "no_response",
            },
            window.location.origin
          );
        }
      );
    }
  });

  // Forward progress events from background to the page
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "LUNALIVE_TIKTOK_PROGRESS") {
      window.postMessage(
        {
          source: "lunalive-tiktok-ext",
          type: "PROGRESS",
          event: message.event,
        },
        window.location.origin
      );
    }
    return false;
  });
})();
