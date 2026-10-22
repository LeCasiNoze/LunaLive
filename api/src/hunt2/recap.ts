type RecapItem = { id: string; name: string; bet?: number | null; pay?: number | null; caller?: string | null };
export type RecapState = { phase: string; start?: number | null; items: RecapItem[] };

const eur = (value: number) => value.toFixed(2).replace(".", ",") + " €";
const multi = (value: number) => "×" + value.toFixed(1).replace(".", ",");
const bonusItems = (state: RecapState) => state.items.filter(it => Number(it.bet) > 0);

export function manualHuntFarmRecap(state: RecapState): string | null {
  const bonus = bonusItems(state);
  if (!["farm", "edit"].includes(state.phase) || !bonus.length) return null;
  const bets = bonus.reduce((sum, it) => sum + Number(it.bet), 0);
  return `Bonus ${bonus.length} · BE actuel ${Number(state.start) > 0 ? multi(Number(state.start) / bets) : "—"}`;
}

export function manualHuntFinalRecap(state: RecapState): string | null {
  const bonus = bonusItems(state);
  if (state.phase !== "open" || !bonus.length || bonus.some(it => it.pay == null || !Number.isFinite(it.pay))) return null;
  const ranked = bonus.slice().sort((a,b) => Number(b.pay) / Number(b.bet) - Number(a.pay) / Number(a.bet));
  const total = bonus.reduce((sum,it) => sum + Number(it.pay),0);
  const average = bonus.reduce((sum,it) => sum + Number(it.pay) / Number(it.bet),0) / bonus.length;
  const profit = total - Number(state.start || 0);
  const call = (it: RecapItem) => `${it.name}${it.caller ? ` par @${it.caller}` : ""} (${multi(Number(it.pay) / Number(it.bet))})`;
  return `${profit > 0 ? "GG ! Gain" : profit < 0 ? "Dommage ! Perte" : "À l’équilibre"}${profit === 0 ? "" : ` ${eur(Math.abs(profit))}`} · Retours ${eur(total)} · Moy. ${multi(average)} · Meilleur : ${call(ranked[0])} · Pire : ${call(ranked[ranked.length - 1])}`;
}

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
  const be = remaining === 0 ? multi(0) : pendingBet > 0 ? multi(remaining / pendingBet) : "non atteint";
  return `Ouverture ${paid.length}/${bonus.length} · ${current.name} : ${eur(current.pay)} (${multi(current.pay / Number(current.bet))}) · Moy. ${multi(average)} · BE restant ${eur(remaining)} (${be})`;
}
