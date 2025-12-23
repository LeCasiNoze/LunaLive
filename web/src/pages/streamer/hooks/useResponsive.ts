// web/src/pages/streamer/hooks/useResponsive.ts
import * as React from "react";

export function useResponsive() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 820px)").matches : false
  );
  const [isPortrait, setIsPortrait] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(orientation: portrait)").matches : true
  );

  React.useEffect(() => {
    const mq1 = window.matchMedia("(max-width: 820px)");
    const mq2 = window.matchMedia("(orientation: portrait)");

    const on1 = () => setIsMobile(mq1.matches);
    const on2 = () => setIsPortrait(mq2.matches);

    mq1.addEventListener?.("change", on1);
    mq2.addEventListener?.("change", on2);
    window.addEventListener("resize", on1);

    return () => {
      mq1.removeEventListener?.("change", on1);
      mq2.removeEventListener?.("change", on2);
      window.removeEventListener("resize", on1);
    };
  }, []);

  return { isMobile, isPortrait };
}
