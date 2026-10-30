// App settings -> Sign-in activity: every sign-in attempt, for troubleshooting (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const { esc } = require("../views/layout");
const { page } = require("../views/admin");
const { fmtDateTime } = require("../time");
const { wrap, flashFrom, str } = require("./util");
const router = express.Router();
router.use(auth.requireAdmin);
router.get("/", wrap(async (req, res) => {
  const q = str(req.query.q).toLowerCase(), only = req.query.only === "fail" ? "fail" : "";
  const rows = (await query(`SELECT e.*, u.email FROM login_events e LEFT JOIN users u ON u.id=e.user_id
    WHERE ($1 = '' OR lower(coalesce(u.email, e.identity, '')) LIKE '%' || $1 || '%') AND ($2 = '' OR NOT e.ok) ORDER BY e.at DESC LIMIT 300`, [q, only])).rows;
  res.send(page({ title: "Sign-in activity", tab: "people", user: req.user, flash: flashFrom(req), xwide: true,
    body: `<div class="page-top"><h1 class="page-title">Sign-in activity <span class="h-sub">latest 300</span></h1><a class="btn-ghost" href="/admin/settings/app">← App settings</a></div>
    <section class="panel">
      <form method="get" class="dir-filters"><input type="search" name="q" value="${esc(q)}" placeholder="Email or phone…"><label class="radio-row"><input type="checkbox" name="only" value="fail"${only ? " checked" : ""}> Only problems</label><button class="btn-ghost" type="submit">Filter</button></form>
      ${rows.length ? `<div class="table-wrap"><table class="dir-table"><thead><tr><th>When</th><th>Who</th><th>How</th><th>Result</th><th>Device</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="fine">${esc(fmtDateTime(r.at))}</td><td>${esc(r.email || r.identity || "—")}</td><td>${esc(r.method)}</td>
          <td>${r.ok ? `<span class="r-yes">✓ Signed in</span>` : `<span class="r-no">✗ ${esc(r.reason || "failed")}</span>`}</td><td class="fine">${esc(r.device || "")}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">No sign-in attempts${q || only ? " match" : " yet"}.</p>`}
    </section>` }));
}));
module.exports = router;
