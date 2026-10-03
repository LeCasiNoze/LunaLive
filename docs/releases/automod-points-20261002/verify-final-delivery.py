import hashlib,json,urllib.request,subprocess
from pathlib import Path
worker=json.loads(Path('/tmp/worker-current-manifest.json').read_text(encoding='utf-8-sig'))
overlay=json.loads(Path('/tmp/overlay-release-manifest.json').read_text(encoding='utf-8-sig'))
for root,m in [(Path('/opt/automod/src'),worker),(Path('/opt/automod/overlay'),overlay)]:
 for f in m['files']:assert hashlib.sha256((root/f['path']).read_bytes()).hexdigest()==f['sha256'],f['path']
backup=Path('/opt/automod/.runtime/backups/points-20261002')
assert hashlib.sha256((backup/'stable-source-before-shop.tar.gz').read_bytes()).hexdigest()==worker['stableBackupSha256']
assert hashlib.sha256((backup/'overlay-before-rule-cycle.tar.gz').read_bytes()).hexdigest()==overlay['backupSha256']
for name in ['browser-slot-executor.ts','pragmatic-free-spin-start.ts']:assert (backup/('before-intro-proof-'+name)).is_file()
with urllib.request.urlopen('http://127.0.0.1:4317/api/status') as r:s=json.load(r)
with urllib.request.urlopen('https://lunalive-api.onrender.com/api/automod-shop') as r:public=json.load(r)
assert s['phase']=='idle' and not s['publisherActive'] and not public['enabled']
assert subprocess.run(['systemctl','is-active','--quiet','automod-rumble-publish.service']).returncode!=0
for u in ['automod-web.service','automod-fsb-control.service','automod-browser-login.service']:assert subprocess.run(['systemctl','is-active','--quiet',u]).returncode==0,u
print(json.dumps({'workerVersion':worker['version'],'workerHashes':len(worker['files']),'overlayHashes':len(overlay['files']),'backupsVerified':True,'phase':s['phase'],'automodEnabled':public['enabled'],'publisherActive':s['publisherActive'],'dashboardReady':True}))
