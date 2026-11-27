// The gate in front of administrator pages: which function (App Settings → Roles) each address needs, at what level,
// and on which board. Administrators always pass. An address not listed here stays administrator-only.
// Opening a page (GET) needs View only on "vf" functions; changing anything needs Full. "yn" functions need Yes.
// View-only visitors get the page with a "View only" banner and its forms switched off (views/admin.js).
const R = require("./roles");
const sidQ = (req) => Number(req.query.s) || Number(req.body && (req.body.s || req.body.schedule_id)) || null;
const PART = { accounts: "accounts.settings", admins: "accounts.admins", shadow: "accounts.signinas", places: "org.locations", labels: "org.wording", pictures: "org.pictures", olddata: "org.olddata" };
// [method ("*" = any), path regex (after /admin), function, board: "q" (?s=) | number (regex group) | null]
const RULES = [
  // Claim Boards: the boards list, creating boards
  ["GET", /^\/settings\/?$/, "boards.any", null], ["GET", /^\/settings\/archived$/, "board.archive", null],
  ["GET", /^\/setup\/new$/, "boards.create", null], ["POST", /^\/setup\/schedules$/, "boards.create", null], ["*", /^\/setup\/import(\/preview)?$/, "boards.create", null],
  // a board's tabs
  ["GET", /^\/setup\/?$/, (req) => (req.query.tab === "details" ? "board.details" : "board.setup"), "q"], ["GET", /^\/setup\/rules$/, "board.defaults", "q"],
  ["*", /^\/setup\/questions(\/.*)?$/, "board.questions", "q"], ["*", /^\/setup\/notifications$/, "board.notify", "q"],
  ["POST", /^\/setup\/schedules\/(\d+)$/, "board.details", 1], ["POST", /^\/setup\/schedules\/(\d+)\/(locations|locations\/remove|coaches|coaches\/remove)$/, "board.details", 1],
  ["POST", /^\/setup\/schedules\/(\d+)\/depth$/, "board.setup", 1], ["POST", /^\/setup\/schedules\/(\d+)\/(attendance|family)$/, "board.defaults", 1],
  ["GET", /^\/setup\/schedules\/(\d+)\/export$/, "board.export", 1], ["*", /^\/setup\/schedules\/(\d+)\/copy$/, "board.copy", 1],
  ["POST", /^\/setup\/schedules\/(\d+)\/(archive|delete)$/, "board.archive", 1],
  ["*", /^\/members(\/.*)?$/, "board.access", "q"], ["*", /^\/settings\/(groups|tags|presets)(\/.*)?$/, "board.access", "q"], ["GET", /^\/settings\/activities$/, "board.access", "q"],
  // inside a board: levels and sessions, publishing, a session's People page
  ["POST", /^\/b\/(\d+)\/items\/\d+\/(cancel-session|reopen-session)$/, "session.cancel", 1],
  ["POST", /^\/b\/(\d+)\/publish$/, "board.publish", 1], ["GET", /^\/b\/(\d+)\/(qr\.svg|nodes\/\d+\/export)$/, "board.export", 1],
  ["POST", /^\/b\/(\d+)\/defaults$/, "board.defaults", 1],
  ["GET", /^\/b\/(\d+)\/items\/\d+\/people$/, "session.people", 1], ["POST", /^\/b\/(\d+)\/items\/\d+\/(people\/add|people\/\d+\/remove|rsvp-set|rsvp-remove|rsvp-remind)$/, "session.people", 1],
  ["*", /^\/b\/(\d+)\/(nodes(\/.*)?|items|items\/\d+|items\/\d+\/delete|import-level(\/.*)?|days|copy-day)$/, "board.setup", 1],
  // App settings
  ["*", /^\/settings\/app$/, (req) => PART[req.query.part] || "accounts.settings", null],
  ["*", /^\/settings\/(app\/accounts|app\/change-email)$/, "accounts.settings", null], ["*", /^\/settings\/admins(\/remove)?$/, "accounts.admins", null],
  ["*", /^\/settings\/places(\/.*)?$/, "org.locations", null], ["*", /^\/settings\/labels$/, "org.wording", null], ["*", /^\/settings\/app\/pictures$/, "org.pictures", null],
  ["*", /^\/settings\/old-data(\.zip|\/remove)$/, "org.olddata", null],
  ["GET", /^\/online\/?$/, "accounts.online", null], ["GET", /^\/activity\/?$/, "accounts.activity", null], ["GET", /^\/signins\/?$/, "accounts.signins", null],
  ["POST", /^\/shadow\/start$/, "accounts.signinas", null], ["*", /^\/email-log(\/.*)?$/, "comm.emaillog", null],
  ["POST", /^\/assess\/days\/\d+\/share$/, "assess.share", null], ["*", /^\/assess(\/.*)?$/, "assess.setup", null],
];
// Score entry lives outside /admin
const SCORE_RULES = [["*", /^\/assess\/days\/\d+(\/save)?$/, "assess.scores", null]];
const BOARD_PERMS = ["board.setup", "board.details", "board.access", "board.defaults", "board.notify", "board.questions", "board.publish", "board.export", "board.copy", "board.archive", "session.people"];
const anyBoard = (acc) => acc.admin || BOARD_PERMS.some((p) => { const b = acc.boards(p); return b.all || b.map.size > 0; });
const boardsAllowed = (acc) => { if (acc.admin) return null; const out = new Set(); let all = false;
  for (const p of BOARD_PERMS) { const b = acc.boards(p); if (b.all) all = true; for (const id of b.map.keys()) out.add(id); } return all ? null : out; };

function middleware(rules, base) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next();
      const acc = await R.forUser(req.user); req.access = acc;
      if (acc.admin) return next();
      const path = req.path.replace(/\/+$/, "") || "/", rule = rules.find(([m, re]) => (m === "*" || m === req.method) && re.test(path));
      if (!rule) return next();   // not listed: the area's own checks decide (administrators only, unless it has its own rules)
      const perm = typeof rule[2] === "function" ? rule[2](req) : rule[2];
      let ok, level;
      if (perm === "boards.any") { ok = anyBoard(acc); level = 1; }
      else {
        const kind = R.KIND[perm], need = req.method === "GET" && kind === "vf" ? 1 : 2;
        const sid = rule[3] === "q" ? sidQ(req) : typeof rule[3] === "number" ? Number(path.match(rule[1])[rule[3]]) : null;
        const lvAll = acc.boards(perm, 2).all ? 2 : acc.boards(perm, 1).all ? 1 : 0;   // an Everywhere role
        level = sid ? (acc.can(perm, sid, undefined, 2) ? 2 : acc.can(perm, sid, undefined, 1) ? 1 : 0) : rule[3] ? lvAll : acc.level(perm);   // a board page without a board: Everywhere roles only
        ok = level >= need;
      }
      if (!ok) return res.status(404).send("Not found");
      req.gatePassed = true; req.gatePerm = perm;
      if (req.method === "GET" && level < 2 && R.KIND[perm] === "vf") Object.defineProperty(req.user, "_ro", { value: true, configurable: true });
      next();
    } catch (e) { next(e); }
  };
}
module.exports = { admin: middleware(RULES), scores: middleware(SCORE_RULES), anyBoard, boardsAllowed, BOARD_PERMS };
