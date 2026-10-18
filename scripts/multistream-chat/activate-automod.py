"""Transport-only publisher restart with rollback; never start/stop the game engine."""
from pathlib import Path
import json
import shutil
import subprocess
import time
import urllib.request

TARGET=Path('/opt/automod/deploy/automod-scene-publisher.mjs')
ORIGINAL=Path('/home/ubuntu/multichat-stage/scene.before.mjs')
OVERRIDE=Path('/etc/systemd/system/automod-rumble-publish.service.d/zz-lunalive-multistream-maintenance.conf')
STATUS=Path('/opt/automod/.runtime/publication/multistream-status.json')


def controller_phase():
    with urllib.request.urlopen('http://127.0.0.1:4317/api/status',timeout=4) as response:
        return json.load(response).get('phase')


def service(action):
    subprocess.run(['systemctl',action,'automod-rumble-publish.service'],check=True,timeout=35,capture_output=True)


def transport_ready(runtime,started):
    outputs=runtime.get('outputs',{})
    return runtime.get('mode')=='automod' and (runtime.get('lastPacketAt') or 0)>started and all(outputs.get(name,{}).get('bytesCopied',0)>100000 for name in ('rumble','kick','twitch'))


if __name__=='__main__':
    if OVERRIDE.exists() or not ORIGINAL.exists() or 'LUNALIVE_MULTISTREAM_ADAPTER' not in TARGET.read_text():
        raise SystemExit('Unexpected maintenance state; no restart performed')
    if controller_phase()!='running' or json.loads((STATUS.parent/'owner.json').read_text()).get('owner')!='automod':
        raise SystemExit('Active Automod owner required; no gameplay operation permitted')
    started=time.time()
    outcome={'activated':False,'gameplayChanged':False}
    OVERRIDE.write_text('[Service]\n# Transport maintenance only: preserve engine and music.\nExecStopPost=\n')
    try:
        subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True)
        service('restart')
        deadline=time.time()+50
        while time.time()<deadline:
            try:
                runtime=json.loads(STATUS.read_text())
                outputs=runtime.get('outputs',{})
                if transport_ready(runtime,started):
                    if controller_phase()!='running':
                        raise RuntimeError('controller_not_running')
                    outcome.update(activated=True,seconds=round(time.time()-started,1),outputs={k:{'state':v['state'],'bytesCopied':v['bytesCopied']} for k,v in outputs.items()})
                    break
            except (OSError,ValueError):
                pass
            time.sleep(1)
        if not outcome['activated']:
            raise RuntimeError('multistream_not_ready')
    except Exception as error:
        shutil.copyfile(ORIGINAL,TARGET)
        service('restart')
        outcome.update(rolledBack=True,error='transport_validation_failed',kind=type(error).__name__)
    finally:
        OVERRIDE.unlink(missing_ok=True)
        subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True)
    print(json.dumps(outcome))
    raise SystemExit(0 if outcome['activated'] else 1)
