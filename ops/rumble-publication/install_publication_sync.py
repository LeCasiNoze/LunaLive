"""Run as root only after the matching LunaLive API deployment is live."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import time

source = Path(__file__).resolve().parent
scripts = Path('/opt/automod/scripts')
control = scripts / 'publication_control.py'
original = control.read_text()
marker = 'def request_mode_sync():'
updated = original
if marker not in original:
    anchor = "def active(unit):"
    assert original.count(anchor) == 1
    updated = original.replace(anchor, '''def request_mode_sync():
    # Do not delay OBS on an API outage. The timer retries, and the existing
    # publication owner remains authoritative until an explicit handback.
    subprocess.run(['systemctl','start','--no-block','publication-mode-sync.service'],
                   check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def active(unit):''')
    anchor = "            ensure_ready()\n            print(json.dumps(status()));return"
    assert updated.count(anchor) == 1
    updated = updated.replace(anchor,"            ensure_ready()\n            request_mode_sync()\n            print(json.dumps(status()));return")
    anchor = "        ensure_ready()\n    elif args.action=='finish-manual':"
    assert updated.count(anchor) == 1
    updated = updated.replace(anchor,"        ensure_ready()\n        request_mode_sync()\n    elif args.action=='finish-manual':")
    anchor = "        set_owner('automod',args.revision)"
    assert updated.count(anchor) == 1
    updated = updated.replace(anchor,anchor+"\n        request_mode_sync()")
compile(updated, str(control), 'exec')
if '--check' in sys.argv:
    print('Publication hooks verified; no service or file changed.')
    raise SystemExit(0)
backup = Path('/opt/automod/.runtime/publication/backups') / ('mode-sync-' + time.strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True, mode=0o700)
for name in ('publication_mode_sync.py','publication_control.py'):
    existing=scripts/name
    if existing.exists():shutil.copy2(existing,backup/name)
for name in ('publication-mode-sync.service','publication-mode-sync.timer'):
    existing=Path('/etc/systemd/system')/name
    if existing.exists():shutil.copy2(existing,backup/name)
    shutil.copyfile(source/name,existing);existing.chmod(0o644)
shutil.copyfile(source/'publication_mode_sync.py',scripts/'publication_mode_sync.py')
(scripts/'publication_mode_sync.py').chmod(0o644)
if updated != original:
    temporary=control.with_suffix('.mode-sync-new')
    temporary.write_text(updated);temporary.chmod(control.stat().st_mode & 0o777)
    os.chown(temporary,control.stat().st_uid,control.stat().st_gid)
    os.replace(temporary,control)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','publication-mode-sync.timer'],check=True)
subprocess.run(['systemctl','start','publication-mode-sync.service'],check=True)
print('Publication synchronization installed; no video publisher or game service restarted.')
print('Backup: '+str(backup))
