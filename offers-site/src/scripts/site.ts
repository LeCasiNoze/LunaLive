// Script unique du site : suivi (sans cookie), copie du code, compte à rebours, tilt, spotlight, reveal, barre collante.
const API = 'https://lunalive-api.onrender.com/api/public/affi-events';
const SLUG = 'bigwindaily';
const lang = document.documentElement.lang.slice(0, 2);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Source de la visite (premier contact de la session) : ?utm_source=… ou ?src=… dans le lien partagé.
function source() {
  const q = new URLSearchParams(location.search);
  const now = {s: q.get('utm_source') || q.get('src'), m: q.get('utm_medium'), c: q.get('utm_campaign')};
  try {
    if (now.s) sessionStorage.setItem('bwd_src', JSON.stringify(now));
    return JSON.parse(sessionStorage.getItem('bwd_src') || 'null') || now;
  } catch { return now; }
}
export function track(event: 'view' | 'click_cta', what: string) {
  const s = source();
  const body = JSON.stringify({slug: SLUG, event, referrer: document.referrer || null, utmSource: s.s || 'direct', utmMedium: s.m || null, utmCampaign: `${lang}|${what}`.slice(0, 160)});
  try { fetch(API, {method: 'POST', headers: {'Content-Type': 'application/json'}, body, keepalive: true, mode: 'cors'}).catch(() => {}); } catch {}
}
if (!document.querySelector('[data-go-redirect]')) track('view', location.pathname);

document.addEventListener('click', e => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
  if (a) track('click_cta', `${a.dataset.go}|${a.dataset.place || ''}`);
});

// Copie du code promo.
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy!); } catch {}
  const label = b.querySelector('span')!; const old = label.textContent;
  b.classList.add('ok'); label.textContent = b.dataset.done || 'OK';
  track('click_cta', `copy-code|${b.dataset.place || ''}`);
  setTimeout(() => { b.classList.remove('ok'); label.textContent = old; }, 1800);
}));

// Compte à rebours jusqu'au 1er du mois suivant, minuit heure de Paris (reset de la race).
function parisOffsetMin(d: Date) {
  const s = new Intl.DateTimeFormat('en-US', {timeZone: 'Europe/Paris', timeZoneName: 'shortOffset'}).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'GMT+1';
  const m = s.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] || 0) : 60;
}
function raceEnd() {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit'}).formatToParts(new Date());
  let y = Number(p.find(x => x.type === 'year')!.value), mo = Number(p.find(x => x.type === 'month')!.value) + 1;
  if (mo > 12) { mo = 1; y++; }
  const guess = new Date(Date.UTC(y, mo - 1, 1));
  return new Date(guess.getTime() - parisOffsetMin(guess) * 60000);
}
const cds = document.querySelectorAll<HTMLElement>('[data-cd]');
if (cds.length) {
  const end = raceEnd().getTime();
  const tick = () => {
    const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
    const v = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    cds.forEach(cd => cd.querySelectorAll<HTMLElement>('[data-u]').forEach((u, i) => { u.firstChild!.textContent = String(v[i]).padStart(2, '0'); }));
  };
  tick(); setInterval(tick, 1000);
}

// Spotlight + tilt 3D sur la carte vedette, spotlight sur les cartes d'offres.
if (!reduce && matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll<HTMLElement>('[data-spot]').forEach(el => el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));
  const feat = document.querySelector<HTMLElement>('[data-tilt]');
  if (feat) {
    feat.addEventListener('pointermove', e => {
      const r = feat.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      feat.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    });
    feat.addEventListener('pointerleave', () => { feat.style.transform = ''; });
  }
}

// Apparition au scroll.
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), {rootMargin: '0px 0px -8% 0px'});
document.querySelectorAll('.rv').forEach(el => io.observe(el));

// Barre CTA mobile : visible une fois la carte vedette sortie de l'écran, masquée au niveau du footer.
const sticky = document.querySelector<HTMLElement>('.sticky');
const anchor = document.querySelector('[data-sticky-anchor]');
const foot = document.querySelector('footer');
if (sticky && anchor) {
  let pastHero = false, atFoot = false;
  const upd = () => sticky.classList.toggle('on', pastHero && !atFoot);
  new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; upd(); }).observe(anchor);
  if (foot) new IntersectionObserver(([e]) => { atFoot = e.isIntersecting; upd(); }).observe(foot);
}

// Fermer le menu de langue en cliquant ailleurs.
document.addEventListener('click', e => {
  document.querySelectorAll<HTMLDetailsElement>('details.lang[open]').forEach(d => { if (!d.contains(e.target as Node)) d.open = false; });
});
