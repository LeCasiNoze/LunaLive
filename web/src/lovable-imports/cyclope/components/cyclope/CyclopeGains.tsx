const gains = [
  { name: "Léa", amount: "+148€", time: "il y a 2 min" },
  { name: "Mehdi", amount: "+72€", time: "il y a 4 min" },
  { name: "Naël", amount: "+512€", time: "il y a 6 min" },
  { name: "Sofiane", amount: "+38€", time: "il y a 8 min" },
  { name: "Inès", amount: "+240€", time: "il y a 11 min" },
  { name: "Yanis", amount: "+86€", time: "il y a 13 min" },
  { name: "Camille", amount: "+185€", time: "il y a 16 min" },
  { name: "Rayan", amount: "+820€", time: "il y a 19 min" },
  { name: "Manon", amount: "+124€", time: "il y a 22 min" },
  { name: "Anaïs", amount: "+67€", time: "il y a 25 min" },
];

const CyclopeGains = () => {
  const loop = [...gains, ...gains];
  return (
    <section className="w-full px-5 py-8">
      <div className="max-w-sm mx-auto">
        <div className="relative flex justify-center mb-5">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="animate-gains-aura w-64 h-20 rounded-full" />
          </div>
          <h2
            className="relative text-center animate-gains-title"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "1.35rem",
              fontWeight: 900,
              letterSpacing: "0.14em",
              color: "#FFB930",
              textShadow: "0 0 18px rgba(255,185,48,0.5)",
              textTransform: "uppercase",
            }}
          >
            · GAINS EN DIRECT ·
          </h2>
        </div>

        <div
          className="relative overflow-hidden"
          style={{
            height: "260px",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
          }}
        >
          <div className="flex flex-col gap-2 animate-gains-scroll">
          {loop.map((g, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,185,48,0.18)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0"
                style={{
                  background: "linear-gradient(135deg, #FF4B6E, #FF8A4B)",
                  border: "1.5px solid rgba(255,255,255,0.9)",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {g.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-bold"
                  style={{ color: "#FFFFFF", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {g.name}
                </p>
                <p className="text-[0.68rem] font-semibold" style={{ color: "rgba(255,233,214,0.65)" }}>
                  {g.time}
                </p>
              </div>
              <div
                style={{
                  fontFamily: "'Bagel Fat One', cursive",
                  fontSize: "1.05rem",
                  color: "#FFB930",
                  textShadow: "0 0 14px rgba(255,185,48,0.55)",
                }}
              >
                {g.amount}
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes gains-scroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .animate-gains-scroll {
          animation: gains-scroll 28s linear infinite;
        }
        .animate-gains-aura {
          background: radial-gradient(closest-side, rgba(255,185,48,0.45), rgba(255,75,110,0.25) 55%, transparent 75%);
          filter: blur(18px);
          animation: gains-aura 2.8s ease-in-out infinite;
        }
        @keyframes gains-aura {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.08); }
        }
        @keyframes gains-title {
          0%, 100% {
            transform: scale(1);
            text-shadow: 0 0 18px rgba(255,185,48,0.5);
          }
          50% {
            transform: scale(1.04);
            text-shadow: 0 0 28px rgba(255,185,48,0.9), 0 0 8px rgba(255,75,110,0.6);
          }
        }
        .animate-gains-title {
          animation: gains-title 2.2s ease-in-out infinite;
          display: inline-block;
          width: 100%;
        }
        .animate-gains-title::before {
          content: "🔴 ";
          animation: gains-dot 1.2s ease-in-out infinite;
          display: inline-block;
        }
        @keyframes gains-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </section>
  );
};

export default CyclopeGains;