"""Durable, resumable YouTube delivery, restricted to LeCasiNoze."""
import argparse, hashlib, json, logging, os, re, time
from pathlib import Path
from datetime import datetime, timezone
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request, AuthorizedSession
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
CHANNEL='UCbBVUwBBf4Mu3yZxe-Xrmyw'
logging.disable(logging.CRITICAL)
def write_private(path,value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value));temp.chmod(0o600);temp.replace(path)
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def announcement_metadata(video):
    """Only official API metadata; no guessed duration, cover or public date."""
    snippet=video.get('snippet',{});details=video.get('contentDetails',{})
    match=re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?',details.get('duration',''))
    duration=sum(float(n or 0)*factor for n,factor in zip(match.groups(),(3600,60,1))) if match else None
    thumbs=snippet.get('thumbnails',{});thumbnail=next((thumbs[k]['url'] for k in ('maxres','standard','high','medium','default') if thumbs.get(k,{}).get('url')),None)
    return {'platform':'youtube','mediaId':video['id'],'account':snippet.get('channelId'),
        'visibility':video.get('status',{}).get('privacyStatus'),'title':snippet.get('title',''),
        'description':snippet.get('description','').split('\n')[0],'url':'https://www.youtube.com/watch?v='+video['id'],
        'thumbnail':thumbnail,'publishedAt':snippet.get('publishedAt'),'durationSeconds':duration,
        'isShort':False,'kind':'vod'}
def checked_api(path):
    if path.stat().st_mode & 0o077:raise ValueError('credential_file_not_private')
    credentials=Credentials.from_authorized_user_file(str(path));credentials.refresh(Request())
    api=build('youtube','v3',credentials=credentials,cache_discovery=False)
    channels=api.channels().list(part='id',mine=True).execute().get('items',[])
    if len(channels)!=1 or channels[0]['id']!=CHANNEL:raise ValueError('wrong_youtube_channel')
    # Access-token refresh is useful but never exposes or replaces the refresh token in logs.
    write_private(path,json.loads(credentials.to_json()))
    return api,AuthorizedSession(credentials)
def reconcile(api,tag):
    rows=api.channels().list(part='contentDetails',mine=True).execute().get('items',[])
    playlist=rows[0]['contentDetails']['relatedPlaylists']['uploads'];ids=[];page=None
    for _ in range(3):
        body=api.playlistItems().list(part='contentDetails',playlistId=playlist,maxResults=50,**({'pageToken':page} if page else {})).execute()
        ids.extend(i['contentDetails']['videoId'] for i in body.get('items',[]));page=body.get('nextPageToken')
        if not page:break
    found=[]
    for offset in range(0,len(ids),50):
        body=api.videos().list(part='snippet',id=','.join(ids[offset:offset+50])).execute()
        found.extend(v['id'] for v in body.get('items',[]) if tag in v.get('snippet',{}).get('tags',[]))
    if len(found)>1:raise ValueError('duplicate_source_requires_review')
    return found[0] if found else None

def set_thumbnail(api,video,path):
    file=Path(path).resolve(strict=True)
    if file.suffix.lower() not in ('.jpg','.jpeg','.png') or not 0<file.stat().st_size<=2*1024**2:
        raise ValueError('thumbnail_file_invalid')
    try:
        response=api.thumbnails().set(videoId=video,media_body=MediaFileUpload(str(file),mimetype='image/png' if file.suffix.lower()=='.png' else 'image/jpeg',resumable=False)).execute(num_retries=3)
    except Exception as error:
        status=getattr(getattr(error,'resp',None),'status',None)
        raise ValueError('youtube_thumbnail_http_'+str(status)) from None
    if not response.get('items'):raise ValueError('youtube_thumbnail_unconfirmed')
    return {'sha256':digest(file),'confirmedAt':datetime.now(timezone.utc).isoformat(),'videoId':video}

