"""One bounded, restart-safe replay delivery pass. Never runs the game or edits clips."""
import argparse,fcntl,json,os,re,shutil,subprocess,sys,time
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urljoin,urlparse
import requests
from youtube_delivery import deliver,write_private

ROOT=Path('/opt/lunaclip');DATA=ROOT/'data/youtube-replays'
CREDENTIALS=ROOT/'data/youtube-lecasinoze-credentials.json'
AUTO=re.compile(r'auto\s*[-_ ]?(?:mod(?:e)?|hunt)|bonus\s*[-_ ]?hunt\s*bot|\bautomatique\b',re.I)

def now():return datetime.now(timezone.utc).isoformat()
def epoch(value):return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def eligible(row,at=None):
    at=time.time() if at is None else at
    if str(row.get('slug','')).lower()!='lecasinoze':return False,'wrong_streamer'
    if not row.get('title') or AUTO.search(row['title']):return False,'automod_or_unknown_title'
    if not row.get('ended_at'):return False,'not_ended'
    if at-epoch(row['ended_at'])<600:return False,'archive_settling'
    if row.get('is_live') and str(row.get('live_id','')).lstrip('v')==row['video_id'].lstrip('v'):return False,'still_live'
    if float(row.get('duration_sec') or 0)<=3600:return False,'under_one_hour'
    if row.get('yt_video_id'):return False,'already_delivered_in_database'
    return True,'eligible'

def allowed(url):
    u=urlparse(url);host=u.hostname or ''
    return u.scheme=='https' and not u.username and (host=='rumble.com' or host.endswith('.rumble.com') or host.endswith('.rumble.cloud'))

def resolve_archive(video_id):
    if not re.fullmatch(r'v?[a-z0-9]+',video_id):raise ValueError('invalid_video_id')
    url='https://rumble.com/hls-vod/'+video_id.lstrip('v')+'/playlist.m3u8'
    session=requests.Session();session.headers.update({'User-Agent':'Mozilla/5.0','Referer':'https://rumble.com/'})
    for _ in range(5):
        if not allowed(url):raise ValueError('unexpected_archive_host')
        response=session.get(url,timeout=30,allow_redirects=False)
        if response.status_code!=200:raise ValueError('archive_not_available')
        lines=[s.strip() for s in response.text.splitlines() if s.strip()]
        if not lines or lines[0]!='#EXTM3U':raise ValueError('invalid_archive_playlist')
        variants=[]
        for i,line in enumerate(lines[:-1]):
            if line.startswith('#EXT-X-STREAM-INF:'):
                height=re.search(r'RESOLUTION=\d+x(\d+)',line);bandwidth=re.search(r'BANDWIDTH=(\d+)',line)
                variants.append((int(height[1]) if height else 0,int(bandwidth[1]) if bandwidth else 0,urljoin(url,lines[i+1])))
        if variants:url=max([v for v in variants if v[0]<=1080] or variants)[2];continue
        if '#EXT-X-ENDLIST' not in lines:raise ValueError('archive_not_finalized')
        for line in lines:
            if not line.startswith('#') and not allowed(urljoin(url,line)):raise ValueError('unexpected_segment_host')
        duration=sum(float(s.split(':',1)[1].split(',')[0]) for s in lines if s.startswith('#EXTINF:'))
        if duration<=3600:raise ValueError('actual_archive_under_one_hour')
        return url,duration
    raise ValueError('too_many_archive_playlists')

def command(args,timeout=900):
    result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if result.returncode:raise ValueError('media_command_failed')
    return result.stdout

