const steps = [
  { n: "1", title: "Inscription", desc: "30s avec ton mail" },
  { n: "2", title: "Dépose 20€", desc: "Paiement sécurisé" },
  { n: "3", title: "Reçois 40€", desc: "Crédité instantanément" },
];

const CyclopeSteps = () => {
  return (
    <section className="w-full px-5 py-6">
      <div className="max-w-sm mx-auto">
        <h2
          className="text-center mb-4"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "0.22em",
            color: "#FFB930",
          }}
        >
          · COMMENT ÇA MARCHE ·
        </h2>
        <div className="space-y-2">
          {steps.map((s) => (
            <div
              key={s.n}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,185,48,0.18)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #FF4B6E, #FFB930)",
                  border: "1.5px solid rgba(255,255,255,0.9)",
                  fontFamily: "'Bagel Fat One', cursive",
                  fontSize: "1.1rem",
                  color: "#fff",
                  textShadow: "0 1px 0 rgba(155,28,53,0.55)",
                }}
              >
                {s.n}
              </div>
              <div>
                <p
                  className="text-sm font-extrabold"
                  style={{ color: "#FFFFFF", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {s.title}
                </p>
                <p
                  className="text-[0.72rem] font-semibold"
                  style={{ color: "rgba(255,233,214,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CyclopeSteps;
