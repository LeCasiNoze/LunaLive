export type NivoraLanguage = "en" | "fr" | "de";

export function nivoraLanguage(value?: string | null): NivoraLanguage {
  const input = value?.trim().toLowerCase() ?? "";
  if (input.startsWith("fr") || input.includes("french") || input.includes("fran")) return "fr";
  if (input.startsWith("de") || input.includes("german") || input.includes("deutsch")) return "de";
  return "en";
}

const copy = {
  en: {
    ticketTitle: "Welcome to NivoraNet",
    ticketIntro: "This is your permanent private ticket for support, refills and performance alerts.",
    ticketLogin: "Your dashboard uses the email and password from your application.",
    helpTitle: "NivoraNet commands",
    helpIntro: "Use these commands in your permanent private ticket.",
    refill: "Request your daily fake balance for each eligible brand.",
    notifications: "Choose registration, FTD and deposit alerts.",
    stats: "View your performance from the 1st of the current month until today.",
  },
  fr: {
    ticketTitle: "Bienvenue sur NivoraNet",
    ticketIntro: "Voici ton ticket privé permanent pour le support, les refills et les alertes de performances.",
    ticketLogin: "Ton tableau de bord utilise l’adresse e-mail et le mot de passe renseignés lors de ton inscription.",
    helpTitle: "Commandes NivoraNet",
    helpIntro: "Utilise ces commandes dans ton ticket privé permanent.",
    refill: "Demande ta fake balance quotidienne pour chaque marque éligible.",
    notifications: "Choisis les alertes d’inscription, de FTD et de dépôt.",
    stats: "Affiche tes performances du 1er jour du mois en cours à aujourd’hui.",
  },
  de: {
    ticketTitle: "Willkommen bei NivoraNet",
    ticketIntro: "Dies ist dein permanentes privates Ticket für Support, Refills und Performance-Benachrichtigungen.",
    ticketLogin: "Für dein Dashboard verwendest du die E-Mail-Adresse und das Passwort aus deiner Bewerbung.",
    helpTitle: "NivoraNet-Befehle",
    helpIntro: "Nutze diese Befehle in deinem permanenten privaten Ticket.",
    refill: "Fordere deine tägliche Fake-Balance für jede berechtigte Marke an.",
    notifications: "Wähle Benachrichtigungen für Registrierungen, FTDs und Einzahlungen.",
    stats: "Sieh deine Performance vom ersten Tag des aktuellen Monats bis heute.",
  },
} as const;

export function t(language?: string | null) {
  return copy[nivoraLanguage(language)];
}

export function ticketGuide(language?: string | null) {
  const text = t(language);
  return `${text.ticketIntro}\n\n` +
    "`/refill` — " + text.refill + "\n" +
    "`/notifications` — " + text.notifications + "\n" +
    "`/stats` — " + text.stats + "\n" +
    "`/help` — " + (language === "fr" ? "affiche ce guide à nouveau." : language === "de" ? "zeigt diese Anleitung erneut an." : "view this guide again.") +
    `\n\n${text.ticketLogin}`;
}
