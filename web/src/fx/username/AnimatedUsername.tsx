// Composant public des pseudos animés moteur. AUCUN import statique de
// pixi/gsap ici : tout le moteur est chargé via import("./mount") →
// chunk séparé, bundle principal intact (contrainte SEO/perf).
import { useEffect, useRef, useState } from "react";
import { detectQuality, hasWebGL, prefersReducedMotion } from "./quality";
import type { FxContext, FxQuality, FxRarity } from "./types";

type Props = {
  username: string;
  effectId: string;
  rarity?: FxRarity;
  context?: FxContext;
  intensity?: number;
  quality?: FxQuality;
  /** taille de police logique (px) */
  size?: number;
  /** true = timeline en pause (contrôle labo) */
  paused?: boolean;
  /** rendu inline serré (marges négatives = la boîte visuelle ≈ le texte) */
  inline?: boolean;
  className?: string;
};

export default function AnimatedUsername({
  username,
  effectId,
  rarity = "mythic",
  context = "lab",
  intensity = 1,
  quality,
  size = 18,
  paused = false,
  inline = false,
  className,
}: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = useRef<any>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (prefersReducedMotion() || !hasWebGL()) {
      setFallback(true);
      return;
    }
    let disposed = false;
    let io: IntersectionObserver | null = null;
    const onVis = () => apiRef.current?.setVisible(document.visibilityState === "visible");

    (async () => {
      try {
        const mod = await import("./mount");
        const canvas = document.createElement("canvas");
        const api = await mod.mountUsernameFx({
          canvas,
          username,
          effectId,
          fontSize: size,
          quality: quality ?? detectQuality(),
          intensity,
          rarity,
          context,
        });
        if (!api) {
          setFallback(true);
          return;
        }
        if (disposed) {
          api.destroy();
          return;
        }
        apiRef.current = api;
        if (inline) {
          canvas.style.margin = `${-api.padY}px ${-api.padX}px`;
        }
        canvas.style.display = "block";
        host.appendChild(canvas);

        // pause hors écran
        io = new IntersectionObserver(
          (entries) => {
            const visible = entries[0]?.isIntersecting ?? true;
            api.setVisible(visible && document.visibilityState === "visible");
          },
          { rootMargin: "80px" },
        );
        io.observe(host);
        // pause onglet masqué
        document.addEventListener("visibilitychange", onVis);
      } catch (e) {
        console.warn("[username-fx] mount failed", e);
        setFallback(true);
      }
    })();

    return () => {
      disposed = true;
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      apiRef.current?.destroy();
      apiRef.current = null;
      if (host) host.innerHTML = "";
    };
    // remontage volontaire sur changement d'identité de l'anim
  }, [username, effectId, size, quality, intensity, rarity, context, inline]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (paused) api.pause();
    else api.play();
  }, [paused]);

  if (fallback) {
    // fallback statique : pseudo stylé simple (reduced-motion / pas de WebGL)
    return (
      <span className={className} style={{ fontWeight: 800, fontSize: size }}>
        {username}
      </span>
    );
  }

  return (
    <span
      ref={hostRef}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        verticalAlign: "middle",
        lineHeight: 0,
      }}
    />
  );
}
