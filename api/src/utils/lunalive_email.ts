type EmailAction = {
  label: string;
  url: string;
};

export type LunaLiveEmailOptions = {
  preheader: string;
  eyebrow?: string;
  title: string;
  paragraphs: string[];
  action?: EmailAction;
  code?: string;
  footer?: string;
};

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function paragraphHtml(paragraph: string) {
  return escapeHtml(paragraph).replace(/\n/g, "<br>");
}

export function renderLunaLiveEmail(options: LunaLiveEmailOptions) {
  const preheader = escapeHtml(options.preheader);
  const eyebrow = escapeHtml(options.eyebrow || "LUNALIVE");
  const title = escapeHtml(options.title);
  const footer = escapeHtml(
    options.footer || "Tu reçois cet email parce qu’une action a été effectuée sur LunaLive."
  );
  const paragraphs = options.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;color:#d8d5e8;font-size:16px;line-height:1.7;">${paragraphHtml(paragraph)}</p>`
    )
    .join("");
  const code = options.code
    ? `<div style="margin:26px 0;padding:20px 24px;border:1px solid rgba(157,92,255,.42);border-radius:16px;background:#151024;text-align:center;color:#ffffff;font-size:30px;font-weight:800;letter-spacing:8px;">${escapeHtml(options.code)}</div>`
    : "";
  const action = options.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px;"><tr><td style="border-radius:12px;background:#8b5cf6;"><a href="${escapeHtml(options.action.url)}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;">${escapeHtml(options.action.label)}</a></td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#07060c;color:#ffffff;font-family:Inter,Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#07060c;">
      <tr>
        <td align="center" style="padding:34px 14px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border:1px solid #272038;border-radius:24px;background:#0d0a14;overflow:hidden;">
            <tr><td style="height:5px;background:#8b5cf6;font-size:0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:34px 36px 18px;">
                <div style="font-size:23px;font-weight:900;letter-spacing:-.7px;color:#ffffff;">Luna<span style="color:#b667ff;">Live</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 36px;">
                <div style="margin-bottom:12px;color:#b667ff;font-size:12px;font-weight:800;letter-spacing:1.8px;">${eyebrow}</div>
                <h1 style="margin:0 0 22px;color:#ffffff;font-size:30px;line-height:1.2;letter-spacing:-.7px;">${title}</h1>
                ${paragraphs}
                ${code}
                ${action}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px;border-top:1px solid #272038;background:#0a0810;color:#817c91;font-size:12px;line-height:1.6;">
                ${footer}<br>
                <a href="https://lunalive.win" style="color:#b667ff;text-decoration:none;">lunalive.win</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
