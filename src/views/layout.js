const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function flashHtml(flash = {}) {
  return (flash.ok ? `<p class="notice" role="status">${esc(flash.ok)}</p>` : "") +
         (flash.err ? `<p class="alert" role="alert">${esc(flash.err)}</p>` : "");
}

const SETUP_TABS = ["setup", "seasons", "rounds", "programs", "import"];

function head(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c192e">
<title>${esc(title)} | Raptors Training</title>
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;900&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>`;
}

const FOOT = `<footer class="foot">Chippewa Valley Raptors · Mondovi, WI</footer>`;

// Signed-out pages use the dark sign-in gate, like the tryout app's admin login
function gateLayout({ title, body, flash }) {
  return `${head(title)}
<body class="gate">
<main class="gate-box">
  <img class="gate-logo" src="/raptors-logo.png" alt="Chippewa Valley Raptors">
  <p class="gate-title">Raptors Training</p>
  <p class="gate-sub">Chippewa Valley Raptors</p>
  ${flashHtml(flash)}${body}
  ${FOOT}
</main>
</body>
</html>`;
}

function bottomNav(tab, admin) {
  const items = [
    ["home", "/dashboard", "🏠", "My Training"],
    ...(admin ? [["setup", "/admin/setup", "⚙️", "Setup"], ["reports", "/admin/reports", "📊", "Reports"], ["athletes", "/admin/athletes", "👥", "Athletes"]] : []),
  ];
  const active = SETUP_TABS.includes(tab) ? "setup" : tab || "home";
  return `<nav class="site-nav" aria-label="Main">${items.map(([k, href, icon, label]) =>
    `<a href="${href}"${k === active ? ' aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join("")}</nav>`;
}

function layout({ title, body, user, admin, flash, wide, xwide, readonly, gate, tab }) {
  if (gate || !user) return gateLayout({ title, body, flash });
  const w = xwide ? " wide xwide" : wide ? " wide" : "";
  const ro = readonly ? " ro" : ""; // read-only styling applies to page content only
  return `${head(title)}
<body>
<header class="appbar">
  <div class="appbar-inner${w}">
    <a class="brand" href="/dashboard">
      <img class="appbar-logo" src="/raptors-logo.png" alt="">
      <span class="brand-text"><span class="brand-mark">Raptors Training</span><span class="brand-org">Chippewa Valley Raptors</span></span>
    </a>
    <span class="spacer"></span>
    <div class="who"><b>${esc(user.email)}</b>
      <form method="post" action="/logout"><button class="link-btn" type="submit">Sign out</button></form></div>
  </div>
</header>
<main class="page${w}${ro}">${flashHtml(flash)}${body}</main>
${FOOT}
${admin ? bottomNav(tab, admin) : ""}
</body>
</html>`;
}

const errorPage = (msg, opts = {}) =>
  layout({ title: "Error", ...opts,
    body: opts.user
      ? `<section class="panel"><h1>Something went wrong</h1><p class="lede">${esc(msg)}</p><a class="btn" href="/">Go back</a></section>`
      : `<div class="gate-card"><h1>Something went wrong</h1><p>${esc(msg)}</p><a class="btn" href="/">Go to sign in</a></div>` });

module.exports = { esc, layout, errorPage };
