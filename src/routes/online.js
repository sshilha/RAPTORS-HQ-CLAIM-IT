// App Settings → Accounts & sign-in → On now: who's used the app in the last 15 minutes, and what they're looking at
const express = require("express");
const auth = require("../auth");
const { esc } = require("../views/layout");
const { page } = require("../views/admin");
const { wrap, flashFrom } = require("./util");
const P = require("../presence");
const router = express.Router();
router.use(auth.requireAdmin);
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - new Date(t)) / 1000)); return s < 60 ? "just now" : `${Math.round(s / 60)} min ago`; };
function table(rows) {
  if (!rows.length) return `<p class="muted">No one has used the app in the last 15 minutes.</p>`;
  return `<div class="table-wrap"><table class="dir-table act-t"><thead><tr><th>Who</th><th>Looking at</th><th>Last active</th><th>Device</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${esc(r.name || r.email)}</b>${r.name ? `<span class="em-why">${esc(r.email)}</span>` : ""} ${auth.isAdmin(r) ? `<span class="act-k">Admin</span>` : r.coach ? `<span class="act-k k-checkin">Coach</span>` : r.parent ? `<span class="act-k k-claims">Parent/guardian</span>` : ""}</td>
      <td>${esc(r.page)}</td><td class="fine" data-sort="${new Date(r.last_seen_at).toISOString()}">${esc(ago(r.last_seen_at))}</td><td class="fine">${esc(r.last_seen_device || "")}</td></tr>`).join("")}</tbody></table></div>`;
}
router.get("/", wrap(async (req, res) => {
  const rows = await P.onNow(15);
  if ((req.get("accept") || "").includes("json")) return res.json({ n: rows.length, html: table(rows) });
  const head = await require("../views/apphead").head({ active: "online" });
  res.send(page({ title: "On now", tab: "people", user: req.user, flash: flashFrom(req), xwide: true,
    body: `${head}<div class="sub-top"><h2>On now <span class="h-sub" id="on-n">${rows.length} in the last 15 minutes · updates by itself</span></h2></div>
    <section class="panel"><div id="on-t">${table(rows)}</div>
      <p class="fine">Anyone who has opened a page in the last 15 minutes, with the page they're on. Sign in as sessions aren't counted.</p></section>
    <script>setInterval(function () { fetch("/admin/online", { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (j) {
      document.getElementById("on-t").innerHTML = j.html; document.getElementById("on-n").textContent = j.n + " in the last 15 minutes · updates by itself"; }); }, 30000);</script>` }));
}));
module.exports = router;
