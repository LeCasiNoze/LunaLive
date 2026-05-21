import t1 from "@/cyclope/assets/cyclope-temoignage-1.webp";
import t2 from "@/cyclope/assets/cyclope-temoignage-2.webp";

const testimonials = [
  { src: t1, alt: "Lina a gagné 140€", highlight: "+140€", name: "Lina" },
  { src: t2, alt: "Joueur a gagné 200€", highlight: "+200€", name: "ST" },
];

const CyclopeTemoignages = () => {
  return (
    <section className="w-full px-5 py-8">
      <div className="max-w-sm mx-auto">
        <div className="relative flex justify-center mb-5">
          <h2
            className="relative text-center"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "1.05rem",
              fontWeight: 900,
              letterSpacing: "0.14em",
              color: "#FFB930",
              textShadow: "0 0 18px rgba(255,185,48,0.45)",
              textTransform: "uppercase",
            }}
          >
            💬 Ils m'ont écrit
          </h2>
        </div>

        <div
          className="flex gap-3 overflow-x-auto pb-3 -mx-5 px-5 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none" }}
        >
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="relative shrink-0 snap-center rounded-2xl overflow-hidden"
              style={{
                width: "78%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,185,48,0.25)",
                boxShadow:
                  "0 8px 24px rgba(0,0,0,0.35), 0 0 30px rgba(255,185,48,0.15)",
              }}
            >
              <img
                src={t.src}
                alt={t.alt}
                className="w-full block"
                style={{
                  aspectRatio: "3 / 4",
                  objectFit: "cover",
                  objectPosition: "center top",
                }}
                loading="lazy"
              />
              <div
                className="absolute top-3 right-3 px-2.5 py-1 rounded-full"
                style={{
                  background:
                    "linear-gradient(135deg, #00a358 0%, #00d978 100%)",
                  border: "1.5px solid #ffffff",
                  fontFamily: "'Bagel Fat One', cursive",
                  fontSize: "0.85rem",
                  color: "#fff",
                  textShadow: "0 1px 0 rgba(0,90,45,0.5)",
                  boxShadow: "0 4px 14px rgba(0,217,120,0.5)",
                }}
              >
                {t.highlight}
              </div>
            </div>
          ))}
        </div>

        <p
          className="text-center mt-3 text-[0.7rem] font-semibold"
          style={{
            color: "rgba(255,233,214,0.65)",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          ← Swipe pour voir les messages →
        </p>
      </div>
    </section>
  );
};

export default CyclopeTemoignages;