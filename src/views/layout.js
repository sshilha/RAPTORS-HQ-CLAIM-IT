const { LABELS } = require("../config");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function flashHtml(flash = {}) {
  return (flash.ok ? `<p class="notice" role="status">${esc(flash.ok)}</p>` : "") +
         (flash.err ? `<p class="alert" role="alert">${esc(flash.err)}</p>` : "");
}

// Everything that lives under Settings in the bottom nav
const SETTINGS_AREA = ["home", "setup", "seasons", "rounds", "programs", "import", "athletes", "members", "activities", "groups", "schedule", "settings", "rules", "people"];

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

const VERSION = `v${require("../../package.json").version}`;
// Success messages fade after a few seconds (errors stay until dismissed); either can be closed with ×.
// The message is also taken out of the address, so a refresh doesn't show it again.
const FLASH_JS = `<script>(function () {
  var u = new URL(location.href); if (u.searchParams.has("ok") || u.searchParams.has("err")) { u.searchParams.delete("ok"); u.searchParams.delete("err"); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); }
  document.querySelectorAll(".notice, .alert").forEach(function (n) {
    if (n.closest("form") || n.closest("dialog") || !n.parentElement || !/^(MAIN)$/.test(n.parentElement.tagName)) return;
    var x = document.createElement("button"); x.type = "button"; x.className = "flash-x"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "×";
    function bye() { n.classList.add("flash-out"); setTimeout(function () { n.remove(); }, 400); }
    x.addEventListener("click", bye); n.appendChild(x);
    if (n.classList.contains("notice")) setTimeout(bye, 6000);
  });
})();</script>`;
const foot = (user, tab) => `<footer class="foot">${user && require("../auth").isAdmin(user) ? `<span class="ver" title="App version">${VERSION}</span>` : ""}${user && tab === "home" ? `<p class="foot-change">Is your info wrong (name, team, email, phone)? <a href="/request-change">Request a change</a></p>` : ""}${esc(LABELS.org_name || LABELS.app_name)}</footer>`;

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
${FLASH_JS}
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
${FLASH_JS}
</body>
</html>`;
}

// My Claims dashboard header (opt-in with dash: true). Same links and permissions as the regular header.
const DI = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M8 14h2M14 14h2M8 18h2M14 18h2"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2.5H6.5A2 2 0 0 0 4.5 4.5v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h7"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3.5"/><path d="M5.5 19c1.4-2.6 3.7-4 6.5-4s5.1 1.4 6.5 4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
};
function dashHeader(user, admin, coach, tab) {
  const items = [["/dashboard", "My Claims", DI.cal, tab === "home"],
    ...(admin ? [["/admin/settings", LABELS.schedules, DI.board]] : []),
    ...(admin || coach ? [["/checkin", "Check-in", DI.check]] : []),
    ...(admin || user.can_reports ? [["/reports", "Reports", DI.report, tab === "reports"]] : [])];
  const role = admin ? "Administrator" : coach ? "Coach" : "Parent Account";
  return `<header class="dh">
  <div class="dh-in">
    <a class="dh-logo" href="/dashboard"><img src="/claim-it-logo-sm.png" width="320" height="160" alt="${esc(LABELS.app_name)}"></a>
    <nav class="dh-nav" aria-label="Main">${items.map(([href, label, icon, on]) => `<a href="${href}"${on ? ' aria-current="page"' : ""}>${icon}<span>${esc(label)}</span></a>`).join("")}</nav>
    <div class="dh-right">
      <details class="dh-acct"><summary>${DI.user}<span class="dh-who"><b>${esc(user.email)}</b><small>${role}</small></span>${DI.down}</summary>
        <div class="dh-menu"><a href="/request-change">Request a change to my info</a>${admin ? `<a href="/admin/settings/app">App Settings</a>` : ""}
          <form method="post" action="/logout"><button type="submit">Sign Out</button></form></div></details>
      ${admin ? `<a class="dh-settings" href="/admin/settings/app">${DI.gear}<span>App Settings</span></a>` : ""}
      <form method="post" action="/logout" class="dh-out"><button type="submit">Sign Out</button></form>
    </div>
    <details class="dh-burger"><summary aria-label="Menu">${DI.menu}</summary>
      <div class="dh-sheet">
        <div class="dh-sheet-who">${DI.user}<span><b>${esc(user.email)}</b><small>${role}</small></span></div>
        ${items.map(([href, label, icon, on]) => `<a href="${href}"${on ? ' aria-current="page"' : ""}>${icon}${esc(label)}</a>`).join("")}
        ${admin ? `<a href="/admin/settings/app">${DI.gear}App Settings</a>` : ""}
        <a href="/request-change">${DI.report}Request a change to my info</a>
        <form method="post" action="/logout"><button type="submit">Sign Out</button></form>
      </div></details>
  </div>
</header>`;
}

function layout({ title, body, user, admin, flash, wide, xwide, readonly, gate, tab, pub, dash }) {
  const coach = !!(user && user.is_coach);
  if (user && require("../auth").isAdmin(user)) admin = admin || true; // admins always get their links
  if (pub && !user) return publicLayout({ title, body, flash });
  if (gate || !user) return gateLayout({ title, body, flash });
  const w = xwide ? " wide xwide" : wide ? " wide" : "";
  const ro = readonly ? " ro" : ""; // read-only styling applies to page content only
  if (dash) return `${head(title)}
<body class="member-area dash">
${dashHeader(user, admin, coach, tab)}
<main class="dash-page">${flashHtml(flash)}${body}</main>
${foot(user, tab)}
${FLASH_JS}
</body>
</html>`;
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
${foot(user, tab)}
${admin || coach ? bottomNav(tab, admin, coach) : ""}
${FLASH_JS}
</body>
</html>`;
}

const errorPage = (msg, opts = {}) =>
  layout({ title: "Error", ...opts,
    body: opts.user
      ? `<section class="panel"><h1>Something went wrong</h1><p class="lede">${esc(msg)}</p><a class="btn" href="/">Go back</a></section>`
      : `<div class="gate-card"><h1>Something went wrong</h1><p>${esc(msg)}</p><a class="btn" href="/">Go to sign in</a></div>` });

module.exports = { esc, layout, errorPage, SETTINGS_AREA };
