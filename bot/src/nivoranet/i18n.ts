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
    privateOnly: "Use this command in your private NivoraNet ticket.",
    noBrand: "No active brand is assigned to your account yet.",
    selectBrand: "Choose the brand for this refill.",
    requestDailyRefill: "Request your daily refill",
    accountDetailsRequired: "Casino account details required first",
    refillRequested: "Refill requested",
    queued: "Queued for the next refill batch",
    dailyLimit: "One refill per brand per day",
    refillAdded: "Your refill request has been added to the next batch.",
    refillSaved: "Your casino details were saved and your refill request was added to the next batch.",
    registration: "New registration",
    registrationText: (brand: string) => `A new registration has been detected for ${brand}.`,
    ftd: "New FTD",
    ftdText: (amount: string, brand: string) => `A first-time deposit of ${amount} has been detected for ${brand}.`,
    deposit: "New deposit",
    depositText: (number: number, amount: string, total: string) => `A player made their ${number}${number === 1 ? "st" : number === 2 ? "nd" : number === 3 ? "rd" : "th"} deposit: ${amount} / Total: ${total}.`,
    depositSimple: (amount: string, brand: string) => `A player made a deposit of ${amount} for ${brand}.`,
    refillCompleted: "Refill completed",
    refillCompletedText: (brand: string, amount: string) => `Your ${brand} refill of ${amount} has been completed.`,
    linkedPending: "Your NivoraNet account is linked. It is still awaiting admin approval.",
    linkedReady: (username: string) => `Your **${username}** account is linked. Your private ticket is ready.`,
    applicationReceived: "Your application has been received. You will be notified here once it has been reviewed.",
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
    privateOnly: "Utilise cette commande dans ton ticket privé NivoraNet.",
    noBrand: "Aucune marque active n’est encore attribuée à ton compte.",
    selectBrand: "Choisis la marque pour ce refill.",
    requestDailyRefill: "Demander le refill quotidien",
    accountDetailsRequired: "Les informations du compte casino sont requises",
    refillRequested: "Refill demandé",
    queued: "Ajouté au prochain batch de refill",
    dailyLimit: "Un refill par marque et par jour",
    refillAdded: "Ta demande de refill a été ajoutée au prochain batch.",
    refillSaved: "Tes informations casino sont enregistrées et ta demande de refill a été ajoutée au prochain batch.",
    registration: "Nouvelle inscription",
    registrationText: (brand: string) => `Une nouvelle inscription a été détectée pour ${brand}.`,
    ftd: "Nouveau FTD",
    ftdText: (amount: string, brand: string) => `Un premier dépôt de ${amount} a été détecté pour ${brand}.`,
    deposit: "Nouveau dépôt",
    depositText: (number: number, amount: string, total: string) => `Un joueur a effectué son ${number}e dépôt : ${amount} / Total : ${total}.`,
    depositSimple: (amount: string, brand: string) => `Un joueur a effectué un dépôt de ${amount} pour ${brand}.`,
    refillCompleted: "Refill effectué",
    refillCompletedText: (brand: string, amount: string) => `Ton refill ${brand} de ${amount} a été effectué.`,
    linkedPending: "Ton compte NivoraNet est lié. Il est toujours en attente de validation par l’administration.",
    linkedReady: (username: string) => `Ton compte **${username}** est lié. Ton ticket privé est prêt.`,
    applicationReceived: "Ta candidature a été reçue. Tu seras notifié ici une fois qu’elle aura été examinée.",
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
    privateOnly: "Nutze diesen Befehl in deinem privaten NivoraNet-Ticket.",
    noBrand: "Deinem Konto ist noch keine aktive Marke zugewiesen.",
    selectBrand: "Wähle die Marke für diesen Refill.",
    requestDailyRefill: "Täglichen Refill anfordern",
    accountDetailsRequired: "Casino-Kontodaten zuerst erforderlich",
    refillRequested: "Refill angefordert",
    queued: "Für den nächsten Refill-Batch eingeplant",
    dailyLimit: "Ein Refill pro Marke und Tag",
    refillAdded: "Deine Refill-Anfrage wurde dem nächsten Batch hinzugefügt.",
    refillSaved: "Deine Casino-Daten wurden gespeichert und deine Refill-Anfrage wurde dem nächsten Batch hinzugefügt.",
    registration: "Neue Registrierung",
    registrationText: (brand: string) => `Eine neue Registrierung wurde für ${brand} erkannt.`,
    ftd: "Neuer FTD",
    ftdText: (amount: string, brand: string) => `Eine Ersteinzahlung von ${amount} wurde für ${brand} erkannt.`,
    deposit: "Neue Einzahlung",
    depositText: (number: number, amount: string, total: string) => `Ein Spieler hat seine ${number}. Einzahlung getätigt: ${amount} / Gesamt: ${total}.`,
    depositSimple: (amount: string, brand: string) => `Ein Spieler hat ${amount} bei ${brand} eingezahlt.`,
    refillCompleted: "Refill abgeschlossen",
    refillCompletedText: (brand: string, amount: string) => `Dein ${brand}-Refill über ${amount} wurde abgeschlossen.`,
    linkedPending: "Dein NivoraNet-Konto ist verknüpft und wartet noch auf die Freigabe durch das Team.",
    linkedReady: (username: string) => `Dein Konto **${username}** ist verknüpft. Dein privates Ticket ist bereit.`,
    applicationReceived: "Deine Bewerbung wurde erhalten. Du wirst hier benachrichtigt, sobald sie geprüft wurde.",
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
