/** Rumble v1.1 documents user_id, not a required username at the root. */
export function followSnapshot(data:any,configuredUsername:string){
 if(configuredUsername.toLowerCase()!=='lecasinoze')return null;
 if(data?.username!=null&&String(data.username).toLowerCase()!==configuredUsername.toLowerCase())return null;
 if(data?.type!=='user'||!/^\d{1,20}$/.test(String(data?.user_id??'')))return null;
 const followers=data.followers;
 if(!followers||!Number.isSafeInteger(followers.num_followers_total)||followers.num_followers_total<0)return null;
 return {ownerId:String(data.user_id),total:followers.num_followers_total,
  recent:Array.isArray(followers.recent_followers)?followers.recent_followers.slice(0,500):[]};
}
