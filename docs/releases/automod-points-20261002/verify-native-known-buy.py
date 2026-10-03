"""Read-only assertions specific to the real cached fs_consume test."""
import json
import sys
from pathlib import Path

records = [json.loads(line)['data'] for line in Path(sys.argv[1]).read_text().splitlines() if line.strip()]
intents = [r for r in records if r.get('kind') == 'shop-action' and r.get('path', '').endswith('/intent')]
assert len(intents) == 1
intent_index = records.index(intents[0])
assert all(r.get('roundsPlayed', 0) == 0 for r in records[:intent_index] if r.get('kind') == 'state'), 'Known buy must precede ordinary spins'
final = next(r for r in records if r.get('kind') == 'final-orders')
assert len(final['orders']) == 1
order = final['orders'][0]
assert order['offerId'] == 'fs_consume'
assert order['selectedOffer']['costCents'] == 1000
assert order['result']['gainCents'] == 2257
assert order['result']['rebatePoints'] == 210
assert order['status'] == 'done' and int(order['reservedPoints']) == 0
assert any(r.get('kind') == 'fullchain-complete' and r.get('viewerCallsPreserved') and r.get('ordinarySpinSettled') for r in records)
print(json.dumps({'callId': order['callId'], 'knownOffer': order['offerId'], 'costCents': 1000, 'gainCents': 2257, 'rebatePoints': 210, 'uniqueIntent': True, 'ordinarySpinsAfterOnly': True, 'viewerCallsPreserved': True}))
