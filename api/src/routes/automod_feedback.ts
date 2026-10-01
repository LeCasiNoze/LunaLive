import { Router, json } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
export const automodFeedbackRouter=Router();
const origins=new Set(['https://lecasinoze.onrender.com']);
const issues=new Set(['fps','audio','slot','bonus','commands','queue','overlay','other']);
const clients=new Map<string,{start:number;count:number}>(), salt=randomBytes(32);
const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const rating=(v:unknown)=>/^[1-5]$/.test(String(v??''))?Number(v):null;
automodFeedbackRouter.post('/automod-feedback',json({limit:'16kb'}),async(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  if(!origins.has(String(req.headers.origin||'')))return res.status(403).json({error:'Ouvrez le formulaire depuis le site LeCasiNoze.'});
  const data=req.body;if(!data||typeof data!=='object'||Array.isArray(data))return res.status(400).json({error:'Retour invalide.'});
  if(JSON.stringify(data).length>16000)return res.status(413).json({error:'Retour trop volumineux.'});
  if(data.website)return res.status(201).json({ok:true});
  const kind=text(data.kind,20),message=text(data.message,3000),evidence=text(data.evidence,600);
  if(!['avis','bug','suggestion'].includes(kind)||message.length<10)return res.status(400).json({error:'Votre retour doit contenir au moins 10 caractères.'});
  if(evidence){try{if(!['https:','http:'].includes(new URL(evidence).protocol))throw Error();}catch{return res.status(400).json({error:'Le lien doit commencer par https:// ou http://.'});}}
  const now=Date.now();for(const [key,v]of clients)if(now-v.start>=3600000)clients.delete(key);
  const key=createHash('sha256').update(salt).update(req.ip||req.socket.remoteAddress||'unknown').digest('hex');
  const limit=clients.get(key)||{start:now,count:0};
  if(limit.count>=5||(!clients.has(key)&&clients.size>=10000))return res.status(429).json({error:'Merci ! Attendez une heure avant de renvoyer un retour.'});
  // Reserve before the asynchronous insert so parallel requests cannot bypass the limit.
  limit.count++;clients.set(key,limit);
  const id=randomUUID();
  const payload={kind,message,evidence,issues:Array.isArray(data.issues)?[...new Set(data.issues.filter((v:unknown)=>typeof v==='string'&&issues.has(v)))]:[],ratings:{overall:rating(data.overall),video:rating(data.video),audio:rating(data.audio),readability:rating(data.readability)},slot:text(data.slot,120),when:text(data.when,100),platform:['rumble','lunalive','both'].includes(data.platform)?data.platform:'unknown',device:['phone','computer','tablet'].includes(data.device)?data.device:'unknown',nickname:text(data.nickname,80),contact:text(data.contact,160)};
  try{await pool.query(`INSERT INTO automod_feedback(id,streamer_id,payload) SELECT $1,id,$2::jsonb FROM streamers WHERE lower(slug)='lecasinoze' RETURNING id`,[id,JSON.stringify(payload)]);}catch(error){limit.count--;throw error;}
  return res.status(201).json({ok:true,id});
 }catch{return res.status(503).json({error:'Impossible d’enregistrer votre retour. Réessayez dans un instant.'});}
});
automodFeedbackRouter.get('/automod-feedback',requireAuth,async(req:any,res)=>{
 try{
 const owner=(await pool.query("SELECT id,user_id FROM streamers WHERE lower(slug)='lecasinoze'")).rows[0];
 if(!owner||(req.user?.role!=='admin'&&Number(req.user?.id)!==Number(owner.user_id)))return res.status(403).json({error:'Accès réservé.'});
 res.setHeader('Cache-Control','no-store');
 const rows=(await pool.query('SELECT id,created_at,payload FROM automod_feedback WHERE streamer_id=$1 ORDER BY created_at DESC LIMIT 200',[owner.id])).rows;
 return res.json({ok:true,feedback:rows});
 }catch{return res.status(503).json({error:'Lecture indisponible.'});}
});

