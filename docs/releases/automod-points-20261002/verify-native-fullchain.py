"""Read-only proof from actual native-run journal, never inserts orders or wallet data."""
import json
import sys
from pathlib import Path

records = [json.loads(line)['data'] for line in Path(sys.argv[1]).read_text().splitlines() if line.strip()]
final = next(item for item in records if item.get('kind') == 'final-orders')
orders = [order for order in final['orders'] if order['status'] == 'done']
assert len(orders) == 1
order = orders[0]
assert order['rumbleUserId'] == '284177710'
assert order['selectedOffer']['costCents'] <= 2000
baseline = None
paid_after = False
for item in records:
    visit = item.get('shopVisit') or {}
    bonus = item.get('bonus') or {}
    if item.get('kind') == 'state' and visit.get('purchaseConfirmed') and not visit.get('purchaseOrderId') and bonus.get('endedAt') is not None and bonus.get('purchaseOrderId') == order['id']:
        if baseline is None:
            baseline = item['roundsPlayed']
        elif item['roundsPlayed'] > baseline and item['phase'] == 'playing':
            paid_after = True
assert paid_after, 'No later base-game round after confirmed purchased bonus'
intents = [item for item in records if item.get('kind') == 'shop-action' and item.get('path', '').endswith('/intent')]
assert len(intents) == 1, 'Purchase intent must be unique'
assert any(item.get('kind') == 'fullchain-complete' and item.get('viewerCallsPreserved') for item in records)
print(json.dumps({'orderId': order['id'], 'result': order['result'], 'uniqueIntent': True, 'paidRoundAfterPurchase': paid_after, 'postPurchaseBaselineRounds': baseline, 'viewerCallsPreserved': True}))
