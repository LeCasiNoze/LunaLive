import { CYCLOPE_CASINO_URL } from "@/cyclope/lib/cta-cyclope";

const CyclopeFinalCta = () => {
  return (
    <section className="w-full px-5 py-10">
      <div className="max-w-sm mx-auto space-y-3">
        <a
          href={CYCLOPE_CASINO_URL}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="cyclope-cta relative flex items-center justify-center w-full py-5 rounded-2xl overflow-hidden active:scale-[0.97] transition-transform"
          style={{
            fontFamily: "'Bagel Fat One', cursive",
            fontSize: "1.4rem",
            letterSpacing: "0.05em",
            color: "#ffffff",
            background:
              "linear-gradient(135deg, #00a358 0%, #00d978 50%, #FFB930 100%)",
            border: "2px solid #ffffff",
            boxShadow:
              "0 0 40px rgba(0,217,120,0.8), 0 14px 32px rgba(0,163,88,0.45), inset 0 1px 0 rgba(255,255,255,0.9)",
            textShadow: "0 2px 0 rgba(0,90,45,0.55)",
          }}
        >
          🎁 RECEVOIR MES 40€
        </a>
        <p
          className="text-center text-[0.72rem] font-semibold"
          style={{ color: "#FFE9D6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Inscription 30s · Sans CB requise · Bonus crédité auto
        </p>
      </div>
    </section>
  );
};

export default CyclopeFinalCta;