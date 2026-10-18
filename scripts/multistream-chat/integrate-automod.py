"""Narrow, reversible adapter for the existing scene publisher; no gameplay changes."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import time
import os


def adapt(text):
    # Kick explicitly requires 30/60 FPS. Keep one encoder for all platforms.
    text=text.replace("'-framerate','24'","'-framerate','30'").replace('fps=24','fps=30')
    text=text.replace("'-r','24','-g','48','-keyint_min','48'","'-r','30','-g','60','-keyint_min','60'")
    text=text.replace('sample.frame/24','sample.frame/30').replace('probeSeconds*24','probeSeconds*30').replace('captureFps:24','captureFps:30')
    if 'LUNALIVE_MULTISTREAM_ADAPTER' in text:
        return text
    replacements = [
        ("const muxDestination=recordOutput?", "const legacyMuxDestination=recordOutput?"),
        ("if(probe)await mkdir(root", "// LUNALIVE_MULTISTREAM_ADAPTER: one encode, independent remux destinations.\nconst muxDestination=probe?legacyMuxDestination:`[f=mpegts]pipe:3${recordOutput?`|[f=matroska:onfail=ignore]${recordingPath}`:''}`;\nif(probe)await mkdir(root"),
        ('let browser,mux,video,deadline', 'let browser,mux,video,fanout,deadline'),
        ("  video?.kill('SIGINT');", "  video?.kill('SIGINT');\n  fanout?.kill('SIGTERM');"),
        ("video?.kill('SIGKILL');", "video?.kill('SIGKILL');fanout?.kill('SIGKILL');"),
        ('Promise.all([mux,video]', 'Promise.all([mux,video,fanout]'),
        ("  mux=spawn('/usr/bin/ffmpeg',[", "  if(!probe){fanout=spawn('/usr/bin/python3',['/opt/automod/scripts/multistream_fanout.py','--stdin'],{env,stdio:['pipe','ignore','pipe']});monitor(fanout,'fanout');fanout.stdin.on('error',()=>{});}\n  mux=spawn('/usr/bin/ffmpeg',["),
        ("],{env,stdio:['ignore','pipe','pipe']});\n  monitor(mux,'mux');", "],{env,stdio:['ignore','pipe','pipe','pipe']});\n  if(!probe)mux.stdio[3].pipe(fanout.stdin);\n  monitor(mux,'mux');"),
    ]
    for before, after in replacements:
        if text.count(before) != 1:
            raise ValueError('publisher_adapter_anchor_changed')
        text = text.replace(before, after, 1)
    return text


if __name__ == '__main__':
    target = Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/automod/deploy/automod-scene-publisher.mjs')
    before=target.read_text()
    if len(sys.argv)>2 and hashlib.sha256(before.encode()).hexdigest()!=sys.argv[2]:
        raise SystemExit('Publisher changed since inspection; no file modified')
    after=adapt(before)
    temporary=target.with_suffix('.multistream-check.mjs')
    temporary.write_text(after)
    subprocess.run(['/usr/bin/node','--check',str(temporary)],check=True,capture_output=True)
    if after!=before:
        shutil.copy2(target,target.with_name(target.name+'.before-multistream-'+str(int(time.time()))))
        shutil.copystat(target,temporary)
        if os.geteuid()==0:
            os.chown(temporary,target.stat().st_uid,target.stat().st_gid)
        temporary.replace(target)
    else:
        temporary.unlink()
    print(json.dumps({'adapted':True,'sha256':hashlib.sha256(after.encode()).hexdigest(),'encoderRestarted':False,'gameplayChanged':False}))
