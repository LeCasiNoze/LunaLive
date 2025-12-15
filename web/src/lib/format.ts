export function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function initialOf(name: string) {
  const s = (name || "?").trim();
  return (s[0] || "?").toUpperCase();
}
