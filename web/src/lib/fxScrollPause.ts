// Détecteur de scroll global : pose l'attribut `data-fx-scrolling` sur
// <html> pendant le défilement (retiré ~140ms après le dernier mouvement).
// Deux consommateurs figent leurs animations tant que l'attribut est là,
// pour libérer le GPU au scroll (chat/pages plus fluides) :
//   - le moteur Pixi (runtime.renderAll skippe le blit)
//   - le CSS (99_perf_mobile.css met les anims du chat en pause)
// Les animations REPRENNENT à l'arrêt — aucune altération de leur qualité.
let installed = false;

export function installFxScrollPause() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const root = document.documentElement;
  let timer: number | null = null;

  const bump = () => {
    if (!root.hasAttribute("data-fx-scrolling")) root.setAttribute("data-fx-scrolling", "1");
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      root.removeAttribute("data-fx-scrolling");
      timer = null;
    }, 140);
  };

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  // capture:true attrape aussi les scrolls des conteneurs internes (chat)
  window.addEventListener("scroll", bump, opts);
  window.addEventListener("wheel", bump, opts);
  window.addEventListener("touchmove", bump, opts);
}
