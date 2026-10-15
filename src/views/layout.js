const { LABELS } = require("../config");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function flashHtml(flash = {}) {
  return (flash.ok ? `<p class="notice" role="status">${esc(flash.ok)}</p>` : "") +
         (flash.err ? `<p class="alert" role="alert">${esc(flash.err)}</p>` : "");
}

// Everything that lives under Settings in the bottom nav
const SETTINGS_AREA = ["setup", "seasons", "rounds", "programs", "import", "athletes", "members", "activities", "groups", "schedule", "settings"];

function head(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c192e">
<title>${esc(title)} | ${esc(LABELS.app_name)}</title>
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;900&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>`;
}

const foot = () => `<footer class="foot">${esc(LABELS.org_name || LABELS.app_name)}</footer>`;

// Signed-out pages use the dark sign-in gate, like the tryout app's admin login
function gateLayout({ title, body, flash }) {
  return `${head(title)}
<body class="gate">
<main class="gate-box">
  <img class="gate-logo" src="/raptors-logo.png" alt="${esc(LABELS.org_name)}">
  <p class="gate-title">${esc(LABELS.app_name)}</p>
  ${LABELS.org_name ? `<p class="gate-sub">${esc(LABELS.org_name)}</p>` : ""}
  ${flashHtml(flash)}${body}
  ${foot()}
</main>
</body>
</html>`;
}

function bottomNav(tab, admin) {
  const items = [
    ["home", "/dashboard", "🏠", "My Claims"],
    ...(admin ? [["reports", "/admin/reports", "📊", "Reports"], ["settings", "/admin/setup", "🛠️", "Settings"]] : []),
  ];
  const active = SETTINGS_AREA.includes(tab) ? "settings" : tab || "home";
  return `<nav class="site-nav" aria-label="Main">${items.map(([k, href, icon, label]) =>
    `<a href="${href}"${k === active ? ' aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join("")}</nav>`;
}

// Public sign-up sheets: light page with the app bar, for people who aren't signed in
function publicLayout({ title, body, flash }) {
  return `${head(title)}
<body>
<header class="appbar"><div class="appbar-inner">
  <span class="brand"><img class="appbar-logo" src="/raptors-logo.png" alt="">
    <span class="brand-text"><span class="brand-mark">${esc(LABELS.app_name)}</span><span class="brand-org">${esc(LABELS.org_name)}</span></span></span>
  <span class="spacer"></span><a class="link-btn" href="/">Sign in</a>
</div></header>
<main class="page">${flashHtml(flash)}${body}</main>
${foot()}
</body>
</html>`;
}

function layout({ title, body, user, admin, flash, wide, xwide, readonly, gate, tab, pub }) {
  if (pub && !user) return publicLayout({ title, body, flash });
  if (gate || !user) return gateLayout({ title, body, flash });
  const w = xwide ? " wide xwide" : wide ? " wide" : "";
  const ro = readonly ? " ro" : ""; // read-only styling applies to page content only
  return `${head(title)}
<body>
<header class="appbar">
  <div class="appbar-inner${w}">
    <a class="brand" href="/dashboard">
      <img class="appbar-logo" src="/raptors-logo.png" alt="">
      <span class="brand-text"><span class="brand-mark"><span class="bm-long">${esc(LABELS.app_name)}</span><span class="bm-short">${esc(LABELS.app_short)}</span></span><span class="brand-org">${esc(LABELS.org_name)}</span></span>
    </a>
    <span class="spacer"></span>
    <div class="who"><b>${esc(user.email)}</b>
      <form method="post" action="/logout"><button class="link-btn" type="submit">Sign out</button></form></div>
  </div>
</header>
<main class="page${w}${ro}">${flashHtml(flash)}${body}</main>
${foot()}
${admin ? bottomNav(tab, admin) : ""}
</body>
</html>`;
}

const errorPage = (msg, opts = {}) =>
  layout({ title: "Error", ...opts,
    body: opts.user
      ? `<section class="panel"><h1>Something went wrong</h1><p class="lede">${esc(msg)}</p><a class="btn" href="/">Go back</a></section>`
      : `<div class="gate-card"><h1>Something went wrong</h1><p>${esc(msg)}</p><a class="btn" href="/">Go to sign in</a></div>` });

module.exports = { esc, layout, errorPage, SETTINGS_AREA };
