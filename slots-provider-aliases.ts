// src/slots/provider_aliases.ts
// Normalisation des noms de providers

const PROVIDER_ALIASESES: Record<string, string> = {
  // Pragmatic Play
  "pragmatic": "pragmatic",
  "pragmatic play": "pragmatic",
  "pragmaticplay": "pragmatic",
  
  // NetEnt
  "netent": "netent",
  "net entertainment": "netent",
  
  // Microgaming
  "microgaming": "microgaming",
  "micro": "microgaming",
  
  // Play'n GO
  "playngo": "playngo",
  "play'n go": "playngo",
  "play n go": "playngo",
  
  // Yggdrasil
  "yggdrasil": "yggdrasil",
  "ygg": "yggdrasil",
  
  // Red Tiger
  "redtiger": "redtiger",
  "red tiger": "redtiger",
  
  // Quickspin
  "quickspin": "quickspin",
  
  // Thunderkick
  "thunderkick": "thunderkick",
  
  // ELK Studios
  "elk": "elk",
  "elk studios": "elk",
  
  // Nolimit City
  "nolimit": "nolimit",
  "nolimit city": "nolimit",
  
  // Push Gaming
  "push": "push",
  "push gaming": "push",
  
  // Hacksaw Gaming
  "hacksaw": "hacksaw",
  "hacksaw gaming": "hacksaw",
  
  // Relax Gaming
  "relax": "relax",
  "relax gaming": "relax",
  
  // Blueprint Gaming
  "blueprint": "blueprint",
  "blueprint gaming": "blueprint",
  
  // Big Time Gaming
  "btg": "btg",
  "big time gaming": "btg",
};

export function normalizeProvider(providerRaw: string): string | null {
  if (!providerRaw) return null;
  
  const clean = String(providerRaw).toLowerCase().trim();
  return PROVIDER_ALIASESES[clean] || clean;
}
