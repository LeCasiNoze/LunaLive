"""Reusable replay cover, always backed by real source frames and provenance."""
import json,subprocess,sys,gc
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import cv2,numpy as np
from youtube_delivery import write_private,digest

ROOT=Path('/opt/lunaclip')
def build_thumbnail(source,folder,row,number):
 folder=Path(folder);proof=folder/'thumbnail-proof.json';out=folder/'thumbnail.jpg'
 if proof.exists() and out.exists():
  saved=json.loads(proof.read_text())
  if saved.get('sourceSha256')==digest(source) and saved.get('sha256')==digest(out):return out
 from ultralytics import YOLO
 cv2.setNumThreads(1)
 game_model=YOLO(str(ROOT/'worker/models/stage4/best.pt'));face_model=YOLO(str(ROOT/'worker/models/stage5/best.pt'))
 cap=cv2.VideoCapture(str(source));fps=cap.get(cv2.CAP_PROP_FPS);duration=cap.get(cv2.CAP_PROP_FRAME_COUNT)/fps;W=int(cap.get(3));H=int(cap.get(4))
 games=[];faces=[]
 try:
  for t in np.linspace(min(60,duration*.1),max(61,duration-30),28):
   cap.set(cv2.CAP_PROP_POS_MSEC,float(t)*1000);ok,frame=cap.read()
   if not ok:continue
   small=cv2.resize(frame,(960,round(H*960/W)))
   def boxes(model):
    values=[]
    for b in model.predict(small,verbose=False,conf=.70,imgsz=640)[0].boxes:
     x1,y1,x2,y2=map(float,b.xyxyn[0]);values.append((int(x1*W),int(y1*H),max(2,int((x2-x1)*W)),max(2,int((y2-y1)*H))))
    return values
   game_boxes=boxes(game_model)
   for box in game_boxes:
    x,y,w,h=box
    if w*h<W*H*.14:continue
    # Exclude the lower financial HUD from the thumbnail's game insert.
    crop=frame[y:y+int(h*.86),x:x+w];gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)
    if crop.size==0 or gray.std()<22:continue
    sat=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)[:,:,1].mean();score=float(sat*.3+gray.std()+min(50,cv2.Laplacian(gray,cv2.CV_64F).var()*.01))
    games.append({'time':float(t),'box':[x,y,w,int(h*.86)],'score':score})
   for box in boxes(face_model):
    x,y,w,h=box
    if not .6<w/h<2.4 or w*h<W*H*.005 or w*h>W*H*.30:continue
    if any(max(0,min(x+w,gx+gw)-max(x,gx))*max(0,min(y+h,gy+gh)-max(y,gy))>w*h*.3 for gx,gy,gw,gh in game_boxes):continue
    crop=frame[y:y+h,x:x+w];gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)
    faces.append({'time':float(t),'box':list(box),'score':float(min(150,cv2.Laplacian(gray,cv2.CV_64F).var())+gray.std())})
 finally:cap.release()
 # Do not hold both detection models while Chrome renders the HTML cover.
 del game_model,face_model
 gc.collect()
 if not games:raise ValueError('thumbnail_no_reliable_game_frame')
 games.sort(key=lambda x:x['score'],reverse=True);faces.sort(key=lambda x:x['score'],reverse=True)
 chosen={'game':games[0]};second=next((g for g in games[1:] if abs(g['time']-games[0]['time'])>duration*.18),None)
 if second:chosen['second']=second
 if faces:chosen['face']=faces[0]
 request={'number':number,'date':datetime.fromisoformat(row['started_at'].replace('Z','+00:00')).astimezone(ZoneInfo('Europe/Paris')).strftime('%d.%m.%Y')}
 for label,item in chosen.items():
  x,y,w,h=item['box'];file=folder/f'thumbnail-{label}.jpg'
  subprocess.run(['ffmpeg','-v','error','-threads','1','-y','-ss',str(item['time']),'-i',str(source),'-frames:v','1','-vf',f'crop={w}:{h}:{x}:{y}',str(file)],check=True,capture_output=True,timeout=90)
  request[label]=str(file.resolve())
 reqfile=folder/'thumbnail-request.json';write_private(reqfile,request)
 subprocess.run(['node',str(ROOT/'replays/thumbnail-render.mjs'),str(reqfile)],check=True,capture_output=True,timeout=120)
 if not out.exists() or out.stat().st_size>2*1024**2:raise ValueError('thumbnail_file_invalid')
 write_private(proof,{'sourceSha256':digest(source),'sha256':digest(out),'sourceVodId':str(row['id']),'number':number,'frames':chosen,'method':'real-source-frames-html-template-v1','generatedPayout':False})
 return out
