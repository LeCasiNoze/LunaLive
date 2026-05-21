import { motion } from "framer-motion";
import { useState } from "react";
import { Lock } from "lucide-react";
import { SignupModal } from "@/piano/components/landing/SignupModal";
import { LoginModal } from "@/piano/components/landing/LoginModal";
import { HowItWorks } from "@/piano/components/landing/HowItWorks";
import { TrustRow } from "@/piano/components/landing/TrustRow";
import { StickyMobileCTA } from "@/piano/components/landing/StickyMobileCTA";
import { VisaIcon, MastercardIcon, ApplePayIcon, GooglePayIcon, BtcIcon, EthIcon, LtcIcon, XrpIcon } from "@/piano/components/landing/PaymentIcons";
import pianoHero from "@/piano/assets/playme-hero.png";
import streamerAvatar from "@/piano/assets/streamer-avatar.png";
import streamerAvatar2 from "@/piano/assets/streamer-avatar-2.png";
import streamerAvatar3 from "@/piano/assets/streamer-avatar-3.png";
import streamerAvatar4 from "@/piano/assets/streamer-avatar-4.png";
import celsiusLogo from "@/piano/assets/celsius-logo-white.png";

const STREAMER_AVATARS = [streamerAvatar, streamerAvatar2, streamerAvatar3, streamerAvatar4];

function LandingPage() {
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const openSignup = () => setOpen(true);
  const openLogin = () => setLoginOpen(true);

  return (
    <main className="relative min-h-screen overflow-x-hidden pb-24 [-webkit-tap-highlight-color:transparent]">
      {/* Header */}
      <header
        className="relative z-30 flex items-center justify-between px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <img src={celsiusLogo} alt="Celsius Casino" className="h-9 w-auto" />
        <button
          onClick={openLogin}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-white/10"
        >
          Se connecter
        </button>
      </header>

      {/* HERO */}
      <section className="relative z-10 px-2 pt-8">
        {/* Fondu doux sur les bords pour contenir le glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[480px]"
          style={{
            background:
              "linear-gradient(to right, var(--background) 0%, transparent 6%, transparent 94%, var(--background) 100%)",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
          }}
        />
        <div className="mx-auto max-w-lg">
          {/* Visuel Piano avec halo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="relative -mx-6"
          >
            <img
              src={pianoHero}
              alt="Jeu Piano Celsius PlayMe"
              className="h-auto w-full scale-125 object-contain"
              style={{
                WebkitMaskImage:
                  "radial-gradient(ellipse 58% 52% at 50% 50%, black 22%, transparent 82%)",
                maskImage:
                  "radial-gradient(ellipse 58% 52% at 50% 50%, black 22%, transparent 82%)",
              }}
            />
          </motion.div>


          {/* Titre */}
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-3 text-center leading-[0.95] tracking-tight text-white"
          >
            <span className="block text-[17px] font-bold uppercase tracking-[0.08em] text-white/90">
              Dépôt triplé jusqu'à
            </span>
            <span className="mt-1 block text-[56px] font-black text-gradient-celsius">
              2.500€
            </span>
          </motion.h1>

          {/* Bloc exemples concrets */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.26 }}
            className="mt-3 flex flex-wrap items-center justify-center gap-2"
          >
            {[
              { dep: "20€", got: "60€" },
              { dep: "100€", got: "300€" },
            ].map((ex) => (
              <div
                key={ex.dep}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-bold"
              >
                <span className="text-white/70">{ex.dep}</span>
                <span className="text-[color:var(--primary)]">→</span>
                <span className="text-gradient-celsius font-extrabold">{ex.got}</span>
              </div>
            ))}
          </motion.div>

          {/* Offre empilée */}
          <motion.ul
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            className="mt-4 space-y-1.5 text-center"
          >
            {[
              "Accès exclusif au jeu du Piano",
              "Bonus streamer activé instantanément",
              "Retraits rapides & sécurisés",
            ].map((line) => (
              <li
                key={line}
                className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white/90"
              >
                <span className="text-gradient-celsius font-black">+</span>
                <span>{line}</span>
              </li>
            ))}
          </motion.ul>

          {/* CTA principal */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-5"
          >
            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ y: -1 }}
              onClick={openSignup}
              className="cta-gradient relative w-full overflow-hidden rounded-full py-4 text-[15px] font-extrabold uppercase tracking-wide text-white shadow-glow-celsius"
            >
              <span className="relative z-10">S'inscrire maintenant</span>
              <motion.span
                aria-hidden
                className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/30"
                animate={{ x: ["0%", "500%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.4 }}
              />
            </motion.button>

            {/* Micro doux sous CTA */}
            <p className="mt-2.5 text-center text-[11.5px] italic text-muted-foreground/90">
              Cela ne prendra qu'une minute.
            </p>

            {/* Trust paiement — fiat + crypto sur 2 lignes propres */}
            <div className="mt-3 space-y-1.5">
              {/* Ligne 1 : fiat */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <VisaIcon />
                <MastercardIcon />
                <ApplePayIcon />
                <GooglePayIcon />
                <div className="flex h-7 items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 text-[10px] font-bold text-white/90">
                  <Lock className="h-3 w-3" />
                  SSL
                </div>
              </div>

              {/* Ligne 2 : crypto */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <BtcIcon />
                <EthIcon />
                <LtcIcon />
                <XrpIcon />
                <span className="ml-1 text-[9.5px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Crypto acceptés
                </span>
              </div>
            </div>
          </motion.div>



          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-5 flex items-center justify-center gap-2"
          >
            <div className="flex -space-x-2">
              {STREAMER_AVATARS.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-7 w-7 rounded-full border-2 border-[color:var(--background)] object-cover"
                />
              ))}
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Rejoins{" "}
              <span className="font-extrabold text-white">50+ streamers</span>{" "}
              déjà sur Piano
            </p>
          </motion.div>
        </div>
      </section>

      <HowItWorks />
      <TrustRow />

      {/* Footer */}
      <footer
        className="relative z-10 mt-10 px-5 text-center"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          Jouer comporte des risques : endettement, dépendance, isolement. Appelez le
          09 74 75 13 13 (appel non surtaxé).
          <br />
          © Celsius Casino · 18+ uniquement
        </p>
      </footer>

      <StickyMobileCTA onClick={openSignup} hidden={open} />
      <SignupModal open={open} onOpenChange={setOpen} />
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} onSwitchToSignup={openSignup} />
    </main>
  );
}

export default LandingPage;
