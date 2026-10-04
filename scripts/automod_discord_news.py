"""Small, read-only VPS observer. Never clicks, spins or controls the publisher."""
import json
import math
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CONFIG = Path('/etc/automod/discord-news.json')
STATE = Path('/var/lib/automod-discord-news/state.json')


def euro(cents):
    return f'{cents / 100:.2f}'.replace('.', ',') + ' €'


def plan(status):
    if status.get('phase') != 'running' or not status.get('publisherActive'):
        return None
    config = status.get('config') or {}
    hunt = status.get('bonusHunt') or {}
    is_hunt = status.get('mode') == 'bonus-hunt'
    key = hunt.get('cycleId') if is_hunt else status.get('startedAt')
    if not key:
        return None
    result = {'key': ('hunt:' if is_hunt else 'automod:') + key,
              'title': 'AutoMod est en direct !', 'objective': 'Vos calls, votre session.',
              'count': 0, 'events': [], 'stake': config.get('stakeCents', 10),
              'golden': any(p.get('enabled') for p in (config.get('enhancedSpins') or {}).values()),
              'fast': config.get('fastSpins') is True}
    engagement = status.get('engagement') or {}
    if engagement.get('status') == 'open':
        if engagement.get('kind') == 'mode':
            result['events'].append(('mode:' + str(engagement.get('id')), 'Vote de mode en direct — 5 minutes !',
                'Quel mode voulez-vous ? **!1 Automod** ou **!2 Auto Hunt** dans le chat. Une voix par personne ; égalité ou aucun vote = choix aléatoire.'))
        else:
            summary = engagement.get('summary') or {}
            start = summary.get('startBalanceCents')
            be = hunt.get('summary', {}).get('requiredAverageMultiplier')
            details = f"Start {euro(start)}" if isinstance(start, int) else 'Start à confirmer'
            if isinstance(be, (int, float)):
                details += f' · BE ×{be:.1f}'
            result['events'].append(('prediction:' + str(engagement.get('id')), 'Pronostics ouverts — ouverture dans 3 minutes !',
                details + ' · ' + str(len(engagement.get('entries', []))) + ' bonus. Le Hunt sera-t-il rentable ? **!oui 100** ou **!non 100**. De 10 à 500 points, pot partagé.'))
    if not is_hunt:
        return result
    settings = config.get('bonusHunt') or {}
    # Opened entries from prior cycles must never count toward the current hunt.
    count = sum(e.get('status') in ('pending', 'opening', 'failed') for e in status.get('huntEntries', []))
    result['count'] = count
    result['title'] = 'Auto Hunt est en direct !'
    condition = settings.get('openingCondition', 'count')
    if condition == 'balance':
        floor = settings.get('balanceFloorCents', 0)
        start, balance = hunt.get('startBalanceCents'), hunt.get('balanceCents')
        result['title'] = 'Auto Hunt — seuil de solde ' + euro(floor)
        result['objective'] = 'Ouverture au seuil de ' + euro(floor) + '.'
        if isinstance(start, (int, float)) and isinstance(balance, (int, float)) and start > floor:
            remaining = max(0, balance - floor)
            fraction = remaining / (start - floor)
            if fraction <= .5:
                result['events'].append(('half', 'La moitié du budget Hunt a été jouée !',
                    f'{count} bonus en réserve. Il reste {euro(remaining)} avant le seuil d’ouverture.'))
            if fraction <= .1:
                result['events'].append(('near', 'Ouverture du Hunt imminente !',
                    f'{count} bonus en réserve. Il reste {euro(remaining)} avant le seuil d’ouverture.'))
    elif condition == 'vote':
        first = settings.get('voteFromBonuses', 10)
        interval = settings.get('voteEveryBonuses', 5)
        result['title'] = 'Auto Hunt — ouverture par vote'
        result['objective'] = f'Premier vote à {first} bonus, puis tous les {interval}. Tapez !hunt ouvrir ou !hunt continuer lorsqu’un vote est lancé.'
        if hunt.get('vote'):
            vote_key = str(hunt['vote'].get('id') or hunt['vote'].get('checkpoint') or count)
            result['events'].append(('vote:' + vote_key, 'À vous de choisir : ouvrir le Hunt ?',
                f'{count} bonus en réserve. Votez dans le chat : !hunt ouvrir ou !hunt continuer.'))
    else:
        target = max(1, int(settings.get('targetBonuses', 20)))
        remaining = max(0, target - count)
        result['title'] = f'Auto Hunt — {target} bonus'
        result['objective'] = f'Recherche de {target} bonus, pronostics puis ouverture de la collection. Retour en Automod à la fin.'
        if count >= math.ceil(target / 2):
            result['events'].append(('half', 'Le Hunt a passé la moitié !',
                f'{count}/{target} bonus capturés. Encore {remaining} bonus avant l’ouverture !'))
        if count > 0 and remaining <= 1:
            result['events'].append(('near', 'Ouverture du Hunt imminente !',
                f'{count}/{target} bonus capturés. Plus que {remaining} bonus à trouver ! Rejoignez le live pour les pronostics : le Hunt sera-t-il rentable ? Start {euro(hunt["startBalanceCents"]) if isinstance(hunt.get("startBalanceCents"), int) else "—"} · BE ×{hunt.get("summary", {}).get("requiredAverageMultiplier", 0) or 0:.1f}.'))
    if hunt.get('phase') == 'opening':
        result['events'].append(('opening', 'On ouvre le Hunt !',
            f'Les {count} bonus sauvegardés vont être ouverts. Venez découvrir les gains en direct !'))
    return result


