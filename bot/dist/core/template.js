export function applyTemplate(tpl, vars) {
    let out = String(tpl ?? "");
    for (const [k, v] of Object.entries(vars)) {
        out = out.replaceAll(`{${k}}`, v);
        out = out.replaceAll(`@{${k}}`, `@${v}`);
    }
    return out;
}
