"""Mirror publication ownership using the VPS's existing scoped LunaLive credential."""
import importlib.util
import json
from pathlib import Path
import sys

sys.path.insert(0, '/opt/automod/scripts')
from publication_guard import ROOT, _lock, read_owner

ACK = ROOT / 'publication-api-sync.json'


def sync_once():
    with _lock(ROOT, 'owner.lock', False):
        owner = read_owner()
        desired = {'owner': owner['owner'], 'revision': owner['revision']}
        try:
            if json.loads(ACK.read_text()) == desired:
                return False
        except (OSError, ValueError):
            pass
        # Reuse the existing service account; no browser cookie or personal JWT.
        spec = importlib.util.spec_from_file_location('fsb_control_client', '/opt/automod/scripts/automod-fsb-control.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        result = module.LunaLive().api('control/publication', 'POST', desired)
        if result.get('publication_owner') != desired['owner'] or int(result.get('publication_revision', -1)) != desired['revision']:
            raise RuntimeError('publication_ack_mismatch')
        temporary = ACK.with_suffix('.tmp')
        temporary.write_text(json.dumps(desired)); temporary.chmod(0o600); temporary.replace(ACK)
        return True


if __name__ == '__main__':
    try:
        if sync_once(): print('LunaLive publication mode synchronized.')
    except Exception:
        print('Publication synchronization pending retry.', file=sys.stderr)
        raise SystemExit(1)
