import { CYCLOPE_CASINO_URL } from "@/cyclope/lib/cta-cyclope";

const CyclopeStickyCta = () => {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-3"
      style={{
        background:
          "linear-gradient(to top, #0B1530 55%, rgba(11,21,48,0.85) 85%, transparent)",
      }}
    >
      <a
        href={CYCLOPE_CASINO_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="relative flex items-center justify-center w-full py-5 rounded-2xl overflow-hidden active:scale-95 transition-transform max-w-sm mx-auto"
        style={{
          fontFamily: "'Bagel Fat One', cursive",
          fontSize: "1.35rem",
          letterSpacing: "0.05em",
          color: "#ffffff",
          background:
            "linear-gradient(135deg, #00a358 0%, #00d978 50%, #FFB930 100%)",
          border: "2px solid #ffffff",
          boxShadow:
            "0 0 36px rgba(0,217,120,0.85), 0 12px 28px rgba(0,163,88,0.5), inset 0 1px 0 rgba(255,255,255,0.9)",
          textShadow: "0 2px 0 rgba(0,90,45,0.55)",
          animation: "cyclope-glow 2.4s ease-in-out infinite",
        }}
      >
        🎁 RECEVOIR MES 40€
      </a>
      <p
        className="text-center mt-2"
        style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#FFE9D6" }}
      >
        <span className="text-[0.7rem] font-semibold">Dépose </span>
        <span
          style={{
            fontFamily: "'Bagel Fat One', cursive",
            fontSize: "1.15rem",
            color: "#FFB930",
            textShadow: "0 1px 0 rgba(0,0,0,0.4)",
          }}
        >
          20€
        </span>
        <span className="text-[0.7rem] font-semibold"> et reçois 40€</span>
      </p>
      <style>{`
        @keyframes cyclope-glow {
          0%, 100% { box-shadow: 0 0 36px rgba(0,217,120,0.85), 0 12px 28px rgba(0,163,88,0.5), inset 0 1px 0 rgba(255,255,255,0.9); }
          50% { box-shadow: 0 0 60px rgba(255,185,48,0.95), 0 12px 28px rgba(0,163,88,0.5), inset 0 1px 0 rgba(255,255,255,1); }
        }
      `}</style>
    </div>
  );
};

export default CyclopeStickyCta;