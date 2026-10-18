#!/usr/bin/python3
"""Narrow root helper: configure known stream destinations, return redacted status."""
from pathlib import Path
from urllib.parse import urlparse
import grp
import json
import os
import re
import socket
import pwd
import struct
import contextlib
import fcntl
import time
import subprocess
import sys

PATH = Path('/etc/lunalive-multistream/destinations.json')
STATUS = Path('/opt/automod/.runtime/publication/multistream-status.json')


def validate_target(platform, url, key):
    if platform not in ('kick', 'twitch') or not isinstance(url, str) or not isinstance(key, str):
        raise ValueError('invalid_destination')
    parsed = urlparse(url)
    if parsed.scheme not in ('rtmp', 'rtmps') or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('invalid_ingest_url')
    host = parsed.hostname or ''
    twitch = platform == 'twitch' and (host == 'live.twitch.tv' or host.endswith('.contribute.live-video.net') or host.endswith('.contribute.video.net'))
    kick = platform == 'kick' and host.endswith('.global-contribute.live-video.net')
    if not (twitch or kick) or parsed.path.rstrip('/') != '/app' or parsed.port not in (None, 443, 1935):
        raise ValueError('ingest_host_not_allowed')
    if not re.fullmatch(r'[A-Za-z0-9_.-]{12,250}', key):
        raise ValueError('invalid_stream_key')
    return {'url': url.rstrip('/'), 'key': key, 'enabled': False}


def load():
    try:
        return json.loads(PATH.read_text())
    except FileNotFoundError:
        return {}


def save(value):
    temporary = PATH.with_suffix('.tmp')
    temporary.write_text(json.dumps(value))
    temporary.chmod(0o640)
    os.chown(temporary, 0, grp.getgrnam('automod').gr_gid)
    temporary.replace(PATH)


def select_manual(root=Path('/opt/automod/.runtime/publication')):
    # Same lock ordering and atomic owner document as publication_guard.py.
    root = Path(root)
    with contextlib.ExitStack() as stack:
        for name in ('owner.lock', 'output.lock'):
            handle = stack.enter_context((root / name).open('a'))
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        owner = json.loads((root / 'owner.json').read_text())
        if owner.get('owner') not in ('automod', 'manual') or not isinstance(owner.get('revision'), int):
            raise ValueError('invalid_publication_owner')
        if owner['owner'] == 'manual':
            return
        owner.update(owner='manual', revision=owner['revision']+1, changedAt=time.time())
        path = root / 'owner.json'
        temporary = path.with_suffix('.tmp')
        with temporary.open('w') as output:
            temporary.chmod(0o600)
            os.chown(temporary, path.stat().st_uid, path.stat().st_gid)
            json.dump(owner, output)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)


def execute(action, body=None):
    if action not in ('status', 'configure', 'control', 'start', 'stop'):
        raise ValueError('action_not_allowed')
    if action in ('configure', 'control'):
        if not isinstance(body, dict):
            raise ValueError('invalid_body')
        platform = body.get('platform')
        value = load()
        if action == 'configure':
            previous = value.get(platform, {})
            target = validate_target(platform, body.get('url'), body.get('key'))
            target['enabled'] = previous.get('enabled', False)
            value[platform] = target
        else:
            if platform not in ('kick', 'twitch', 'rumble') or not isinstance(body.get('enabled'), bool):
                raise ValueError('invalid_control')
            if platform != 'rumble' and not value.get(platform, {}).get('key'):
                raise ValueError('destination_not_configured')
            value.setdefault(platform, {})['enabled'] = body['enabled']
        save(value)
    elif action in ('start', 'stop'):
        if action == 'start':
            # The existing OBS gate/publication_control owns mode changes and
            # Rumble's ended-live checks. This panel must not bypass them.
            owner=json.loads(Path('/opt/automod/.runtime/publication/owner.json').read_text()).get('owner')
            if owner!='manual':
                raise BlockingIOError(11,'canonical_manual_preparation_required')
        subprocess.run(['systemctl', action, 'manual-rumble-relay.service'], check=True, timeout=20, capture_output=True)
    value = load()
    targets = {name: {'configured': bool(item.get('key')), 'enabled': bool(item.get('enabled')), 'url': item.get('url')}
               for name, item in value.items() if name in ('kick', 'twitch')}
    targets['rumble'] = {'configured': True, 'enabled': value.get('rumble', {}).get('enabled', True)}
    active = subprocess.run(['systemctl', 'is-active', 'manual-rumble-relay.service'], capture_output=True, text=True).stdout.strip()
    try:
        runtime = json.loads(STATUS.read_text())
    except (OSError, ValueError):
        runtime = None
    try:
        owner = json.loads(Path('/opt/automod/.runtime/publication/owner.json').read_text()).get('owner')
    except (OSError, ValueError):
        owner = None
    automatic = subprocess.run(['systemctl','is-active','automod-rumble-publish.service'],capture_output=True,text=True).stdout.strip()
    return {'ok': True, 'targets': targets, 'service': active, 'automodService':automatic,'publicationOwner': owner, 'runtime': runtime}


def serve():
    path = Path('/run/lunalive-multistream/admin.sock')
    path.unlink(missing_ok=True)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(str(path))
    os.chown(path, 0, grp.getgrnam('lunalive-worker').gr_gid)
    path.chmod(0o660)
    listener.listen(8)
    allowed_uid = pwd.getpwnam('lunalive-worker').pw_uid
    while True:
        connection, _ = listener.accept()
        with connection:
            connection.settimeout(5)
            try:
                _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                if uid not in (0, allowed_uid):
                    raise ValueError('peer_refused')
                raw = b''
                while b'\n' not in raw and len(raw) <= 8000:
                    chunk = connection.recv(min(4096, 8001-len(raw)))
                    if not chunk:
                        break
                    raw += chunk
                if len(raw) > 8000:
                    raise ValueError('body_too_large')
                body = json.loads(raw)
                result = execute(body.get('action'), body)
            except Exception as error:
                print(json.dumps({'event':'stream_control_failed','action':body.get('action') if isinstance(locals().get('body'),dict) else None,'kind':type(error).__name__,'errno':getattr(error,'errno',None),'exitCode':getattr(error,'returncode',None)}),flush=True)
                result = {'ok': False, 'error': 'publication_busy' if isinstance(error, BlockingIOError) else 'stream_configuration_failed'}
            try:
                connection.sendall(json.dumps(result).encode())
            except OSError:
                pass


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2:
        raise ValueError('helper_invocation_refused')
    if sys.argv[1] == 'serve':
        return serve()
    body = json.loads(sys.stdin.read(8001)) if sys.argv[1] in ('configure', 'control') else None
    print(json.dumps(execute(sys.argv[1], body)))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'ok': False, 'error': 'stream_configuration_failed'}))
        raise SystemExit(1)
