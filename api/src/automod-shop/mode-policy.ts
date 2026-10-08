/** Both sides of a pending mode change must accept a purchase. */
export function shopCommandAllowed(control:any,kind:string):boolean{
 if(['shop','balance','rain','choose'].includes(kind))return true;
 const modes=[control?.dashboard_settings?.mode,control?.runtime_status?.mode,control?.runtime_status?.config?.mode];
 if(modes.includes('session-buy'))return false; // upgrade-one gets its own verified order path.
 if(modes.includes('provider-challenge'))return kind==='stake';
 return !(kind==='duration'&&control?.dashboard_settings?.mode==='auto-hunt'&&control?.dashboard_settings?.hunt?.jail===true);
}
