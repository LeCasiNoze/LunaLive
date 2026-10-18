"""Install an isolated service; never restart LunaClip or the existing video relay."""
from pathlib import Path
import json
import os
import pwd
import shlex
import shutil
import subprocess
import time

ROOT = Path('/opt/lunalive-multichat')
SOURCE = Path('/home/ubuntu/multichat-stage')
ALLOWED = {'.mjs', '.html', '.js', '.json', '.service'}


def env_file(path):
    values = {}
    for line in Path(path).read_text().splitlines():
        if not line or line.lstrip().startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        value = value.strip()
        if value.startswith(('"', "'")):
            value = shlex.split(value)[0]
        values[key.strip()] = value
    return values


if os.geteuid() != 0:
    raise SystemExit('Run as root')
owner = pwd.getpwnam('lunalive-worker')
ROOT.mkdir(mode=0o755, exist_ok=True)
for source in SOURCE.iterdir():
    if source.is_file() and source.suffix in ALLOWED and not source.name.endswith('.test.mjs'):
        target = ROOT / source.name
        if target.exists() and target.read_bytes() != source.read_bytes():
            backup = ROOT / 'backups' / str(int(time.time()))
            backup.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup / target.name)
        shutil.copy2(source, target)
        os.chmod(target, 0o644)
data = ROOT / 'data'
data.mkdir(mode=0o700, exist_ok=True)
os.chown(data, owner.pw_uid, owner.pw_gid)
worker = env_file('/opt/lunalive-worker/.env')
clip = env_file('/opt/lunaclip/.env')
values = {
    'DATABASE_URL': worker.get('DATABASE_URL') or clip.get('DATABASE_URL'),
    'BOT_INTERNAL_KEY': worker.get('BOT_INTERNAL_KEY') or worker.get('INTERNAL_BOT_KEY') or clip.get('BOT_INTERNAL_KEY') or clip.get('INTERNAL_BOT_KEY') or clip.get('LUNALIVE_BOT_KEY'),
    'BOT_API_BASE': worker.get('BOT_API_BASE') or clip.get('BOT_API_BASE') or clip.get('LUNALIVE_API_BASE_URL') or 'https://lunalive-api.onrender.com',
    'MULTICHAT_DASHBOARD_SECRET': clip.get('LOCAL_TOKEN'),
    'MULTICHAT_ORIGIN': 'https://vps-92b153fc.vps.ovh.net',
}
if not all(values.values()):
    raise SystemExit('Required existing runtime settings missing; no secrets printed')
if any('\n' in value or '\r' in value for value in values.values()):
    raise SystemExit('Unexpected multiline runtime setting')
env_path = Path('/etc/lunalive-multichat.env')
env_text = ''.join(key + '="' + value.replace('\\', '\\\\').replace('"', '\\"') + '"\n' for key, value in values.items())
env_path.write_text(env_text)
env_path.chmod(0o600)
# The dependency already used by the resident Rumble worker is reused read-only.
modules = ROOT / 'node_modules'
if not modules.exists():
    modules.symlink_to('/opt/lunalive-worker/node_modules', target_is_directory=True)
subprocess.run(['/usr/bin/node', '--check', str(ROOT / 'server.mjs')], check=True)
shutil.copy2(ROOT / 'lunalive-multichat.service', '/etc/systemd/system/lunalive-multichat.service')
caddy = Path('/etc/caddy/Caddyfile')
text = caddy.read_text()
route = '    handle /multichat* {\n        reverse_proxy 127.0.0.1:3140\n    }\n\n'
if 'handle /multichat*' not in text:
    backup = Path('/etc/caddy/Caddyfile.before-multichat-' + str(int(time.time())))
    shutil.copy2(caddy, backup)
    updated = text.replace('    handle {\n', route + '    handle {\n', 1)
    if updated == text:
        raise SystemExit('Caddy insertion point not found')
    caddy.write_text(updated)
    checked = subprocess.run(['caddy', 'validate', '--config', str(caddy)], capture_output=True)
    if checked.returncode:
        shutil.copy2(backup, caddy)
        raise SystemExit('Caddy validation failed; original configuration restored')
    subprocess.run(['systemctl', 'reload', 'caddy'], check=True)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'lunalive-multichat.service'], check=True)
print(json.dumps({'installed': True, 'publicPath': '/multichat/', 'listen': '127.0.0.1:3140', 'relayEnabledByDefault': False, 'existingServicesRestarted': False}))
