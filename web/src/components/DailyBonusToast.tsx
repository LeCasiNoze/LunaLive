// web/src/components/DailyBonusToast.tsx
import * as React from "react";

function labelFromDetail(d: any) {
  const r = d?.reward ?? d?.todayReward ?? d?.gained ?? null;
  if (r?.type === "rubis") return `+${r.amount} rubis`;
  if (r?.type === "token" && r?.token === "wheel_ticket") return `+${r.amount} ticket(s) roue`;
  return "Bonus récupéré";
}

export function DailyBonusToast() {
  React.useEffect(() => {
    const onResult = (ev: any) => {
      const d = ev?.detail;
      if (!d) return;

      // only auto
      if (d?.source && d.source !== "auto") return;
      if (d?.claimed === false) return;

      const day = String(d?.day || "");
      const key = day ? `dailyBonus:toast:${day}` : null;

      if (key && sessionStorage.getItem(key)) return;
      if (key) sessionStorage.setItem(key, "1");

      const gain = labelFromDetail(d);

      window.dispatchEvent(
        new CustomEvent("ui:toast", {
          detail: {
            kind: "success",
            slot: "bottom",
            durationMs: 5000,
            dismissible: true,
            title: "Bonus quotidien récupéré ✅",
            message: gain,
            action: {
              label: "Voir",
              event: "ui:daily_bonus_agenda_open",
              detail: { day: day || null },
              dismissOnClick: true,
            },
          },
        })
      );
    };

    window.addEventListener("dailyBonus:result", onResult as any);
    return () => window.removeEventListener("dailyBonus:result", onResult as any);
  }, []);

  return null;
}
