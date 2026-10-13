const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const seam = `
<svg class="seam" viewBox="0 0 400 120" aria-hidden="true" preserveAspectRatio="none">
  <path d="M-10 110 C 120 10, 280 10, 410 110" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M-10 110 C 120 10, 280 10, 410 110" fill="none" stroke="currentColor" stroke-width="7"
        stroke-dasharray="2 12" stroke-linecap="round" transform="translate(0 -6)"/>
</svg>`;

function flashHtml(flash = {}) {
  return (flash.ok ? `<p class="notice" role="status">${esc(flash.ok)}</p>` : "") +
         (flash.err ? `<p class="alert" role="alert">${esc(flash.err)}</p>` : "");
}

function layout({ title, body, user, admin, flash, wide, xwide, readonly }) {
  const w = xwide ? " wide xwide" : wide ? " wide" : "";
  const ro = readonly ? " ro" : ""; // read-only styling applies to page content only, not the header
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Raptors Training</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="band">
  ${seam}
  <div class="band-inner${w}">
    <a class="brand" href="/">
      <span class="brand-org">Chippewa Valley Raptors</span>
      <span class="brand-mark">Training</span>
    </a>
    ${user ? `<nav class="nav">
      <a href="/dashboard">My training</a>
      ${admin ? `<a href="/admin">Admin</a>` : ""}
      <form method="post" action="/logout"><button class="link-btn" type="submit">Sign out</button></form>
    </nav>` : ""}
  </div>
</header>
<main class="page${w}${ro}">${flashHtml(flash)}${body}</main>
<footer class="foot">Chippewa Valley Raptors Fastpitch</footer>
</body>
</html>`;
}

const errorPage = (msg, opts = {}) =>
  layout({ title: "Error", ...opts,
    body: `<section class="panel"><h1>Something went wrong</h1><p class="lede">${esc(msg)}</p><a class="btn" href="/">Go back</a></section>` });

module.exports = { esc, layout, errorPage };
