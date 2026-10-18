export function isDedicatedRelayEcho(username:string,botUsername:string,streamerSlug:string):boolean {
  const sender=username.trim().toLowerCase(),bot=botUsername.trim().toLowerCase();
  // A shared broadcaster login must retain its human commands.
  return Boolean(bot&&bot!==streamerSlug.trim().toLowerCase()&&sender===bot);
}
