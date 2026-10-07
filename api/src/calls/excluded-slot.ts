/** Slot-name policy, independent of provider aliases and temporary recent exclusions. */
export function excludedSlotName(name: string): boolean {
  const text=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /(?:^|[^a-z0-9])(?:boosted|roulette|black[\s_-]*jack)(?:$|[^a-z0-9])/.test(text);
}
