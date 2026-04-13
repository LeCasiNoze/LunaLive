(function () {
  function initLiveCounter() {
    var node = document.querySelector("[data-live-count]");
    if (!node) return;

    var current = 180 + Math.floor(Math.random() * 140);
    node.textContent = String(current);

    function schedule() {
      var delay = 8000 + Math.random() * 7000;
      window.setTimeout(function () {
        current += Math.random() > 0.5 ? 1 : -1;
        node.textContent = String(current);
        schedule();
      }, delay);
    }

    schedule();
  }

  function initMissingAssets() {
    var images = document.querySelectorAll("[data-asset-img]");
    images.forEach(function (img) {
      var container = img.closest(".promo-image-container");
      if (!container) return;

      function markMissing() {
        container.classList.add("missing-asset");
      }

      function markLoaded() {
        if (img.naturalWidth > 0) {
          container.classList.remove("missing-asset");
        }
      }

      img.addEventListener("error", markMissing, { once: true });
      img.addEventListener("load", markLoaded, { once: true });

      if (img.complete && img.naturalWidth === 0) {
        markMissing();
      }
    });
  }

  function initStickyCta() {
    var sticky = document.querySelector(".sticky-cta");

    function syncReserve() {
      var reserve = 0;
      var panelHeight = "auto";
      var bottomGap = 8;

      if (sticky && window.innerWidth <= 860) {
        var viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        var stickyHeight = sticky.offsetHeight;
        reserve = stickyHeight + bottomGap + 8;
        panelHeight = Math.max(320, Math.round(viewportHeight - stickyHeight - bottomGap - 8)) + "px";
      }

      document.documentElement.style.setProperty("--sticky-reserve", reserve + "px");
      document.documentElement.style.setProperty("--mobile-panel-height", panelHeight);
      document.documentElement.style.setProperty("--sticky-bottom-gap", bottomGap + "px");
    }

    function update() {
      var threshold = 140;
      var hero = document.querySelector(".hero-section");
      if (hero) {
        threshold = Math.max(220, hero.offsetHeight - 180);
      }

      document.body.classList.toggle("show-sticky", window.scrollY > threshold);
    }

    syncReserve();
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", function () {
      syncReserve();
      update();
    });
    window.setTimeout(syncReserve, 120);
  }

  function initOfferBindings() {
    var source = document.querySelector("[data-offer-deposit][data-offer-bonus][data-offer-total]");
    if (!source) return;

    var currency = source.getAttribute("data-offer-currency") || "\u20AC";
    var values = {
      deposit: source.getAttribute("data-offer-deposit") || "20",
      bonus: source.getAttribute("data-offer-bonus") || "20",
      total: source.getAttribute("data-offer-total") || "40"
    };

    function formatAmount(value) {
      return value + currency;
    }

    document.querySelectorAll("[data-bind-offer-value]").forEach(function (node) {
      var key = node.getAttribute("data-bind-offer-value");
      if (!key || !values[key]) return;
      node.innerHTML = formatAmount(values[key]);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initLiveCounter();
    initMissingAssets();
    initStickyCta();
    initOfferBindings();
  });
})();
