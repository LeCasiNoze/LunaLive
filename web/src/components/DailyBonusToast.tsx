// web/src/components/DailyBonusToast.tsx
import * as React from "react";

function labelFromDetail(d: any) {
  const r = d?.reward ?? d?.todayReward ?? d?.gained ?? null;
  if (r?.type === "rubis") return `Bonus quotidien : +${r.amount} rubis ✅`;
  if (r?.type === "token" && r?.token === "wheel_ticket") return `Bonus quotidien : +${r.amount} ticket(s) roue ✅`;
  return "Bonus quotidien récupéré ✅";
}

export function DailyBonusToast() {
  React.useEffect(() => {
    const onResult = (ev: any) => {
      const d = ev?.detail;
      if (!d) return;

      // ✅ seulement auto-claim
      if (d?.source && d.source !== "auto") return;

      // si le backend renvoie claimed=false, on n'affiche rien
      if (d?.claimed === false) return;

      const day = String(d?.state?.day || d?.day || "");
      const key = day ? `dailyBonus:toast:${day}` : null;

      // évite spam (par onglet) — ok, car le vrai verrou est dans AuthProvider (localStorage)
      if (key && sessionStorage.getItem(key)) return;
      if (key) sessionStorage.setItem(key, "1");

      const text = labelFromDetail(d);
      const state = d?.state; // ✅ important pour ouvrir la modal

      window.dispatchEvent(
        new CustomEvent("ui:toast", {
          detail: {
            kind: "success",
            slot: "bottom",
            durationMs: 2600,
            dismissible: true,
            sound: null, // ✅ dailybonus silencieux
            title: text,
            action: state
              ? {
                  label: "Voir",
                  event: "ui:daily_bonus_agenda_open",
                  detail: { state },
                  dismissOnClick: true,
                }
              : undefined,
          },
        })
      );
    };

    window.addEventListener("dailyBonus:result", onResult as any);
    return () => window.removeEventListener("dailyBonus:result", onResult as any);
  }, []);

  return null;
}
