import { ShieldCheck, Lock, Zap } from "lucide-react";

const badges = [
  { icon: ShieldCheck, label: "SSL sécurisé" },
  { icon: Lock, label: "Paiements protégés" },
  { icon: Zap, label: "Retraits instantanés" },
];

const methods = ["VISA", "Mastercard", "Apple Pay", "G Pay", "BTC", "USDT"];

export function TrustRow() {
  return (
    <section className="px-4 pt-8">
      <div className="mx-auto max-w-md">
        <div className="grid grid-cols-3 gap-2">
          {badges.map((b) => (
            <div
              key={b.label}
              className="glass flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center"
            >
              <b.icon className="h-4 w-4 text-[var(--bet-green)]" />
              <span className="text-[10px] font-semibold leading-tight text-white/80">
                {b.label}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          {methods.map((m) => (
            <span
              key={m}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold tracking-wide text-white/70"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