def probe(p):return json.loads(command(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,start_time,width,height','-of','json',str(p)]))

def detect_start(source):
    # Conservative: require three successive high-confidence detections. If no
    # reliable first slot is found, retain the introduction rather than guess.
    import cv2
    from ultralytics import YOLO
    model=YOLO(str(ROOT/'worker/models/stage4/best.pt'));cap=cv2.VideoCapture(str(source));run=[]
    try:
        for t in range(0,901,10):
            cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,frame=cap.read()
            if not ok:break
            boxes=model.predict(frame,verbose=False,conf=.85,imgsz=640)[0].boxes
            found=any(float(b.conf[0])>=.85 and float((b.xyxyn[0][2]-b.xyxyn[0][0])*(b.xyxyn[0][3]-b.xyxyn[0][1]))>.12 for b in boxes)
            if found:run.append(t)
            else:run=[]
            if len(run)>=3:return max(0,run[0]-10)
        return 0
    finally:cap.release()

def prepare(row,folder,state):
    # The first replay was explicitly reviewed by Lucas. Reuse that exact file.
    if str(row['id'])=='4404':
        reviewed=ROOT/'data/outputs/vod-4404-replay-v1.mp4'
        if reviewed.exists():return reviewed,{'start':416.4025,'reviewedByUser':True,'duration':float(probe(reviewed)['format']['duration'])}
    source=folder/'source.mp4';output=folder/'replay.mp4'
    if output.exists() and (folder/'edit-proof.json').exists():return output,json.loads((folder/'edit-proof.json').read_text())
    if shutil.disk_usage(DATA).free<30*1024**3:raise ValueError('insufficient_disk_reserve')
    url,expected=resolve_archive(row['video_id'])
    if not source.exists():
        partial=folder/'source.partial.mp4'
        command(['ffmpeg','-v','error','-nostdin','-y','-threads','1','-rw_timeout','30000000',
            '-allowed_extensions','ALL','-allowed_segment_extensions','ALL','-extension_picky','0',
            '-user_agent','Mozilla/5.0','-headers','Referer: https://rumble.com/\r\nOrigin: https://rumble.com\r\n',
            '-i',url,'-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart',str(partial)],5400)
        if abs(float(probe(partial)['format']['duration'])-expected)>6:raise ValueError('incomplete_archive')
        partial.replace(source)
    before=probe(source);duration=float(before['format']['duration'])
    if duration<=3600:raise ValueError('actual_archive_under_one_hour')
    requested=detect_start(source)
    start=0
    if requested>0:
        frames=json.loads(command(['ffprobe','-v','error','-skip_frame','nokey','-select_streams','v:0','-read_intervals',f'{max(0,requested-12)}%+15','-show_entries','frame=pts_time','-of','json',str(source)]))['frames']
        candidates=[float(f['pts_time']) for f in frames if float(f['pts_time'])<=requested]
        if candidates:start=max(candidates)
    partial=folder/'replay.partial.mp4'
    command(['ffmpeg','-v','error','-nostdin','-y','-threads','1','-ss',str(start),'-i',str(source),'-map','0:v:0','-map','0:a:0?',
        '-c','copy','-avoid_negative_ts','make_zero','-movflags','+faststart',str(partial)],1800)
    after=probe(partial);streams={s['codec_type']:s for s in after['streams']};out_duration=float(after['format']['duration'])
    if 'audio' not in streams:raise ValueError('replay_audio_missing')
    if abs(float(streams['video']['start_time'])-float(streams['audio']['start_time']))>.25:raise ValueError('replay_start_sync_failed')
    if abs(out_duration-(duration-start))>6:raise ValueError('replay_duration_failed')
    for t in (0,out_duration/2,max(0,out_duration-10)):
        command(['ffmpeg','-v','error','-threads','2','-ss',str(t),'-i',str(partial),'-t','5','-map','0:v:0','-map','0:a:0','-f','null','-'],90)
    partial.replace(output);proof={'start':start,'duration':out_duration,'sourceDuration':duration,'videoReencoded':False,'audioReencoded':False,'sampledDecodePassed':True}
    write_private(folder/'edit-proof.json',proof);return output,proof

def metadata(row):
    title=re.sub(r'https?://\S+|!\w+','',row['title']);title=re.sub(r'\s+',' ',title).strip(' -')
    date=datetime.fromisoformat(row['started_at'].replace('Z','+00:00')).astimezone(__import__('zoneinfo').ZoneInfo('Europe/Paris')).strftime('%d/%m/%Y')
    prefix=f"VOD #{row['replay_number']} — " if row.get('replay_number') else ''
    return {'title':f'{prefix}{title[:57]} | Rediff {date} · LeCasiNoze'[:100],
        'description':f'Rediffusion du live de LeCasiNoze du {date}.\n\nDiscord : https://discord.gg/6kq3PFu8B5\nLunaLive : https://lunalive.win/s/lecasinoze\nRumble : https://rumble.com/user/LeCasiNoze\nKick : https://kick.com/lecasinoze\nTwitch : https://www.twitch.tv/lecasinoze\nSite : https://lecasinoze.onrender.com/\n\n18+ · Jouer comporte des risques.\n#LeCasiNoze #Rediffusion #StreamFR',
        'tags':['LeCasiNoze','Rediffusion','Stream FR']}

def notify_discord(state):
    """Outbox only. A Discord/database failure never changes the upload state."""
    video=state.get('youtube',{});event=video.get('announcement')
    if state.get('discordOutboxRecorded') or state.get('phase')!='published' or video.get('privacy')!='public' or video.get('processingStatus')!='succeeded' or not event:return
    try:
        result=subprocess.run(['node',str(ROOT/'node_modules/tsx/dist/cli.mjs'),str(ROOT/'youtube-outbox.mts')],
            cwd=ROOT,input=json.dumps(event).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
        if result.returncode==0 and json.loads(result.stdout).get('ok'):
            state['discordOutboxRecorded']=True;state.pop('discordNotificationError',None)
        else:state['discordNotificationError']='outbox_unavailable'
    except Exception:state['discordNotificationError']='outbox_unavailable'

def tick(dry=False):
    rows=json.loads((DATA/'candidates.json').read_text());report=[];worked=False
    for row in rows:
        ok,reason=eligible(row);folder=DATA/str(row['id']);statefile=folder/'state.json'
        state=json.loads(statefile.read_text()) if statefile.exists() else {}
        if state.get('phase')=='published':
            checked=state.get('lastCheckedAt',state.get('updatedAt',now()))
            if not dry and (state.get('youtube',{}).get('processingStatus')!='succeeded' or time.time()-epoch(checked)>3600):
                try:
                    api_result=deliver({'action':'inspect','credentials':str(CREDENTIALS),'ids':[state['youtube']['videoId']]})
                    video=next((v for v in api_result['videos'] if v['id']==state['youtube']['videoId']),None)
                    if video is None:state.update(phase='blocked',error='published_video_not_found')
                    else:
                        state['youtube'].update(processingStatus=video['processingStatus'],statistics=video['statistics'],privacy=video['status'].get('privacyStatus'))
                        if video.get('announcement'):state['youtube']['announcement']=video['announcement']
                        if video['processingStatus'] in ('failed','terminated') or video['status'].get('privacyStatus')!='public':state.update(phase='blocked',error='published_video_unavailable')
                    state['lastCheckedAt']=now();write_private(statefile,state)
                except Exception:state['inspectionError']='youtube_inspection_unavailable'
            if not dry:
                notify_discord(state);write_private(statefile,state)
            # Only our reproducible cache; never touch originals in /vod-review or /outputs.
            if not dry and state.get('phase')=='published' and state.get('youtube',{}).get('processingStatus')=='succeeded' and time.time()-epoch(state['confirmedPublishedAt'])>172800:
                for name in ('source.mp4','replay.mp4'):
                    cached=folder/name
                    if cached.parent.resolve()==folder.resolve() and cached.exists():cached.unlink()
            report.append(state);continue
        item={'vodId':str(row['id']),'title':row['title'],'eligible':ok,'reason':reason}
        if not ok or dry or worked:report.append(item);continue
        if state.get('phase')=='blocked':report.append(state);continue
        if state.get('retryAfter',0)>time.time():report.append(state);continue
        folder.mkdir(mode=0o700,exist_ok=True);worked=True
        try:
            state={**item,'phase':'preparing','updatedAt':now()};write_private(statefile,state)
            source,proof=prepare(row,folder,state);requestfile=folder/'upload.request.json'
            # Allocate once in the existing VOD record, then retain real source
            # frame provenance beside the cover across retries/restarts.
            assigned=json.loads(command(['node',str(ROOT/'replays/assign-number.mjs'),str(row['id'])],45))
            row['replay_number']=assigned['number']
            from replay_thumbnail import build_thumbnail
            thumbnail=build_thumbnail(source,folder,row,assigned['number'])
            if requestfile.exists():request=json.loads(requestfile.read_text())
            else:
                request={'source':str(source),'credentials':str(CREDENTIALS),'receipt':str(folder/'upload.receipt.json'),
                    'kind':'vod','sourceTag':'lc-rediff-rumble-'+row['video_id'],**metadata(row)}
                write_private(requestfile,request)
            request.update(thumbnail=str(thumbnail),requireThumbnail=True);write_private(requestfile,request)
            state.update(phase='uploading',edit=proof);write_private(statefile,state)
            result=deliver(request);state.update(phase=result['state'],youtube=result,updatedAt=now(),error='youtube_publication_not_confirmed' if result['state']=='blocked' else None)
            # A published source can later be re-downloaded; receipts remain.
            if result['state']=='published':state['confirmedPublishedAt']=now()
        except Exception as error:
            code=str(error) if isinstance(error,ValueError) and re.fullmatch('[a-z0-9_]+',str(error)) else type(error).__name__
            state.update(phase='blocked' if 'uncertain' in code or 'wrong_youtube' in code else 'retry',error=code,updatedAt=now(),retryAfter=time.time()+900)
        notify_discord(state);write_private(statefile,state);report.append(state)
    snapshot={'updatedAt':now(),'account':'lecasinoze','policy':'ended_personal_over_one_hour_as_soon_as_ready','dryRun':dry,'items':report}
    write_private(DATA/('dry-run-status.json' if dry else 'status.json'),snapshot)
    # Public through the existing authenticated dashboard, without credentials or upload URIs.
    if not dry:write_private(ROOT/'data/outputs/youtube-replays-status.json',snapshot)
    print(json.dumps({'event':'replay_pass','dryRun':dry,'items':[{'vodId':r['vodId'],'phase':r.get('phase'),'reason':r.get('reason'),'error':r.get('error'),'url':r.get('youtube',{}).get('url')} for r in report]}))

if __name__=='__main__':
    os.umask(0o077);DATA.mkdir(parents=True,exist_ok=True,mode=0o700)
    parser=argparse.ArgumentParser();parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    with (DATA/'worker.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:sys.exit(0)
        tick(args.dry_run)
