import CyclopeHeader from "@/cyclope/components/cyclope/CyclopeHeader";
import CyclopeHero from "@/cyclope/components/cyclope/CyclopeHero";
import CyclopeTrust from "@/cyclope/components/cyclope/CyclopeTrust";
import CyclopeSteps from "@/cyclope/components/cyclope/CyclopeSteps";
import CyclopeGains from "@/cyclope/components/cyclope/CyclopeGains";
import CyclopeTemoignages from "@/cyclope/components/cyclope/CyclopeTemoignages";
import CyclopeFinalCta from "@/cyclope/components/cyclope/CyclopeFinalCta";
import CyclopeStickyCta from "@/cyclope/components/cyclope/CyclopeStickyCta";

const Cyclope = () => {
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background:
          "radial-gradient(110% 55% at 50% -10%, rgba(255,75,110,0.35) 0%, rgba(255,185,48,0.18) 35%, transparent 70%), radial-gradient(80% 45% at 50% 110%, rgba(255,75,110,0.22) 0%, transparent 70%), #0B1530",
      }}
    >
      <div className="relative z-10">
        <CyclopeHeader />
        <CyclopeHero />
        <CyclopeTrust />
        <CyclopeSteps />
        <CyclopeGains />
        <CyclopeTemoignages />
        <CyclopeFinalCta />
        <footer
          className="py-8 px-5 pb-36 text-center space-y-3"
          style={{ color: "#FFE9D6" }}
        >
          <p
            className="font-extrabold"
            style={{ fontFamily: "'Bagel Fat One', cursive", fontSize: "1.1rem" }}
          >
            CYCLOPE L'HÉRITIER · @cyclope_heritier
          </p>
          <div
            className="space-y-2 text-[0.7rem] leading-relaxed"
            style={{ color: "rgba(255,233,214,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <p>
              Les jeux d'argent et de hasard sont strictement interdits aux mineurs de 18 ans.
            </p>
            <p>
              Jouer comporte des risques : endettement, isolement, dépendance. Pour être aidé,
              appelez le <span className="font-bold">09 74 75 13 13</span> (appel non surtaxé)
              ou rendez-vous sur <span className="font-bold">joueurs-info-service.fr</span>.
            </p>
            <p>Jouez responsablement, dans la modération et pour le plaisir.</p>
          </div>
          <p className="text-[0.65rem]" style={{ color: "rgba(255,233,214,0.5)" }}>
            © {new Date().getFullYear()} — Page affiliée. Contient des liens commerciaux.
          </p>
        </footer>
      </div>

      <CyclopeStickyCta />
    </div>
  );
};

export default Cyclope;