def deliver(request):
    api,http=checked_api(Path(request['credentials']))
    if request.get('action')=='set_thumbnail':
        rows=api.videos().list(part='snippet',id=request['videoId']).execute().get('items',[])
        if len(rows)!=1 or rows[0]['snippet']['channelId']!=CHANNEL:raise ValueError('thumbnail_video_channel_mismatch')
        return {'ok':True,'thumbnail':set_thumbnail(api,request['videoId'],request['thumbnail'])}
    if request.get('action')=='inspect':
        ids=request.get('ids',[]);rows=api.videos().list(part='status,statistics,processingDetails,contentDetails,snippet',id=','.join(ids)).execute().get('items',[]) if ids else []
        return {'ok':True,'videos':[{'id':v['id'],'channelId':v.get('snippet',{}).get('channelId'),'status':v.get('status',{}),'statistics':v.get('statistics',{}),'processingStatus':v.get('processingDetails',{}).get('processingStatus'),'contentRating':v.get('contentDetails',{}).get('contentRating',{}),'announcement':announcement_metadata(v)} for v in rows]}
    source=Path(request['source']).resolve(strict=True);receipt=Path(request['receipt']);receipt.parent.mkdir(parents=True,exist_ok=True)
    if request.get('requireThumbnail') and not request.get('thumbnail'):raise ValueError('thumbnail_required_before_upload')
    if request.get('thumbnail'):
        thumbnail=Path(request['thumbnail']).resolve(strict=True)
        if not 0<thumbnail.stat().st_size<=2*1024**2:raise ValueError('thumbnail_file_invalid')
    if request['kind'] not in ('short','vod_preview','vod'):raise ValueError('unknown_delivery_kind')
    tag=request['sourceTag'];hash_value=digest(source);size=source.stat().st_size
    record=json.loads(receipt.read_text()) if receipt.exists() else {'sha256':hash_value,'size':size,'sourceTag':tag,'phase':'new'}
    if record['sha256']!=hash_value or record['sourceTag']!=tag:raise ValueError('upload_source_changed')
    video=record.get('videoId')
    if not video and record.get('phase') in ('uncertain','initializing'):
        video=reconcile(api,tag)
        if not video:raise ValueError('upload_outcome_uncertain')
    if not video:
        if not record.get('uri'):
            video=reconcile(api,tag)
        if not video and not record.get('uri'):
            privacy='private' if request['kind']=='vod_preview' or request.get('publishAt') else 'public'
            status={'privacyStatus':privacy,'selfDeclaredMadeForKids':False}
            if request.get('publishAt'):status['publishAt']=request['publishAt']
            body={'snippet':{'title':request['title'][:100],'description':request['description'][:5000],'categoryId':'20','defaultLanguage':'fr','defaultAudioLanguage':'fr','tags':list(dict.fromkeys(request.get('tags',[])+[tag]))},'status':status}
            record['phase']='initializing';write_private(receipt,record)
            notify='true' if request['kind']=='vod' else 'false'
            response=http.post('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers='+notify,json=body,headers={'X-Upload-Content-Length':str(size),'X-Upload-Content-Type':'video/mp4'},timeout=45)
            if response.status_code not in (200,201):
                record['phase']='new';write_private(receipt,record)
                raise ValueError('youtube_init_http_'+str(response.status_code))
            uri=response.headers.get('Location','')
            if not uri.startswith('https://www.googleapis.com/upload/youtube/v3/videos?'):raise ValueError('invalid_resumable_location')
            record.update(uri=uri,phase='uploading',offset=0);write_private(receipt,record)
        if not video:
            # Ask the server for the acknowledged position, including a completed
            # final chunk whose response was lost before a process crash.
            response=http.put(record['uri'],data=b'',headers={'Content-Length':'0','Content-Range':f'bytes */{size}'},timeout=45)
            if response.status_code in (200,201):video=response.json().get('id')
            elif response.status_code==308:
                match=re.search(r'bytes=0-(\d+)',response.headers.get('Range',''));offset=int(match[1])+1 if match else 0
                with source.open('rb') as f:
                    while offset<size:
                        f.seek(offset);chunk=f.read(8*1024*1024);end=offset+len(chunk)-1
                        record.update(phase='uploading',offset=offset);write_private(receipt,record)
                        try:response=http.put(record['uri'],data=chunk,headers={'Content-Type':'video/mp4','Content-Length':str(len(chunk)),'Content-Range':f'bytes {offset}-{end}/{size}'},timeout=120)
                        except Exception:raise ValueError('upload_retry_resumable')
                        if response.status_code in (200,201):video=response.json().get('id');break
                        if response.status_code!=308:raise ValueError('youtube_chunk_http_'+str(response.status_code))
                        match=re.search(r'bytes=0-(\d+)',response.headers.get('Range',''));new_offset=int(match[1])+1 if match else 0
                        if new_offset<=offset:raise ValueError('upload_stalled')
                        offset=new_offset;record['offset']=offset;write_private(receipt,record)
            elif response.status_code in (404,410):
                record['phase']='uncertain';write_private(receipt,record);video=reconcile(api,tag)
                if not video:raise ValueError('upload_outcome_uncertain')
            else:raise ValueError('youtube_resume_http_'+str(response.status_code))
        if not video:raise ValueError('upload_video_id_missing')
        record.update(videoId=video,phase='uploaded');write_private(receipt,record)
    if request.get('thumbnail') and record.get('thumbnail',{}).get('sha256')!=digest(Path(request['thumbnail'])):
        # Reapplying the same cover after an ambiguous response is idempotent;
        # the durable videoId ensures this never repeats the video upload.
        record['thumbnail']=set_thumbnail(api,video,request['thumbnail']);write_private(receipt,record)
    row=api.videos().list(part='snippet,status,processingDetails,contentDetails,statistics',id=video).execute().get('items',[])
    if len(row)!=1 or row[0]['snippet']['channelId']!=CHANNEL:raise ValueError('uploaded_video_channel_mismatch')
    row=row[0];status=row.get('status',{});processing=row.get('processingDetails',{}).get('processingStatus')
    requested=request.get('publishAt')
    if request['kind']=='vod_preview':state='private_review' if status.get('privacyStatus')=='private' else 'uncertain'
    elif status.get('privacyStatus')=='public':state='published'
    elif requested and status.get('publishAt')==requested:state='scheduled'
    elif requested and status.get('publishAt') and datetime.fromisoformat(status['publishAt'].replace('Z','+00:00'))==datetime.fromisoformat(requested.replace('Z','+00:00')):state='scheduled'
    elif processing in ('processing',None):state='processing'
    else:state='blocked'
    if processing in ('failed','terminated'):state='blocked'
    announcement=announcement_metadata(row)
    announcement.update(kind=request['kind'],isShort=request['kind']=='short')
    return {'ok':True,'videoId':video,'url':'https://youtu.be/'+video,'state':state,'privacy':status.get('privacyStatus'),'publishAt':status.get('publishAt'),'processingStatus':processing,'ageRating':row.get('contentDetails',{}).get('contentRating',{}).get('ytRating'),'statistics':row.get('statistics',{}),'announcement':announcement,'thumbnail':record.get('thumbnail')}
if __name__=='__main__':
    os.umask(0o077);p=argparse.ArgumentParser();p.add_argument('--request',required=True);a=p.parse_args()
    try:print(json.dumps(deliver(json.loads(Path(a.request).read_text()))))
    except Exception as e:
        reason=str(e) if isinstance(e,ValueError) and re.fullmatch('[a-z0-9_]+',str(e)) else type(e).__name__
        print(json.dumps({'ok':False,'error':reason}));raise SystemExit(1)
