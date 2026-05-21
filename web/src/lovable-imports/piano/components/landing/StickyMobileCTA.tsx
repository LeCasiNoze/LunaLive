import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export function StickyMobileCTA({
  onClick,
  hidden,
}: {
  onClick: () => void;
  hidden: boolean;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show && !hidden && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-40 px-4 pt-3"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            background:
              "linear-gradient(to top, color-mix(in oklab, var(--background) 95%, transparent) 60%, transparent)",
          }}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClick}
            className="cta-gradient relative mx-auto block w-full max-w-md overflow-hidden rounded-full py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white shadow-glow-celsius"
          >
            <span className="relative z-10">S'inscrire maintenant</span>
            <motion.span
              aria-hidden
              className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/30"
              animate={{ x: ["0%", "500%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.4 }}
            />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
