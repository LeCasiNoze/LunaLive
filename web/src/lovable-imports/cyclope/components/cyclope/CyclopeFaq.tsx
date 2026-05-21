import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/cyclope/components/ui/accordion";

const faqs = [
  {
    q: "Comment je touche mes 40€ ?",
    a: "Tu cliques sur le bouton, tu crées ton compte en 30s et tu déposes MINIMUM 20€. En dessous de 20€, le bonus n'est PAS activé. Avec 20€ déposés, tu reçois 40€ crédités automatiquement.",
  },
  {
    q: "Pourquoi 20€ minimum ?",
    a: "C'est la condition de l'offre de bienvenue : seuls les dépôts de 20€ ou plus déclenchent le bonus x2 (+ 550%). Un dépôt de 10€ = aucun bonus. Mets bien 20€ minimum pour ne pas passer à côté des 40€ offerts.",
  },
  {
    q: "Je peux retirer mes gains ?",
    a: "Oui, tous tes gains sont retirables sur ton compte bancaire ou crypto dès que tu respectes les conditions de mise du bonus.",
  },
  {
    q: "C'est légal ?",
    a: "100% légal. Plateforme licenciée et régulée. Réservé aux 18 ans et plus, à jouer avec modération.",
  },
];

const CyclopeFaq = () => {
  return (
    <section className="w-full px-5 py-8">
      <div className="max-w-sm mx-auto">
        <h2
          className="text-center mb-5"
          style={{
            fontFamily: "'Bagel Fat One', cursive",
            fontSize: "1.6rem",
            background:
              "linear-gradient(180deg, #FFB930 0%, #FF4B6E 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 0 rgba(255,75,110,0.3))",
          }}
        >
          QUESTIONS
        </h2>

        <Accordion
          type="single"
          collapsible
          defaultValue="q-0"
          className="space-y-2"
        >
          {faqs.map((f, i) => (
            <AccordionItem
              key={i}
              value={`q-${i}`}
              className="rounded-2xl border-0 px-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,185,48,0.18)",
                boxShadow: "0 4px 18px rgba(0,0,0,0.25)",
                backdropFilter: "blur(10px)",
              }}
            >
              <AccordionTrigger
                className="text-left text-sm font-bold py-3 hover:no-underline"
                style={{
                  color: "#FFFFFF",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {f.q}
              </AccordionTrigger>
              <AccordionContent
                className="text-sm pb-3"
                style={{ color: "rgba(255,233,214,0.8)", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

export default CyclopeFaq;