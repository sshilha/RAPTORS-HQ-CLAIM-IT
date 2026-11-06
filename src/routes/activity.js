// App Settings → Accounts & sign-in → Activity: who did what, for whom, where and when (admins only)
const express = require("express");
const { query } = require("../db");
const auth = require("../auth");
const { esc } = require("../views/layout");
const { page } = require("../views/admin");
const { fmtDateTime } = require("../time");
const { wrap, flashFrom, str, int } = require("./util");
const A = require("../activity");
const router = express.Router();
router.use(auth.requireAdmin);
const VIA = { app: "App", admin: "Admin", "public link": "Public link", "Sign in as": "Sign in as", link: "Email link", password: "Password", code: "Admin code" };
function filtersOf(q) {
  return { q: str(q.q).slice(0, 80), board: int(q.board), kind: A.KINDS.some(([k]) => k === q.kind) ? q.kind : "", from: /^\d{4}-\d{2}-\d{2}$/.test(q.from || "") ? q.from : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(q.to || "") ? q.to : "", problems: q.problems === "1" };
}
const qs = (f, extra = {}) => new URLSearchParams(Object.entries({ ...f, problems: f.problems ? "1" : "", ...extra }).filter(([, v]) => v !== "" && v != null && v !== false)).toString();
router.get("/", wrap(async (req, res) => {
  const f = filtersOf(req.query), shown = Math.min(int(req.query.n) || 200, 2000);
  if (req.query.format === "csv") {
    const rows = await A.list({ ...f, limit: 5000 });
    const c = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send("\ufeff" + [["When", "Who", "What", "About", "Board", "Kind", "How", "Result"].join(","),
      ...rows.map((r) => [fmtDateTime(r.at), r.actor, r.summary, r.person, r.board, (A.KINDS.find(([k]) => k === r.kind) || [0, r.kind])[1], VIA[r.via] || r.via, r.ok ? "OK" : "Problem"].map(c).join(","))].join("\n") + "\n");
  }
  const rows = await A.list({ ...f, limit: shown + 1 }), more = rows.length > shown;
  const boards = (await query(`SELECT id, name FROM schedules WHERE archived_at IS NULL ORDER BY lower(name)`)).rows;
  const tools = `<form method="get" action="/admin/activity" class="act-f">
    <input type="search" name="q" value="${esc(f.q)}" placeholder="Search a person, email or words…" aria-label="Search">
    <select name="board" aria-label="Board"><option value="">Every board</option>${boards.map((b) => `<option value="${b.id}"${f.board === b.id ? " selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
    <select name="kind" aria-label="Kind of action"><option value="">Everything</option>${A.KINDS.map(([k, l]) => `<option value="${k}"${f.kind === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
    <label class="act-d">From<input type="date" name="from" value="${esc(f.from)}"></label><label class="act-d">To<input type="date" name="to" value="${esc(f.to)}"></label>
    <label class="radio-row"><input type="checkbox" name="problems" value="1"${f.problems ? " checked" : ""}> Only problems</label>
    <button class="sb-btn" type="submit">Filter</button>${qs(f) ? `<a class="link-dark" href="/admin/activity">Clear</a>` : ""}
    <a class="sb-btn" href="/admin/activity?${qs(f, { format: "csv" })}">⇩ Download CSV</a></form>`;
  const head = await require("../views/apphead").head({ active: "activity" });
  const kindL = (k) => (A.KINDS.find(([x]) => x === k) || [0, ""])[1];
  res.send(page({ title: "Activity", tab: "people", user: req.user, flash: flashFrom(req), xwide: true,
    body: `${head}<div class="sub-top"><h2>Activity <span class="h-sub">newest first${rows.length ? ` · ${Math.min(rows.length, shown)}${more ? "+" : ""} shown` : ""}</span></h2></div>
    <section class="panel">${tools}
      ${rows.length ? `<div class="table-wrap"><table class="dir-table act-t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Board</th><th>How</th></tr></thead><tbody>
        ${rows.slice(0, shown).map((r) => `<tr class="${r.ok ? "" : "act-bad"}"><td class="fine" data-sort="${new Date(r.at).toISOString()}">${esc(fmtDateTime(r.at))}</td><td>${esc(r.actor || "—")}</td>
          <td><span class="act-k k-${esc(r.kind)}">${esc(kindL(r.kind))}</span> ${r.ok ? "" : "<b class=\"r-no\">Problem:</b> "}${esc(r.summary || "")}${(() => { if (!r.item_starts && !r.item_title) return ""; const slot = require("../time").slotName({ title: r.item_title, starts_at: r.item_starts, ends_at: r.item_ends });
            const shortT = r.item_starts ? require("../time").slotName({ title: "", starts_at: r.item_starts, ends_at: r.item_ends }) : "";
            return (r.summary || "").includes(shortT || slot) ? "" : ` <span class="fine">· ${esc([r.item_level, slot].filter(Boolean).join(", "))}</span>`; })()}${r.person && !(r.summary || "").includes(r.person) ? ` <span class="fine">· ${r.athlete_id ? `<a href="/admin/people/${r.athlete_id}">${esc(r.person)}</a>` : esc(r.person)}</span>` : ""}</td>
          <td>${r.board ? `<a href="/admin/activity?${qs({ ...f, board: r.board_id })}">${esc(r.board)}</a>` : `<span class="fine">—</span>`}</td><td class="fine">${esc(VIA[r.via] || r.via || "")}</td></tr>`).join("")}</tbody></table></div>
        ${more ? `<p class="act-more"><a class="sb-btn" href="/admin/activity?${qs(f, { n: shown + 300 })}">Show more</a></p>` : ""}`
        : `<p class="muted">Nothing ${qs(f) ? "matches those filters" : "recorded yet"}.</p>`}
      <p class="fine">Every change made in Claim It: claims and cancels, RSVPs, check-in, board and People changes, requests, account changes and settings, plus sign-ins. Kept for a year.</p>
    </section>` }));
}));
module.exports = router;
