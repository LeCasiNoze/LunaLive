// api/src/calls/provider_aliases.ts
// Alias → nom canonique (basé sur l'audit global complet - TOUS les providers fonctionnels)
const ALIASES = {
    // ✅ TOUS les providers working (testés et validés - 34+ providers)
    "pragmatic-play": "Pragmatic Play",
    "pgsoft": "pgsoft",
    "playn-go": "Play'n GO",
    "hacksaw-gaming": "Hacksaw Gaming",
    "no-limit-city": "Nolimit City",
    "relax": "Relax Gaming",
    "platipus": "platipus",
    "popiplay": "popiplay",
    "yggdrasil": "yggdrasil",
    "netent": "NetEnt",
    "microgaming": "Microgaming",
    "elk": "Elk",
    "bgaming": "BGaming",
    "playson": "playson",
    "3oaks": "3oaks",
    "gamba": "gamba",
    "7mojos": "7mojos",
    "igrosoft": "igrosoft",
    "bet2tech": "bet2tech",
    "givme": "givme",
    "atmosfera": "atmosfera",
    // ✅ Nouveaux providers découverts (tous fonctionnels !)
    "amatic": "Amatic",
    "avatarux": "AvatarUX",
    "belatra": "Belatra",
    "endorphina": "Endorphina",
    "evolution": "Evolution",
    "evoplay": "Evoplay",
    "fantasma": "Fantasma",
    "gameart": "GameArt",
    "gamomat": "Gamomat",
    "gamzix": "Gamzix",
    "habanero": "Habanero",
    "kagaming": "KA Gaming",
    "kalamba": "Kalamba",
    "mancala": "Mancala",
    "octoplay": "Octoplay", // 52 jeux découverts !
    // ✅ Anciens slugs (redirection vers les nouveaux slugs Gamba)
    "nolimit-city": "Nolimit City", // Redirection vers no-limit-city
    "relax-gaming": "Relax Gaming", // Redirection vers relax
    "backseat": "Hacksaw Gaming", // Redirection vers hacksaw-gaming
    // ✅ Alias alternatifs (compatibilité)
    // Pragmatic
    "pragmatic": "Pragmatic Play",
    "pragmatic play": "Pragmatic Play",
    // Hacksaw
    "hacksaw": "Hacksaw Gaming",
    "hacksaw gaming": "Hacksaw Gaming",
    // Nolimit
    "nolimit": "Nolimit City",
    "nolimit city": "Nolimit City",
    // Relax
    "relax gaming": "Relax Gaming",
    // Play'n GO
    "playn go": "Play'n GO",
    "play'n go": "Play'n GO",
    "playngo": "Play'n GO",
    // ✅ Sous-providers -> provider parent
    "backseat gaming": "Hacksaw Gaming",
    "bullshark games": "Hacksaw Gaming",
    // Shady Lady
    "shady lady": "Shady Lady",
    "shadylady": "Shady Lady"
};
export function normalizeProvider(raw) {
    if (!raw)
        return null;
    const key = String(raw).trim().toLowerCase();
    return ALIASES[key] ?? String(raw).trim();
}
