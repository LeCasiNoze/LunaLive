// Remember only acknowledged rows. A failed delivery remains eligible for retry.
export function createSyncChanges<T>(keyOf: (row: T) => string, fingerprintOf: (row: T) => string, heartbeatMs = 15 * 60_000, now = Date.now) {
  const sent = new Map<string, { fingerprint: string; at: number }>();
  return {
    pending(rows: T[]) {
      return rows.filter(row => {
        const old = sent.get(keyOf(row));
        return !old || old.fingerprint !== fingerprintOf(row) || now() - old.at >= heartbeatMs;
      });
    },
    acknowledge(rows: T[]) {
      for (const row of rows) sent.set(keyOf(row), { fingerprint: fingerprintOf(row), at: now() });
      // Prospect sync itself is bounded to 500 rows; retain a bounded history.
      while (sent.size > 2000) sent.delete(sent.keys().next().value!);
    },
  };
}
