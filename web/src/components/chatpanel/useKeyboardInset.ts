// web/src/components/chatpanel/useKeyboardInset.ts
import * as React from "react";

export function useKeyboardInset() {
  const [kbInset, setKbInset] = React.useState(0);

  const isCoarse = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      window.matchMedia?.("(max-width: 820px)")?.matches
    );
  }, []);

  React.useEffect(() => {
    if (!isCoarse) return;

    const vv: any = (window as any).visualViewport;
    if (!vv) return;

    const compute = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)));
      setKbInset(inset);
    };

    compute();
    vv.addEventListener?.("resize", compute);
    vv.addEventListener?.("scroll", compute);

    return () => {
      vv.removeEventListener?.("resize", compute);
      vv.removeEventListener?.("scroll", compute);
    };
  }, [isCoarse]);

  return { kbInset, isCoarse };
}