def next_event(planned, sent):
    if 'start' not in sent:
        return 'start', planned['title'], planned['objective'], []
    due = [event for event in planned['events'] if event[0] not in sent]
    if not due:
        return None
    # If several thresholds were crossed between two polls, announce the latest,
    # not a burst of stale milestones. Consume earlier milestones as well.
    event = due[-1]
    return *event, [prior[0] for prior in due[:-1]]


def payload(config, planned, event, now=None):
    kind, title, description, _ = event
    stamp = now or datetime.now(timezone.utc).isoformat()
    fields = [
        {'name': 'Mise de base', 'value': euro(planned['stake']), 'inline': True},
        {'name': 'Golden Bet', 'value': 'Activée si disponible' if planned['golden'] else 'Désactivée', 'inline': True},
        {'name': 'Spins', 'value': 'Rapides (jeu de base)' if planned['fast'] else 'Normaux', 'inline': True},
    ]
    preview = config['apiBase'].rstrip('/') + '/thumbs/lecasinoze.jpg?v=' + str(int(time.time()))
    return {
        'username': 'LeCasiNoze • AutoMod',
        'avatar_url': config['apiBase'].rstrip('/') + '/avatars/u/4',
        'content': f"<@&{config['roleId']}>",
        'allowed_mentions': {'parse': [], 'roles': [config['roleId']]},
        'embeds': [{'title': title, 'description': description + '\n\n**!call + nom complet de la slot** pour participer · **!shop** pour les points et les options.',
                    'url': config['liveUrl'], 'color': 0xb99aff, 'fields': fields,
                    'image': {'url': preview}, 'timestamp': stamp,
                    'footer': {'text': 'LeCasiNoze • AutoMod & Auto Hunt'}}],
        'components': [{'type': 1, 'components': [
            {'type': 2, 'style': 5, 'label': 'Regarder sur Rumble', 'emoji': {'name': '🟢'}, 'url': config['liveUrl']},
            {'type': 2, 'style': 5, 'label': 'Regarder sur LunaLive', 'emoji': {'name': '🌙'}, 'url': config['lunaUrl']},
        ]}],
    }


def save(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix('.tmp')
    with temporary.open('w') as output:
        json.dump(state, output)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, STATE)


def read_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'AutomodDiscordNews/1.0'})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def tick(config, state):
    status = read_json('http://127.0.0.1:4317/api/status')
    planned = plan(status)
    if not planned:
        return
    record = state.setdefault(planned['key'], {'sent': {}, 'updatedAt': time.time()})
    event = next_event(planned, record['sent'])
    if not event:
        return
    kind, _, _, consumed = event
    request = urllib.request.Request(config['webhookUrl'] + '?wait=true',
        data=json.dumps(payload(config, planned, event)).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'User-Agent': 'AutomodDiscordNews/1.0'})
    # Persist the attempt before sending. A network timeout is ambiguous: don't
    # flood the role with retries of a message Discord may already have accepted.
    record['sent'][kind] = {'status': 'sending', 'at': time.time()}
    for prior in consumed:
        record['sent'][prior] = {'status': 'superseded', 'at': time.time()}
    record['updatedAt'] = time.time()
    save(state)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            message = json.load(response)
        record['sent'][kind] = {'status': 'sent', 'messageId': message['id'], 'at': time.time()}
        save(state)
        print('Discord announcement sent:', kind, 'message', message['id'], flush=True)
    except urllib.error.HTTPError as error:
        if error.code == 429:
            del record['sent'][kind]
            save(state)
        else:
            record['sent'][kind]['status'] = 'delivery-unconfirmed'
            save(state)
        # Never log webhook URL/token or the HTTP exception's full string.
        print('Discord announcement HTTP failure:', error.code, flush=True)
    except Exception:
        record['sent'][kind]['status'] = 'delivery-unconfirmed'
        save(state)
        print('Discord delivery uncertain; automatic duplicate suppressed', flush=True)


def main():
    config = json.loads(CONFIG.read_text())
    if config.get('guildId') != '1188913226990235800':
        raise RuntimeError('Unexpected Discord guild')
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    print('AutoMod Discord news observer ready', flush=True)
    while True:
        try:
            tick(config, state)
        except Exception as error:
            print('Observer read failure:', type(error).__name__, flush=True)
        time.sleep(20)


if __name__ == '__main__':
    main()
