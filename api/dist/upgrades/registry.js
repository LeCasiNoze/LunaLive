export const UPGRADES = [
    {
        key: "predictions.bet_cap",
        label: "Prédictions – Limite de pari",
        description: "Augmente le montant maximum que tu peux parier sur une prédiction.",
        maxLevel: 3,
        levels: [
            { level: 1, priceRubis: 30, effects: { betCap: 30 } },
            { level: 2, priceRubis: 50, effects: { betCap: 50 } },
            { level: 3, priceRubis: 100, effects: { betCap: 100 } },
        ],
    },
    // TODO: rain upgrades
];
