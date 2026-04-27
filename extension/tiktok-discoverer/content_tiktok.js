// Content script injected on tiktok.com pages.
// When loaded, waits for the SPA to render, scrolls, extracts handles,
// and sends them back to background.js.

(() => {
  // Run only once per page load
  if (window.__lunaliveTiktokScraped) return;
  window.__lunaliveTiktokScraped = true;

  const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

  function extractHandles() {
    const set = new Set();

    // Strategy 1: anchors to /@handle
    document.querySelectorAll('a[href*="/@"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/@([A-Za-z0-9._]{1,30})/);
      if (m && HANDLE_RE.test(m[1])) set.add(m[1].toLowerCase());
    });

    // Strategy 2: regex over outerHTML (catches SSR JSON + inline data)
    const html = document.documentElement.outerHTML;
    const r1 = /"uniqueId"\s*:\s*"([A-Za-z0-9._]{1,30})"/g;
    let m;
    while ((m = r1.exec(html))) set.add(m[1].toLowerCase());
    const r2 = /"unique_id"\s*:\s*"([A-Za-z0-9._]{1,30})"/g;
    while ((m = r2.exec(html))) set.add(m[1].toLowerCase());

    return Array.from(set);
  }

  function snapshot() {
    const titleText = document.title || "";
    const bodyText = (document.body?.innerText || "").slice(0, 4000).toLowerCase();
    return {
      title: titleText.slice(0, 80),
      url: location.href,
      bodyLen: document.body?.innerText?.length || 0,
      anchorsCount: document.querySelectorAll('a[href*="/@"]').length,
      htmlLen: document.documentElement.outerHTML.length,
      loginWall:
        bodyText.includes("log in to tiktok") ||
        bodyText.includes("connectez-vous") ||
        bodyText.includes("connecte-toi"),
      captcha: bodyText.includes("captcha"),
    };
  }

  async function waitMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function scrollToLoadMore(rounds = 5) {
    for (let i = 0; i < rounds; i++) {
      window.scrollBy({ top: 1500, behavior: "smooth" });
      await waitMs(1200);
    }
  }

  async function run() {
    // Wait for SPA to populate
    await waitMs(2500);

    // First pass extraction
    let handles = extractHandles();

    // If nothing yet, wait + scroll
    if (handles.length < 5) {
      await waitMs(2000);
      handles = extractHandles();
    }

    if (handles.length < 10) {
      await scrollToLoadMore(5);
      handles = extractHandles();
    }

    chrome.runtime
      .sendMessage({
        type: "LUNALIVE_TIKTOK_RESULT",
        payload: { handles, diag: snapshot() },
      })
      .catch(() => {});
  }

  run();
})();
