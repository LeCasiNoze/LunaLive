from pathlib import Path
import json
import os
import shutil
import subprocess
import time
import grp

source = Path('/home/ubuntu/multichat-stage')
root = Path('/opt/automod/scripts')
active = subprocess.run(['systemctl', 'is-active', 'manual-rumble-relay.service'], capture_output=True).returncode == 0
if active:
    raise SystemExit('Manual video relay active; installation refused to avoid interrupting OBS')
config_dir = Path('/etc/lunalive-multistream')
config_dir.mkdir(mode=0o750, exist_ok=True)
os.chown(config_dir, 0, grp.getgrnam('automod').gr_gid)
config_dir.chmod(0o750)
config = config_dir / 'destinations.json'
legacy_config = Path('/etc/automod/multistream.json')
if not config.exists() and legacy_config.exists():
    shutil.copy2(legacy_config, config)
    config.chmod(0o640)
    os.chown(config, 0, grp.getgrnam('automod').gr_gid)
existing = root / 'manual-relay.py'
before = existing.read_text()
if 'multistream_fanout.py' not in before:
    if "run_guarded('manual',command)" not in before or 'rtmp://127.0.0.1:1936/manual/live' not in before:
        raise SystemExit('Unexpected current publisher; inspect before installing')
    shutil.copy2(existing, root / ('manual-relay.before-multistream-' + str(int(time.time())) + '.py'))
    existing.write_text("from publication_guard import run_guarded\ncommand=['/usr/bin/python3','/opt/automod/scripts/multistream_fanout.py']\nraise SystemExit(run_guarded('manual',command))\n")
shutil.copy2(source / 'multistream_fanout.py', root / 'multistream_fanout.py')
shutil.copy2(source / 'multistream_admin.py', '/usr/local/sbin/lunalive-multistream-admin')
os.chmod('/usr/local/sbin/lunalive-multistream-admin', 0o755)
shutil.copy2(source / 'lunalive-multistream-admin.service', '/etc/systemd/system/lunalive-multistream-admin.service')
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','lunalive-multistream-admin.service'],check=True)
print(json.dumps({'videoPrepared':True,'manualOwnerGuardPreserved':True,'reencoding':False,'publicStreamStarted':False}))
