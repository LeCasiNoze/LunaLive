import type {APIRoute} from 'astro';
import {INTENTS, intentPath} from '../data/intents';
import {maxWinPages} from '../data/maxwin';
import {href} from '../i18n';

// Fichier llms.txt (format llmstxt.org) : ce que le site publie, avec les pages qui font foi.
export const GET: APIRoute = ({site}) => {
  const b = site!.origin;
  const line = (t: string, u: string) => `- [${t}](${b}${u})`;
  const body = [
    '# Big Win Daily',
    '',
    '> Daily ranking of the biggest slot wins seen on casino live streams (Kick, Rumble), each read on screen by our detector and checked on the image, plus casino offer pages whose figures come from the casinos’ official pages, cited and dated. 18+.',
    '',
    '## Verified wins',
    line('Latest daily Top', '/wins/'),
    ...maxWinPages().map(p => line(`${p.sheet.game} max win: verified stream wins`, `/max-win/${p.id}/`)),
    '',
    '## Casinos',
    ...['rainbet', 'celsius', 'betportal'].map(id => line(`${id[0].toUpperCase()}${id.slice(1)} review`, `/casinos/${id}/`)),
    ...INTENTS.map(x => line(x.h1, href(x.lang, intentPath(x)))),
    '',
    '## Slots',
    line('Slot catalogue with official figures', '/slots/'),
    '',
  ].join('\n');
  return new Response(body, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
};
