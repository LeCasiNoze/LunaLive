import en, {type Dict} from './en';
import fr from './fr';
import de from './de';
import es from './es';
import pt from './pt';
import it from './it';

export const LANGS = ['en', 'fr', 'de', 'es', 'pt', 'it'] as const;
export type Lang = typeof LANGS[number];
const DICTS: Record<Lang, Dict> = {en, fr, de, es, pt, it};
export const t = (lang: Lang) => DICTS[lang];
// L'anglais est servi à la racine (x-default), les autres langues sous /<lang>/.
export const href = (lang: Lang, path = '') => (lang === 'en' ? '/' : `/${lang}/`) + path;
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
export const fmtDate = (lang: Lang, iso: string) => new Intl.DateTimeFormat(t(lang).locale, {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(iso + 'T12:00:00Z'));
