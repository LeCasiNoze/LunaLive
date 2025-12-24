import * as React from "react";
import { createPortal } from "react-dom";

function labelFromDetail(d: any) {
  const r = d?.reward ?? d?.todayReward ?? d?.gained ?? null;
  if (r?.type === "rubis") return `Bonus quotidien : +${r.amount} rubis ✅`;
  if (r?.type === "token" && r?.token === "wheel_ticket") return `Bonus quotidien : +${r.amount} ticket(s) roue ✅`;
  return "Bonus quotidien récupéré ✅";
}

export function DailyBonusToast() {
  const [text, setText] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  const show = React.useCallback((t: string) => {
    setText(t);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 2600);
  }, []);

  React.useEffect(() => {
    const onResult = (ev: any) => {
      const d = ev?.detail;
      if (!d) return;

      // ✅ on ne montre le toast que si c'est une auto-claim
      // (si tu ne passes pas "source", ça affichera aussi quand tu claim à la main)
      if (d?.source && d.source !== "auto") return;

      // si le backend renvoie claimed=false, on n'affiche rien
      if (d?.claimed === false) return;

      const day = String(d?.day || "");
      const key = day ? `dailyBonus:toast:${day}` : null;

      // évite le spam
      if (key && sessionStorage.getItem(key)) return;
      if (key) sessionStorage.setItem(key, "1");

      show(labelFromDetail(d));
    };

    window.addEventListener("dailyBonus:result", onResult as any);
    return () => window.removeEventListener("dailyBonus:result", onResult as any);
  }, [show]);

  React.useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!text) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 2147483647,
        padding: "10px 14px",
        borderRadius: 14,
        background: "rgba(15,15,24,0.92)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
        fontWeight: 900,
        fontSize: 13,
      }}
    >
      {text}
    </div>,
    document.body
  );
}
