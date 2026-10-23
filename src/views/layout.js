const { LABELS } = require("../config");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function flashHtml(flash = {}) {
  return (flash.ok ? `<p class="notice" role="status">${esc(flash.ok)}</p>` : "") +
         (flash.err ? `<p class="alert" role="alert">${esc(flash.err)}</p>` : "");
}

// Everything that lives under Settings in the bottom nav
const SETTINGS_AREA = ["home", "setup", "seasons", "rounds", "programs", "import", "athletes", "members", "activities", "groups", "schedule", "settings", "rules"];

function head(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c192e">
<title>${esc(title)} | ${esc(LABELS.app_name)}</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="description" content="${esc(LABELS.app_name)}: sign up for training sessions, volunteer shifts, and more${LABELS.org_name ? ` with the ${esc(LABELS.org_name)}` : ""}.">
<meta property="og:title" content="${esc(title)} | ${esc(LABELS.app_name)}">
<meta property="og:description" content="Pick a spot and claim it.">
<meta property="og:image" content="${esc((require("../config").APP_URL || "") + "/og-image.jpg")}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>`;
}

const foot = () => `<footer class="foot">${esc(LABELS.org_name || LABELS.app_name)}</footer>`;

// Signed-out pages use the dark sign-in gate, like the tryout app's admin login
function gateLayout({ title, body, flash }) {
  return `${head(title)}
<body class="gate">
<main class="gate-box">
  <h1 class="gate-brand"><img class="gate-logo" src="/claim-it-logo.png" width="900" height="450" alt="${esc(LABELS.app_name)}"></h1>
  ${LABELS.org_name ? `<p class="gate-sub">${esc(LABELS.org_name)}</p>` : ""}
  ${flashHtml(flash)}${body}
  ${foot()}
</main>
</body>
</html>`;
}

function bottomNav(tab, admin, coach) {
  const items = [
    ["home", "/dashboard", "🏠", "My Claims"],
    ...(admin ? [["settings", "/admin/settings", "🗂️", "Claim Boards"]] : []),
    ...(admin || coach ? [["checkin", "/checkin", "✅", "Check-in"]] : []),
    ...(admin ? [["reports", "/admin/reports", "📊", "Reports"]] : []),
  ];
  const active = SETTINGS_AREA.includes(tab) ? "settings" : tab || "home";
  return `<nav class="site-nav" aria-label="Main">${items.map(([k, href, icon, label]) =>
    `<a href="${href}"${k === active ? ' aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join("")}</nav>`;
}

// On wider screens the main links sit in the top bar (phones keep the bottom bar)
function topNav(tab, admin, coach) {
  const active = SETTINGS_AREA.includes(tab) ? (tab === "settings" ? "app" : "settings") : tab || "home";
  const items = [["home", "/dashboard", "My Claims"], ...(admin ? [["settings", "/admin/settings", "Claim Boards"]] : []),
    ...(admin || coach ? [["checkin", "/checkin", "Check-in"]] : []), ...(admin ? [["reports", "/admin/reports", "Reports"]] : [])];
  return `<nav class="top-nav" aria-label="Main">${items.map(([k, href, label]) =>
    `<a href="${href}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

// Public sign-up sheets: light page with the app bar, for people who aren't signed in
function publicLayout({ title, body, flash }) {
  return `${head(title)}
<body>
<header class="appbar"><div class="appbar-inner">
  <span class="brand"><img class="appbar-logo" src="/claim-it-logo-sm.png" width="320" height="160" alt="${esc(LABELS.app_name)}"></span>
  <span class="spacer"></span><a class="link-btn" href="/">Sign in</a>
</div></header>
<main class="page">${flashHtml(flash)}${body}</main>
${foot()}
</body>
</html>`;
}

function layout({ title, body, user, admin, flash, wide, xwide, readonly, gate, tab, pub }) {
  const coach = !!(user && user.is_coach);
  if (user && require("../auth").isAdmin(user)) admin = admin || true; // admins always get their links
  if (pub && !user) return publicLayout({ title, body, flash });
  if (gate || !user) return gateLayout({ title, body, flash });
  const w = xwide ? " wide xwide" : wide ? " wide" : "";
  const ro = readonly ? " ro" : ""; // read-only styling applies to page content only
  return `${head(title)}
<body class="${SETTINGS_AREA.includes(tab) || tab === "reports" || tab === "checkin" ? "admin-area" : "member-area"}">
<header class="appbar">
  <div class="appbar-inner${w}">
    <a class="brand" href="/dashboard">
      <img class="appbar-logo" src="/claim-it-logo-sm.png" width="320" height="160" alt="${esc(LABELS.app_name)}">
      <span class="brand-text sr-only"><span class="brand-mark"><span class="bm-long">${esc(LABELS.app_name)}</span><span class="bm-short">${esc(LABELS.app_short)}</span></span><span class="brand-org">${esc(LABELS.org_name)}</span></span>
    </a>
    ${admin || coach ? topNav(tab, admin, coach) : ""}
    <span class="spacer"></span>
    <div class="who"><b>${esc(user.email)}</b>
      ${admin ? `<a class="app-link" href="/admin/settings/app"${tab === "settings" ? ' aria-current="page"' : ""}>⚙ App settings</a>` : ""}
      <form method="post" action="/logout"><button class="link-btn" type="submit">Sign out</button></form></div>
  </div>
</header>
<main class="page${w}${ro}">${flashHtml(flash)}${body}</main>
${foot()}
${admin || coach ? bottomNav(tab, admin, coach) : ""}
</body>
</html>`;
}

const errorPage = (msg, opts = {}) =>
  layout({ title: "Error", ...opts,
    body: opts.user
      ? `<section class="panel"><h1>Something went wrong</h1><p class="lede">${esc(msg)}</p><a class="btn" href="/">Go back</a></section>`
      : `<div class="gate-card"><h1>Something went wrong</h1><p>${esc(msg)}</p><a class="btn" href="/">Go to sign in</a></div>` });

module.exports = { esc, layout, errorPage, SETTINGS_AREA };
