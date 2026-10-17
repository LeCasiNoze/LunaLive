// Local aggregate reads only. No identities or message text leave this module.
export function dashboardMetrics(db, channel, now, startedAt) {
  const day = 86400000,
    retention = now - 8 * day;
  const metrics = {};
  for (const [period, days] of [
    ["day", 1],
    ["week", 7],
    ["month", 30],
  ]) {
    const requested = now - days * day;
    const since = Math.max(requested, retention, startedAt ?? now);
    const c = db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN excluded=0 AND resolved=1 THEN account END) AS net,
      COUNT(CASE WHEN excluded=0 AND resolved=1 THEN 1 END) AS messages,
      COUNT(CASE WHEN excluded=0 AND resolved=1 AND conversation=1 THEN 1 END) AS conversation,
      COUNT(CASE WHEN resolved=0 THEN 1 END) AS unresolved FROM events WHERE channel=? AND at>=? AND at<=?`,
      )
      .get(channel, since, now);
    const covered = db
      .prepare(
        "SELECT COUNT(*) AS n FROM points WHERE channel=? AND t>=? AND t<=? AND json_extract(p,'$[6]')>0",
      )
      .get(channel, since, now).n;
    const known = !c.unresolved && (covered > 0 || c.messages > 0);
    const samples = db
      .prepare(
        "SELECT t,total FROM followers WHERE channel=? AND t>=? AND t<=? ORDER BY t",
      )
      .all(channel, requested, now);
    const sample = (row) => (row ? { at: row.t, total: row.total } : null);
    metrics[period] = {
      since,
      until: now,
      retentionLimited: Math.max(requested, startedAt ?? now) < retention,
      uniqueChatters: known ? c.net : null,
      messages: known ? c.messages : null,
      conversation: known ? c.conversation : null,
      followersFirst: sample(samples[0]),
      followersLast: sample(samples.at(-1)),
    };
  }
  const { followersFirst: a, followersLast: b } = metrics.week;
  const growth =
    a && b && b.at - a.at >= day
      ? { since: a.at, until: b.at, delta: b.total - a.total }
      : null;
  return { metrics, growth };
}
