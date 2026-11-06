// App Settings → People → Email log: every email the app tried to send, and what happened (admins only)
const express = require("express");
const auth = require("../auth");
const { esc } = require("../views/layout");
const { page } = require("../views/admin");
const { fmtDateTime } = require("../time");
const { wrap, flashFrom, str, int } = require("./util");
const L = require("../emailLog");
const router = express.Router();
router.use(auth.requireAdmin);
const STATUS = [["sent", "Sent"], ["delivered", "Delivered"], ["bounced", "Bounced / spam"], ["failed", "Failed"], ["held", "Held (Sign in as)"], ["not sent", "Not sent"]];
const DELIVERY = { delivered: ["Delivered", "ok"], opened: ["Delivered · opened", "ok"], clicked: ["Delivered · link clicked", "ok"], bounced: ["Bounced", "bad"], complained: ["Marked as spam", "bad"],
  delivery_delayed: ["Delayed", "warn"], sent: ["Sent (not confirmed yet)", ""], queued: ["Queued", ""], scheduled: ["Scheduled", ""], canceled: ["Canceled", "bad"] };
function result(r) {
  if (r.status === "failed") return `<span class="em-s bad">Failed</span><span class="em-why">${esc(r.error || "")}</span>`;
  if (r.status === "held") return `<span class="em-s">Held</span><span class="em-why">An admin was using Sign in as, so it wasn't sent.</span>`;
  if (r.status === "not sent") return `<span class="em-s warn">Not sent</span><span class="em-why">${esc(r.error || "")}</span>`;
  const d = DELIVERY[r.delivery] || null;
  return `<span class="em-s ${d ? d[1] : ""}" data-em="${r.id}">${d ? esc(d[0]) : "Sent"}</span>${r.delivery === "bounced" ? `<span class="em-why">The address doesn't accept mail. Check it for typos.</span>` : r.delivery === "complained" ? `<span class="em-why">They marked it as spam.</span>` : ""}
    ${r.resend_id ? `<button type="button" class="link-dark em-chk" data-id="${r.id}">${r.checked_at ? "Check again" : "Check delivery"}</button>` : ""}`;
}
router.get("/", wrap(async (req, res) => {
  const T = require("../emailTemplates").TEMPLATES;
  const f = { q: str(req.query.q).slice(0, 80), key: T.some((t) => t.key === req.query.key) ? req.query.key : "", status: STATUS.some(([k]) => k === req.query.status) ? req.query.status : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "") ? req.query.from : "", to: /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || "") ? req.query.to : "" };
  const nameOf = (k) => ((T.find((t) => t.key === k) || {}).name || k || "—");
  const qs = (x = {}) => new URLSearchParams(Object.entries({ ...f, ...x }).filter(([, v]) => v)).toString();
  if (req.query.format === "csv") {
    const rows = await L.list({ ...f, limit: 5000 }), c = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="email-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send("\ufeff" + [["When", "To", "Email", "Subject", "Result", "Delivery", "Why"].join(","), ...rows.map((r) => [fmtDateTime(r.at), r.to_addr, nameOf(r.email_key), r.subject, r.status, (DELIVERY[r.delivery] || [r.delivery || ""])[0], r.error].map(c).join(","))].join("\n") + "\n");
  }
  const rows = await L.list({ ...f, limit: 300 });
  const tools = `<form method="get" action="/admin/email-log" class="act-f">
    <input type="search" name="q" value="${esc(f.q)}" placeholder="Search an email address or subject…" aria-label="Search">
    <select name="key" aria-label="Which email"><option value="">Every email</option>${T.map((t) => `<option value="${t.key}"${f.key === t.key ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
    <select name="status" aria-label="Result"><option value="">Any result</option>${STATUS.map(([k, l]) => `<option value="${k}"${f.status === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
    <label class="act-d">From<input type="date" name="from" value="${esc(f.from)}"></label><label class="act-d">To<input type="date" name="to" value="${esc(f.to)}"></label>
    <button class="sb-btn" type="submit">Filter</button>${qs() ? `<a class="link-dark" href="/admin/email-log">Clear</a>` : ""}
    ${rows.some((r) => r.resend_id) ? `<button type="button" class="sb-btn" id="em-all">Check delivery for all shown</button>` : ""}<a class="sb-btn" href="/admin/email-log?${qs({ format: "csv" })}">⇩ Download CSV</a></form>`;
  const head = await require("../views/apphead").head({ active: "emaillog" });
  res.send(page({ title: "Email log", tab: "people", user: req.user, flash: flashFrom(req), xwide: true,
    body: `${head}<div class="sub-top"><h2>Email log <span class="h-sub">newest first · latest 300</span></h2></div>
    <section class="panel">${tools}
      ${rows.length ? `<div class="table-wrap"><table class="dir-table act-t em-t"><thead><tr><th>When</th><th>To</th><th>Email</th><th>Result</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="fine" data-sort="${new Date(r.at).toISOString()}">${esc(fmtDateTime(r.at))}</td><td><a href="/admin/email-log?q=${encodeURIComponent(r.to_addr)}">${esc(r.to_addr)}</a></td>
          <td><b>${esc(nameOf(r.email_key))}</b><span class="em-why">${esc(r.subject || "")}</span></td><td class="em-res" id="em-${r.id}">${result(r)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">No emails ${qs() ? "match those filters" : "sent yet"}.</p>`}
      <p class="fine">Sent means Resend accepted it. <b>Check delivery</b> asks Resend what happened next: Delivered (in their mailbox, so have them check spam or other folders), Bounced (the address doesn't accept mail), Marked as spam, or Delayed. Kept for a year.</p>
    </section>
    <script>(function () {
      function check(id) { return fetch("/admin/email-log/" + id + "/check", { method: "POST", headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (j) { if (j.html) document.getElementById("em-" + id).innerHTML = j.html; }); }
      document.addEventListener("click", function (e) { var b = e.target.closest(".em-chk"); if (b) { b.disabled = true; b.textContent = "Checking…"; check(b.dataset.id); } });
      var all = document.getElementById("em-all"); if (all) all.addEventListener("click", function () {
        var ids = [].map.call(document.querySelectorAll(".em-chk"), function (b) { return b.dataset.id; }), i = 0; all.disabled = true;
        (function next() { if (i >= ids.length) { all.textContent = "Checked"; return; } all.textContent = "Checking " + (i + 1) + " of " + ids.length + "…"; check(ids[i++]).finally(function () { setTimeout(next, 550); }); })();   // Resend allows about 2 a second
      });
    })();</script>` }));
}));
router.post("/:id/check", wrap(async (req, res) => { const r = await L.check(int(req.params.id)); res.json(r ? { ok: true, html: result(r) } : { ok: false }); }));
module.exports = router;
