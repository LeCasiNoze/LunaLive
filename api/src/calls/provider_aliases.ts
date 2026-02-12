// api/src/calls/provider_aliases.ts
// Alias → nom canonique (inspiré NozeBot)

const ALIASES: Record<string, string> = {
  // ✅ slugs gamba
  "hacksaw-gaming": "Hacksaw Gaming",
  "pragmatic-play": "Pragmatic Play",
  "no-limit-city": "Nolimit City",
  "relax-gaming": "Relax Gaming",
  "playn-go": "Play'n GO",
  "red-tiger": "Red Tiger",
  "netent": "NetEnt",
  "btg": "Big Time Gaming",
  "oryx-gaming": "Oryx Gaming",
  "smartsoft-gaming": "SmartSoft Gaming",
  "peter-and-sons": "Peter & Sons",
  "print-studios": "Print Studios",

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

export function normalizeProvider(raw?: string | null): string | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  return (ALIASES as any)[key] ?? String(raw).trim();
}
