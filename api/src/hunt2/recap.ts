type RecapItem = { id: string; name: string; bet?: number | null; pay?: number | null };
type RecapState = { phase: string; start?: number | null; items: RecapItem[] };

export function manualHuntRecap(state: RecapState, itemId: string): string | null {
  if (state.phase !== "open") return null;
  const bonus = state.items.filter(it => Number(it.bet) > 0);
  const current = bonus.find(it => it.id === itemId);
  if (!current || current.pay == null || !Number.isFinite(current.pay)) return null;
  const paid = bonus.filter(it => it.pay != null && Number.isFinite(it.pay));
  const pending = bonus.filter(it => it.pay == null);
  const total = paid.reduce((sum, it) => sum + Number(it.pay), 0);
  const average = paid.reduce((sum, it) => sum + Number(it.pay) / Number(it.bet), 0) / paid.length;
  const remaining = Math.max(0, Number(state.start || 0) - total);
  const pendingBet = pending.reduce((sum, it) => sum + Number(it.bet), 0);
  const eur = (value: number) => value.toFixed(2).replace(".", ",") + " €";
  const multi = (value: number) => "×" + value.toFixed(1).replace(".", ",");
  const be = remaining === 0 ? multi(0) : pendingBet > 0 ? multi(remaining / pendingBet) : "non atteint";
  return `${current.name} : ${eur(current.pay)} (${multi(current.pay / Number(current.bet))}) · Ouverture ${paid.length}/${bonus.length} · ${pending.length} bonus restants · Moy. ${multi(average)} · BE restant ${eur(remaining)} (${be})`;
}
