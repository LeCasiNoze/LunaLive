// api/src/calls/provider_aliases.ts
// Alias → nom canonique (inspiré NozeBot)
const ALIASES = {
    // Nolimit
    "nolimit": "Nolimit City",
    "nolimit city": "Nolimit City",
    // Pragmatic
    "pragmatic": "Pragmatic Play",
    "pragmatic play": "Pragmatic Play",
    // Hacksaw
    "hacksaw": "Hacksaw Gaming",
    "hacksaw gaming": "Hacksaw Gaming",
    // BGaming
    "bgaming": "BGaming",
    // ELK
    "elk": "Elk",
    "elk studios": "Elk",
    // Relax
    "relax": "Relax Gaming",
    "relax gaming": "Relax Gaming",
    // Microgaming
    "microgaming": "Microgaming",
    // Thunderkick
    "thunderkick": "Thunderkick",
    // Play'n GO (si ça arrive un jour)
    "playn go": "Play'n GO",
    "play'n go": "Play'n GO",
    "playngo": "Play'n GO",
    // ✅ Sous-providers -> provider parent
    "backseat": "Hacksaw Gaming",
    "backseat gaming": "Hacksaw Gaming",
    "bullshark": "Hacksaw Gaming",
    "bullshark games": "Hacksaw Gaming",
    // Shady Lady
    "shady lady": "Shady Lady",
    "shadylady": "Shady Lady",
    // AvatarUX
    "avatar ux": "AvatarUX",
    "avatarux": "AvatarUX",
};
export function normalizeProvider(raw) {
    if (!raw)
        return null;
    const key = String(raw).trim().toLowerCase();
    return ALIASES[key] ?? String(raw).trim();
}
