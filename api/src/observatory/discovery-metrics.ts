let day = "",
  rumbleBytes = 0,
  nivoraBytes = 0,
  requests = 0;
export function recordDiscovery(source: "rumble" | "nivora", bytes: number) {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) {
    day = d;
    rumbleBytes = 0;
    nivoraBytes = 0;
    requests = 0;
  }
  requests++;
  if (source === "rumble") rumbleBytes += bytes;
  else nivoraBytes += bytes;
}
export function discoveryMetrics() {
  return { day, rumbleBytes, nivoraBytes, requests };
}
