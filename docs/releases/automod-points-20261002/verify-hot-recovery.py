import json,hashlib
from pathlib import Path
buy=Path('/opt/automod/.runtime/shop-purchase-validation/hot-fiesta-buy-1790968914926.jsonl')
r=Path('/opt/automod/.runtime/shop-purchase-validation/hot-fiesta-recovery-1790971056485.jsonl')
b=[json.loads(l)['data'] for l in buy.read_text().splitlines()]
d=[json.loads(l)['data'] for l in r.read_text().splitlines()]
assert sum(x['kind']=='purchase-intent' for x in b)==1
assert sum(x['kind']=='purchase-confirmed' for x in b)==1
assert not any(x['kind'].startswith('purchase-') for x in d)
counts=[int(x['observation']['bonusProgress'].split(':')[0]) for x in d if x['kind']=='observation' and x['observation'].get('bonusProgress')]
events=[e for x in d if x['kind']=='observation' for e in x['observation']['events']]
ended=[e for e in events if e['type']=='bonus-ended']
assert 10 in counts and any(0<n<10 for n in counts) and 0 in counts
assert ended
final=d[-1];assert final['kind']=='test-complete' and final['configuration']['baseStakeCents']==25
m=json.loads(Path('/tmp/worker-current-manifest.json').read_text(encoding='utf-8-sig'))
for f in m['files']:assert hashlib.sha256((Path('/opt/automod/src')/f['path']).read_bytes()).hexdigest()==f['sha256'],f['path']
print(json.dumps({'purchaseIntentCount':1,'newPurchasesInRecovery':0,'counterSamples':sorted(set(counts),reverse=True),'bonusEnded':ended,'finalConfiguration':final['configuration'],'workerVersion':m['version'],'allFilesMatch':len(m['files'])}))
