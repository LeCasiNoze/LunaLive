// web/src/pages/streamer/hooks/useCinema.ts
import * as React from "react";
import { exitFullscreenSafe, isFullscreen, requestFullscreenSafe } from "../utils";

export function useCinema(isMobile: boolean) {
  const [cinema, setCinema] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const fsWantedRef = React.useRef(false);

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
  }, [cinema, chatOpen]);

  const enterCinema = React.useCallback(() => {
    fsWantedRef.current = true;
    requestFullscreenSafe(document.documentElement);
    setChatOpen(false);
    setCinema(true);
  }, []);

  const leaveCinema = React.useCallback(() => {
    fsWantedRef.current = false;
    setChatOpen(false);
    setCinema(false);
    exitFullscreenSafe();
  }, []);

  const openCinemaChat = React.useCallback(() => {
    if (isMobile) exitFullscreenSafe();
    setChatOpen(true);
  }, [isMobile]);

  const closeCinemaChat = React.useCallback(() => {
    setChatOpen(false);
    if (isMobile && fsWantedRef.current) requestFullscreenSafe(document.documentElement);
  }, [isMobile]);

  return { cinema, chatOpen, enterCinema, leaveCinema, openCinemaChat, closeCinemaChat };
}
