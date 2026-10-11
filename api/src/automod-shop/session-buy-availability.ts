const parisWeekday = new Intl.DateTimeFormat('en-US', {timeZone:'Europe/Paris', weekday:'short'});
export function sessionBuyAvailable(at: Date = new Date()): boolean {
 const day = parisWeekday.format(at);
 return day === 'Fri' || day === 'Sat';
}
export const SESSION_BUY_DAYS_MESSAGE = 'La session achat est disponible uniquement le vendredi et le samedi (heure de Paris).';
