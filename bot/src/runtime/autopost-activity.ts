import type {Pool} from 'pg';

export function automodModeReminder(mode:string){
 if(mode==='provider-challenge')return 'Pragmatic ou Hacksaw ? Choisis !camp pragma ou !camp hacksaw, puis !call + nom complet. !shop pour renforcer ton camp.';
 if(mode==='session-buy')return 'Session achat : 3 bonus par machine ! Propose la tienne : !call + nom complet. !shop pour améliorer un achat.';
 if(mode==='bonus-hunt'||mode==='auto-hunt')return 'Auto Hunt : on collecte les bonus, puis on les ouvre ensemble ! !call + nom complet pour proposer une machine. !help pour participer.';
 return 'À toi de jouer : !call + nom complet de la slot. !mcall retire ton dernier call. !music + titre et artiste pour la musique.';
}
/** Only this explicit template opts into dynamic Automod copy. */
export async function renderAutomodReminder(pool:Pool,sid:number,slug:string,message:string){
 if(slug.toLowerCase()!=='lecasinoze'||message!=='{{automod_session}}')return message;
 const control=(await pool.query('SELECT desired_enabled,runtime_status,dashboard_settings FROM automod_control WHERE streamer_id=$1',[sid])).rows[0];
 return automodModeReminder(control?.desired_enabled?(control.runtime_status?.mode??control.dashboard_settings?.mode??'automod'):'automod');
}

/** Durable activity budget: bot messages cannot unlock another Automod reminder. */
export async function claimAutomodReminder(pool:Pool,streamerId:number,slug:string,botUserId:number):Promise<boolean>{
 if(slug.toLowerCase()!=='lecasinoze')return true;
 const mode=(await pool.query('SELECT desired_enabled FROM automod_control WHERE streamer_id=$1',[streamerId])).rows[0];
 if(!mode?.desired_enabled)return true;
 await pool.query(`CREATE TABLE IF NOT EXISTS automod_autopost_activity (
 streamer_id bigint PRIMARY KEY REFERENCES streamers(id),last_message_id bigint NOT NULL,last_sent_at timestamptz NOT NULL)`);
 const claimed=await pool.query(`INSERT INTO automod_autopost_activity(streamer_id,last_message_id,last_sent_at)
 SELECT $1,MAX(id),NOW() FROM chat_messages
 WHERE streamer_id=$1 AND deleted_at IS NULL AND created_at>NOW()-INTERVAL '20 minutes'
 AND (user_id>0 OR external_source IS NOT NULL) AND user_id IS DISTINCT FROM $2
 AND lower(username) NOT IN ('lunalive_bot','lunabot','automod','lunalivebot','nozebot')
 HAVING MAX(id) IS NOT NULL
 ON CONFLICT(streamer_id) DO UPDATE SET last_message_id=EXCLUDED.last_message_id,last_sent_at=EXCLUDED.last_sent_at
 WHERE automod_autopost_activity.last_message_id<EXCLUDED.last_message_id
 AND automod_autopost_activity.last_sent_at<=NOW()-INTERVAL '20 minutes'
 RETURNING streamer_id`,[streamerId,botUserId]);
 return Boolean(claimed.rowCount);
}
