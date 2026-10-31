// The public link for "Anyone with the link" boards: /s/<code>. No account needed.
// Visitors claim with name + email; the confirmation email has a private link to cancel.
const express = require("express");
const crypto = require("crypto");
const { query } = require("../db");
const E = require("../engine");
const v = require("../views/claim");
const { wrap, flashFrom, go, int, str } = require("./util");
const { slotName } = require("../time");

const router = express.Router();
const boardFor = async (code) => (await query(`SELECT * FROM schedules WHERE share_code=$1 AND archived_at IS NULL`, [String(code || "")])).rows[0] || null;
const base = (req) => process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
const clean = (x, n) => str(x).replace(/\s+/g, " ").slice(0, n);

router.get("/:code", wrap(async (req, res, next) => {
  const board = await boardFor(req.params.code);
  if (!board) return next();                              // not a new board: the old public page handles it
  if (board.claim_mode !== "public" || !board.published_at) return res.status(404).send(require("../views/auth").invalidLinkPage("Board links"));
  if (req.user) return res.redirect(`/b/${board.id}`);      // signed in: the regular sign-up page
  const view = await E.personView(board.id, { athleteId: 0, userId: null, member: null });
  const span = (await query(`SELECT min(starts_at) AS first, max(starts_at) AS last FROM board_items WHERE schedule_id=$1 AND canceled_at IS NULL AND starts_at IS NOT NULL`, [board.id])).rows[0];
  const mode = ["list", "cal"].includes(req.query.v) ? req.query.v : "list";
  const group = req.query.g === "day" ? "day" : "activity";
  res.send(v.boardPage({ user: null, flash: flashFrom(req), board, person: null, who: [], view, mode, span, group, guest: { code: req.params.code },
    filters: { act: str(req.query.act), grp: str(req.query.grp), show: req.query.show === "open" ? "open" : "" },
    month: /^\d{4}-\d{2}$/.test(str(req.query.m)) ? str(req.query.m) : null, day: null }));
}));

router.post("/:code/claim", wrap(async (req, res, next) => {
  const board = await boardFor(req.params.code);
  if (!board || board.claim_mode !== "public") return next();
  const b = req.body, auth = require("../auth");
  const back = str(b.back).startsWith(`/s/${req.params.code}`) ? str(b.back) : `/s/${req.params.code}`;
  const first = clean(b.first_name, 40), last = clean(b.last_name, 40), email = auth.normalizeEmail(b.email);
  if (!first || !last) return go(res, back, { err: "Enter your first and last name." });
  if (!auth.isValidEmail(email)) return go(res, back, { err: "Enter a valid email address, so we can send your confirmation." });
  const item = (await query(`SELECT * FROM board_items WHERE id=$1 AND schedule_id=$2`, [int(b.item), board.id])).rows[0];
  if (!item) return go(res, back, { err: "That spot isn't on this board." });
  // the person claiming: whoever already has this email in People, or a new adult (volunteer)
  let p = (await query(`SELECT * FROM athletes WHERE kind='adult' AND lower(email)=lower($1) AND archived_at IS NULL ORDER BY id LIMIT 1`, [email])).rows[0];
  if (!p) p = (await query(`INSERT INTO athletes (kind, first_name, last_name, email, roles) VALUES ('adult',$1,$2,$3,'{volunteer}') RETURNING *`, [first, last, email])).rows[0];
  else if (!p.first_name && !p.last_name) await query(`UPDATE athletes SET first_name=$2, last_name=$3 WHERE id=$1`, [p.id, first, last]);
  try {
    const c = await E.claim({ itemId: item.id, athleteId: p.id, userId: null, note: b.note, member: null });
    const t = crypto.randomBytes(24).toString("base64url");
    await query(`UPDATE board_claims SET cancel_token=$2 WHERE id=$1`, [c.id, t]);
    const cancelUrl = `${base(req)}/s/${req.params.code}/cancel/${t}`;
    await require("../engine/notify").claimed(c, null, cancelUrl);
    if (!process.env.RESEND_API_KEY) console.log(`[cancel link] ${email}: ${cancelUrl}`);
    go(res, back, { ok: `${c.status === "waitlisted" ? "You're on the waitlist for" : "You're signed up for"} ${slotName(item)}. We emailed ${email} a confirmation with a link to cancel.` });
  } catch (e) { if (e instanceof E.ClaimError) return go(res, back, { err: e.message.replace(/^Already claimed\.$/, "That email already has this spot.") }); throw e; }
}));

// the private cancel link from the confirmation email
async function claimByToken(code, token) {
  return (await query(`SELECT c.*, i.title, i.starts_at, i.ends_at, i.schedule_id, sc.name AS board_name, sc.share_code, a.first_name, a.last_name
    FROM board_claims c JOIN board_items i ON i.id=c.item_id JOIN schedules sc ON sc.id=i.schedule_id JOIN athletes a ON a.id=c.athlete_id
    WHERE c.cancel_token=$1 AND sc.share_code=$2`, [String(token || ""), String(code || "")])).rows[0] || null;
}
router.get("/:code/cancel/:token", wrap(async (req, res) => {
  const c = await claimByToken(req.params.code, req.params.token);
  if (!c) return res.status(404).send(require("../views/auth").invalidLinkPage("Cancel links"));
  const chain = await E.chainFor(c.item_id), dl = chain && E.cancelDeadline(chain.item, E.effective(chain));
  res.send(require("../views/claim").guestCancelPage({ c, code: req.params.code, token: req.params.token, tooLate: dl && new Date() > dl, board: chain.board }));
}));
router.post("/:code/cancel/:token", wrap(async (req, res) => {
  const c = await claimByToken(req.params.code, req.params.token);
  if (!c) return res.status(404).send(require("../views/auth").invalidLinkPage("Cancel links"));
  if (c.status === "canceled") return go(res, `/s/${req.params.code}`, { ok: "That spot was already canceled." });
  try {
    const r = await E.cancel({ claimId: c.id });
    await require("../engine/notify").canceled(r, null);
    go(res, `/s/${req.params.code}`, { ok: `Canceled ${slotName(c)}. The spot is open for someone else now.` });
  } catch (e) { if (e instanceof E.ClaimError) return go(res, `/s/${req.params.code}/cancel/${req.params.token}`, { err: e.message }); throw e; }
}));

module.exports = router;
