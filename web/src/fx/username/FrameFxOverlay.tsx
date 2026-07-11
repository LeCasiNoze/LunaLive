// Couche canvas de particules par-dessus un cadran CSS. À poser dans un
// parent en position:relative — l'overlay épouse sa taille, ignore la
// souris, et hérite du border-radius. AUCUN import statique de pixi.
import { useEffect, useRef } from "react";
import { detectQuality, hasWebGL, prefersReducedMotion } from "./quality";

export default function FrameFxOverlay({ effectId }: { effectId: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (prefersReducedMotion() || !hasWebGL()) return; // le CSS seul reste
    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let api: any = null;
    let io: IntersectionObserver | null = null;
    const onVis = () => api?.setVisible(document.visibilityState === "visible");

    const mount = async () => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      if (w === 0 || h === 0) {
        if (!disposed) requestAnimationFrame(mount);
        return;
      }
      const mod = await import("./mount");
      const canvas = document.createElement("canvas");
      api = await mod.mountFrameFx({
        canvas,
        effectId,
        width: w,
        height: h,
        quality: detectQuality(),
      });
      if (!api) return;
      if (disposed) {
        api.destroy();
        return;
      }
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      host.appendChild(canvas);
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries[0]?.isIntersecting ?? true;
          api?.setVisible(visible && document.visibilityState === "visible");
        },
        { rootMargin: "80px" },
      );
      io.observe(host);
      document.addEventListener("visibilitychange", onVis);
    };
    mount();

    return () => {
      disposed = true;
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      api?.destroy();
      api = null;
      if (host) host.innerHTML = "";
    };
  }, [effectId]);

  return (
    <span
      ref={hostRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        borderRadius: "inherit",
        zIndex: 3,
      }}
    />
  );
}
