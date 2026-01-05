export function applyTemplate(tpl: string, vars: Record<string, string>) {
  let out = String(tpl ?? "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v);
    out = out.replaceAll(`@{${k}}`, `@${v}`);
  }
  return out;
}
