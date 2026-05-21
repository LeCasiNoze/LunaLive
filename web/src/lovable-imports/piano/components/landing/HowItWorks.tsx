import { motion } from "framer-motion";
import { UserPlus, Wallet, Gamepad2 } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    title: "Inscription",
    desc: "Crée ton compte en 2 minutes, c'est gratuit.",
  },
  {
    icon: Wallet,
    title: "Dépôt",
    desc: "Triple ton 1er dépôt avec le code streamer.",
  },
  {
    icon: Gamepad2,
    title: "Joue au jeu du Piano",
    desc: "Accès exclusif au jeu du Piano + bonus actifs.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 pt-8">
      <div className="mx-auto max-w-md">
        <h2 className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Comment ça marche
        </h2>
        <ul className="space-y-2.5">
          {steps.map((s, i) => (
            <motion.li
              key={s.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="glass relative flex items-center gap-3 overflow-hidden rounded-2xl p-3"
            >
              {/* Watermark numéro */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-2 -top-3 select-none font-black leading-none text-white/[0.06]"
                style={{ fontSize: "84px", letterSpacing: "-0.04em" }}
              >
                {i + 1}
              </span>

              <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#FA375F] to-[#EC6A47] text-white shadow-glow-celsius">
                <s.icon className="h-5 w-5" strokeWidth={2.4} />
              </div>
              <div className="relative min-w-0">
                <p className="text-[14px] font-bold text-white">{s.title}</p>
                <p className="text-[11.5px] leading-snug text-muted-foreground">{s.desc}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
