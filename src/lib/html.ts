import "server-only";

export function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// One small page style for sign-in and setup. No scripts: forms only.
export function page(title: string, body: string, status = 200, headers: HeadersInit = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title><style>
:root{--bg:#f7f5f1;--card:#fff;--ink:#1a1a1a;--muted:#6b6660;--line:#e6e1d9;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#141312;--card:#1c1b1a;--ink:#f1eee9;--muted:#a19b93;--line:#2e2c29;--bad:#f2b8b5}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px}
main{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{font-size:21px;margin:0 0 6px;letter-spacing:-.2px}h2{font-size:15px;margin:22px 0 8px}p{margin:0 0 14px;color:var(--muted)}
ul{list-style:none;margin:0 0 14px;padding:0;border-top:1px solid var(--line)}li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
textarea{width:100%;height:120px;font:12px/1.4 ui-monospace,monospace;padding:10px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--ink);margin:0 0 14px;word-break:break-all}
.row{display:flex;flex-direction:row-reverse;gap:10px}button,.btn{flex:1;display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 16px;border-radius:10px;font:600 15px/1 inherit;cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--ink);text-decoration:none}
button.go,.btn.go{background:var(--ink);color:var(--bg);border-color:var(--ink)}button.small{flex:none;height:32px;font-size:13px}.bad{color:var(--bad)}code{font:13px ui-monospace,monospace}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'",
      ...headers,
    },
  });
}

export function errorPage(message: string, status = 400) {
  return page("Can't continue", `<h1>Can't continue</h1><p>${escape(message)}</p>`, status);
}

export function redirect(to: string, headers: HeadersInit = {}) {
  return new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", ...headers } });
}
