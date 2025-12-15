import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/lives", (_req, res) => {
  // Données fake côté serveur (prochaine étape: DB + DLive)
  res.json([
    { id: "1", slug: "wayzebi", displayName: "Wayzebi", title: "Slots session — bonus hunt", viewers: 842 },
    { id: "2", slug: "sinisterzs", displayName: "Sinisterzs", title: "Morning grind — chill", viewers: 510 },
    { id: "3", slug: "nico-carasso", displayName: "Nico Carasso", title: "Big balance / risky spins", viewers: 321 },
    { id: "4", slug: "teoman", displayName: "Teoman", title: "Community picks — let’s go", viewers: 205 },
    { id: "5", slug: "bryan-cars", displayName: "BryanCars", title: "Late session — last shots", viewers: 96 }
  ]);
});

app.get("/streamers/:slug", (req, res) => {
  const slug = String(req.params.slug || "");
  const lives = [
    { id: "1", slug: "wayzebi", displayName: "Wayzebi", title: "Slots session — bonus hunt", viewers: 842 },
    { id: "2", slug: "sinisterzs", displayName: "Sinisterzs", title: "Morning grind — chill", viewers: 510 },
    { id: "3", slug: "nico-carasso", displayName: "Nico Carasso", title: "Big balance / risky spins", viewers: 321 },
    { id: "4", slug: "teoman", displayName: "Teoman", title: "Community picks — let’s go", viewers: 205 },
    { id: "5", slug: "bryan-cars", displayName: "BryanCars", title: "Late session — last shots", viewers: 96 }
  ];
  const found = lives.find((x) => x.slug === slug);
  if (!found) return res.status(404).json({ ok: false, error: "not_found" });
  res.json(found);
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`[api] listening on :${port}`));
