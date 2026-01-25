// web/src/pages/streamer/hooks/useCinema.ts
import * as React from "react";
import { exitFullscreenSafe, isFullscreen, requestFullscreenSafe } from "../utils";

function isIOSUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  return /iP(hone|ad|od)/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua)); // iPadOS
}

export function useCinema(isMobile: boolean) {
  const [cinema, setCinema] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const fsWantedRef = React.useRef(false);

  // ✅ iOS + in-app: Fullscreen API (documentElement) est source de bugs (zoom/crop à la rotation)
  const ios = isIOSUA();
  const blockFullscreenApi = isMobile || ios; // volontairement large pour stabiliser

  React.useEffect(() => {
    if (!cinema && !chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cinema, chatOpen]);

  React.useEffect(() => {
    const onFs = () => {
      if (!cinema) return;
      if (!fsWantedRef.current) return;
      if (chatOpen) return;

      // Si on ne s’appuie pas sur la Fullscreen API (mobile/iOS), on ignore les events FS
      if (blockFullscreenApi) return;

      if (!isFullscreen()) {
        fsWantedRef.current = false;
        setChatOpen(false);
        setCinema(false);
      }
    };

    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange" as any, onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange" as any, onFs);
    };
  }, [cinema, chatOpen, blockFullscreenApi]);

  const enterCinema = React.useCallback(() => {
    fsWantedRef.current = true;

    // ✅ IMPORTANT: sur mobile/iOS -> PAS de requestFullscreen (évite zoom/crop à la rotation)
    if (!blockFullscreenApi) {
      requestFullscreenSafe(document.documentElement);
    }

    setChatOpen(false);
    setCinema(true);
  }, [blockFullscreenApi]);

  const leaveCinema = React.useCallback(() => {
    fsWantedRef.current = false;
    setChatOpen(false);
    setCinema(false);

    // ✅ on ne force pas exit fullscreen sur mobile/iOS (car on n’y est normalement pas)
    if (!blockFullscreenApi) exitFullscreenSafe();
  }, [blockFullscreenApi]);

  const openCinemaChat = React.useCallback(() => {
    // ✅ avant: sur mobile on exit fullscreen => re-enter => gros bugs iOS
    // maintenant: on ne touche plus au Fullscreen API
    setChatOpen(true);
  }, []);

  const closeCinemaChat = React.useCallback(() => {
    setChatOpen(false);

    // ✅ avant: re-enter fullscreen sur mobile => bug iOS à la rotation
    // maintenant: on ne touche plus au Fullscreen API
  }, []);

  return { cinema, chatOpen, enterCinema, leaveCinema, openCinemaChat, closeCinemaChat };
}
