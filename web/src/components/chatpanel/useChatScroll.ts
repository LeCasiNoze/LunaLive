// web/src/components/chatpanel/useChatScroll.ts
import * as React from "react";

export function useChatScroll(opts: { listRef: React.RefObject<HTMLDivElement | null>; initialLoading: boolean; messagesLen: number }) {
  const { listRef, initialLoading, messagesLen } = opts;

  const atBottomRef = React.useRef(true);
  const userScrolledRef = React.useRef(false);
  const ignoreScrollRef = React.useRef(false);

  const [showJump, setShowJump] = React.useState(false);

  function isAtBottom(thresholdPx: number = 8) {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setShowJump(false);
  }

  function forceScrollBottomMultiPass() {
    const el = listRef.current;
    if (!el) return;

    const scroll = () => {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setShowJump(false);
    };

    scroll();
    requestAnimationFrame(scroll);
    setTimeout(scroll, 50);
    setTimeout(scroll, 150);
    setTimeout(scroll, 300);
    setTimeout(scroll, 600);
  }

  function onScrollList() {
    const el = listRef.current;
    if (!el) return;

    const atBottom = isAtBottom();
    atBottomRef.current = atBottom;

    if (ignoreScrollRef.current) {
      return;
    }

    if (atBottom) {
      userScrolledRef.current = false;
      setShowJump(false);
    } else {
      userScrolledRef.current = true;
      setShowJump(true);
    }
  }

  React.useLayoutEffect(() => {
    if (initialLoading) return;
    if (userScrolledRef.current) return;

    const el = listRef.current;
    if (!el) return;

    const scroll = () => {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
    };

    scroll();
    requestAnimationFrame(scroll);

    const timers = [
      window.setTimeout(scroll, 50),
      window.setTimeout(scroll, 150),
      window.setTimeout(scroll, 300),
      window.setTimeout(scroll, 600),
    ];

    return () => timers.forEach(clearTimeout);
  }, [messagesLen, initialLoading, listRef]);

  return {
    showJump,
    setShowJump,
    atBottomRef,
    userScrolledRef,
    ignoreScrollRef,
    scrollToBottom,
    onScrollList,
    forceScrollBottomMultiPass,
  };
}
