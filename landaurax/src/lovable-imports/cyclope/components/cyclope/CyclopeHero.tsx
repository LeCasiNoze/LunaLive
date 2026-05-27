import chicken from "@/cyclope/assets/cyclope-chicken.webp";
import { CYCLOPE_CASINO_URL } from "@/cyclope/lib/cta-cyclope";

const CyclopeHero = () => {
  return (
    <section className="w-full px-5 pt-2 pb-6">
      <a
        href={CYCLOPE_CASINO_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="relative block max-w-sm mx-auto rounded-[28px] overflow-hidden active:scale-[0.98] transition-transform"
        style={{
          border: "2px solid rgba(255,185,48,0.45)",
          boxShadow:
            "0 20px 60px rgba(255,75,110,0.55), 0 0 0 3px rgba(255,255,255,0.08), 0 0 70px rgba(255,185,48,0.45)",
        }}
      >
        {/* Scène route casino */}
        <div
          className="relative w-full aspect-square overflow-hidden"
          style={{
            background:
              "radial-gradient(130% 80% at 50% 15%, #3a1830 0%, #1a0a1f 50%, #07060d 100%)",
          }}
        >
          {/* Étoiles / paillettes casino */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,233,180,0.9) 50%, transparent 60%), radial-gradient(1px 1px at 78% 12%, rgba(255,255,255,0.8) 50%, transparent 60%), radial-gradient(2px 2px at 22% 38%, rgba(255,185,48,0.85) 50%, transparent 60%), radial-gradient(1px 1px at 88% 32%, rgba(255,255,255,0.7) 50%, transparent 60%), radial-gradient(1.5px 1.5px at 60% 8%, rgba(255,200,120,0.8) 50%, transparent 60%), radial-gradient(1px 1px at 40% 22%, rgba(255,255,255,0.6) 50%, transparent 60%)",
            }}
          />
          {/* Spotlight haut */}
          <div
            className="absolute inset-x-0 top-0 h-1/2"
            style={{
              background:
                "radial-gradient(60% 100% at 50% 0%, rgba(255,185,48,0.28) 0%, transparent 70%)",
            }}
          />
          {/* Glow rouge bas */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2"
            style={{
              background:
                "radial-gradient(80% 100% at 50% 100%, rgba(255,75,110,0.35) 0%, transparent 65%)",
            }}
          />
          {/* Asphalte + lignes route en perspective */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(180deg, rgba(255,255,255,0.0) 0px, rgba(255,255,255,0.0) 28px, rgba(255,255,255,0.85) 28px, rgba(255,255,255,0.85) 46px)",
              maskImage:
                "linear-gradient(180deg, transparent 38%, black 55%, black 88%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(180deg, transparent 38%, black 55%, black 88%, transparent 100%)",
              transform: "perspective(420px) rotateX(62deg) scaleX(2.2)",
              transformOrigin: "50% 100%",
              left: "-50%",
              right: "-50%",
              width: "200%",
              opacity: 0.7,
            }}
          />
          {/* Rayons de lumière depuis le haut */}
          <div
            className="absolute inset-0 mix-blend-screen"
            style={{
              background:
                "conic-gradient(from 200deg at 50% -10%, transparent 0deg, rgba(255,185,48,0.18) 20deg, transparent 40deg, rgba(255,75,110,0.15) 60deg, transparent 80deg, rgba(255,185,48,0.18) 100deg, transparent 120deg)",
              opacity: 0.8,
            }}
          />
          {/* Halo lumineux derrière le poulet */}
          <div
            className="absolute"
            style={{
              right: "-5%",
              top: "5%",
              width: "90%",
              height: "90%",
              background:
                "radial-gradient(circle at 50% 50%, rgba(255,210,90,0.65) 0%, rgba(255,75,110,0.4) 38%, transparent 68%)",
              filter: "blur(10px)",
            }}
          />
          {/* Poulet */}
          <img
            src={chicken}
            alt="Jeu du Poulet — Crash Chicken — bonus 40€"
            className="absolute"
            style={{
              right: "-4%",
              bottom: "8%",
              height: "82%",
              width: "auto",
              objectFit: "contain",
              filter:
                "drop-shadow(0 14px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 18px rgba(255,185,48,0.35))",
            }}
          />
        </div>

        {/* Sticker en haut */}
        <div
          className="absolute top-3 left-3 px-3 py-1.5 rounded-full -rotate-6"
          style={{
            background: "#ffffff",
            border: "1.5px solid rgba(255,75,110,0.45)",
            boxShadow: "0 4px 12px rgba(255,75,110,0.25)",
          }}
        >
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 800,
              fontSize: "0.78rem",
              color: "#B91C3C",
              letterSpacing: "0.1em",
            }}
          >
            🐔 JEU DU POULET
          </span>
        </div>

        {/* Overlay promesse */}
        <div
          className="absolute bottom-0 left-0 right-0 px-5 pt-14 pb-6"
          style={{
            background:
              "linear-gradient(to top, rgba(11,21,48,0.97) 0%, rgba(11,21,48,0.82) 55%, transparent 100%)",
          }}
        >
          <div className="flex items-center justify-center gap-3">
            <div className="flex flex-col items-center">
              <span
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "0.6rem",
                  fontWeight: 800,
                  letterSpacing: "0.15em",
                  color: "rgba(255,233,214,0.75)",
                }}
              >
                TU DÉPOSES
              </span>
              <span
                className="leading-none"
                style={{
                  fontFamily: "'Bagel Fat One', cursive",
                  fontSize: "2.6rem",
                  color: "#ffffff",
                  textShadow: "0 3px 0 rgba(0,0,0,0.45)",
                }}
              >
                20€
              </span>
            </div>
            <span
              style={{
                fontFamily: "'Bagel Fat One', cursive",
                fontSize: "2rem",
                color: "#FFB930",
                textShadow: "0 2px 0 rgba(0,0,0,0.45)",
              }}
            >
              →
            </span>
            <div className="flex flex-col items-center">
              <span
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "0.6rem",
                  fontWeight: 800,
                  letterSpacing: "0.15em",
                  color: "#FFB930",
                }}
              >
                TU REÇOIS
              </span>
              <span
                className="leading-none"
                style={{
                  fontFamily: "'Bagel Fat One', cursive",
                  fontSize: "2.8rem",
                  background:
                    "linear-gradient(180deg, #FFB930 0%, #FF4B6E 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 3px 0 rgba(0,0,0,0.4))",
                }}
              >
                40€
              </span>
            </div>
          </div>
          <p
            className="text-center mt-2"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "0.7rem",
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "rgba(255,233,214,0.85)",
            }}
          >
            CRÉDITÉ INSTANTANÉMENT · SANS CB
          </p>
          <div className="flex justify-center mt-3">
            <span
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full"
              style={{
                fontFamily: "'Chakra Petch', sans-serif",
                fontWeight: 800,
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                color: "#ffffff",
                background:
                  "linear-gradient(180deg, #00a358 0%, #00d978 50%, #00a358 100%)",
                border: "1.5px solid rgba(255,255,255,0.9)",
                boxShadow:
                  "0 0 22px rgba(0,217,120,0.6), 0 6px 16px rgba(0,0,0,0.35)",
                animation: "hero-cta-pulse 2s ease-in-out infinite",
              }}
            >
              ▶ RÉCLAMER MES 40€
            </span>
          </div>
        </div>
      </a>
      <style>{`
        @keyframes hero-cta-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 22px rgba(0,217,120,0.6), 0 6px 16px rgba(0,0,0,0.35); }
          50% { transform: scale(1.05); box-shadow: 0 0 34px rgba(0,217,120,0.95), 0 6px 16px rgba(0,0,0,0.35); }
        }
      `}</style>
    </section>
  );
};

export default CyclopeHero;
