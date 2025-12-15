import * as React from "react";

export function asHTMLElementRef<T extends HTMLElement>(
  ref: React.RefObject<T | null>
) {
  return ref as unknown as React.RefObject<HTMLElement>;
}

export function useOnClickOutside(
  refs: React.RefObject<HTMLElement>[],
  onOutside: () => void,
  when = true
) {
  React.useEffect(() => {
    if (!when) return;

    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const inside = refs.some((r) => r.current && r.current.contains(t));
      if (!inside) onOutside();
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [refs, onOutside, when]);
}
