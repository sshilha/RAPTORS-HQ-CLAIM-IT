// Shadow mode routes: start (admins), continue as the chosen person, held emails, exit
const express = require("express");
const auth = require("../auth");
const SH = require("../shadow");
const { query } = require("../db");
const { wrap, go, int } = require("./util");
const { esc } = require("../views/layout");
const router = express.Router();

// start: from App Settings → Accounts & sign-in → Sign in as, or a person's page in People
router.post("/admin/shadow/start", wrap(async (req, res) => {
  if (req.shadow || !auth.isAdmin(req.user)) return res.status(404).send("Not found");
  const uid = req.body.user_id === "visitor" ? null : int(req.body.user_id);
  if (req.body.user_id !== "visitor") {
    const u = uid && (await query(`SELECT id FROM users WHERE id=$1`, [uid])).rows[0];
    if (!u) return go(res, "/admin/settings/app?part=shadow", { err: "Pick someone who can sign in." });
  }
  await SH.start(req, res, uid);
  res.redirect("/");   // the sign-in screen, as they'd see it
}));
// on the sign-in screen: continue as the chosen person, no password
router.post("/shadow/continue", wrap(async (req, res) => {
  if (!req.shadow || !req.shadow.pending_user_id) return res.redirect("/");
  await require("../accounts").signedIn(req, res, req.shadow.pending_user_id, "admin, no password");
}));
router.all("/shadow/exit", wrap(async (req, res) => { await SH.exit(req, res); res.redirect("/admin/settings/app?part=shadow"); }));
// the emails held while in shadow mode
router.get("/shadow/outbox", wrap(async (req, res) => {
  if (!req.shadow) return res.redirect("/");
  const mail = await SH.outbox(req.shadow.id), q = req.query, when = (d) => new Date(d).toLocaleString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
  const unsent = mail.filter((m) => !m.sent_at || /\(test\)$/.test(m.sent_to || "")).length;
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Held emails</title><link rel="stylesheet" href="/styles.css"></head>
  <body class="sh-ob"><div class="sh-ob-wrap"><div class="sh-ob-h"><h1>Emails held in shadow mode</h1><a class="sb-btn" href="/dashboard">← Back to the app</a></div>
  ${q.ok ? `<p class="sh-ob-ok">${esc(q.ok)}</p>` : ""}${q.err ? `<p class="sh-ob-err">${esc(q.err)}</p>` : ""}
  <p class="fine">Nothing here has been sent unless it says so. <b>Send to me</b> sends a copy to you (${esc(req.realUser.email)}) marked [Shadow test]. <b>Send to them</b> sends it to the real recipients, as if shadow mode were off.</p>
  ${unsent > 1 ? `<form method="post" action="/shadow/outbox/all" class="sh-ob-all" onsubmit="return confirm('Send all ${unsent} unsent emails to their real recipients?');"><button class="sb-btn" type="submit">Send all ${unsent} to them</button></form>` : ""}
  ${mail.length ? mail.map((m) => `<details class="sh-ob-m"${q.open == m.id ? " open" : ""}><summary><b>${esc(m.subject)}</b> <span class="fine">to ${esc(m.to_addr)} · ${esc(when(m.created_at))}</span>
      ${m.sent_at ? `<span class="st-pill ${/\(test\)$/.test(m.sent_to) ? "info" : "ok"}">Sent to ${esc(m.sent_to)} · ${esc(when(m.sent_at))}</span>` : `<span class="st-pill plain">Held</span>`}</summary>
    <div class="sh-ob-acts"><form method="post" action="/shadow/outbox/${m.id}/send"><input type="hidden" name="to" value="me"><button class="sb-btn" type="submit">Send to me</button></form>
      <form method="post" action="/shadow/outbox/${m.id}/send" onsubmit="return confirm('This goes to ${esc(String(m.to_addr || "").replace(/'/g, ""))}. Send it?');"><input type="hidden" name="to" value="them"><button class="sb-btn primary" type="submit">${m.sent_at && !/\(test\)$/.test(m.sent_to) ? "Send to them again" : "Send to them"}</button></form></div>
    <iframe sandbox="allow-popups allow-top-navigation-by-user-activation" srcdoc="${esc(m.html || `<pre>${esc(m.text || "")}</pre>`)}"></iframe></details>`).join("") : `<p class="muted">No emails held yet.</p>`}
  </div></body></html>`);
}));
const back = (res, q) => res.redirect(`/shadow/outbox?${new URLSearchParams(q)}`);
router.post("/shadow/outbox/:id(\\d+)/send", wrap(async (req, res) => {
  if (!req.shadow) return res.redirect("/");
  try { const to = await SH.sendHeld(req, int(req.params.id), req.body.to === "me"); back(res, { ok: `Sent to ${to.join(", ")}.`, open: req.params.id }); }
  catch (e) { back(res, { err: e.message, open: req.params.id }); }
}));
router.post("/shadow/outbox/all", wrap(async (req, res) => {
  if (!req.shadow) return res.redirect("/");
  const mail = (await SH.outbox(req.shadow.id)).filter((m) => !m.sent_at || /\(test\)$/.test(m.sent_to || ""));
  let n = 0; for (const m of mail) { try { await SH.sendHeld(req, m.id, false); n++; } catch (e) { console.error("shadow send:", e.message); } }
  back(res, { ok: `Sent ${n} email${n === 1 ? "" : "s"} to their real recipients.` });
}));
module.exports = router;
