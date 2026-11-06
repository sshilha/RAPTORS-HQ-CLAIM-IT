const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { migrate } = require("./db");
const auth = require("./auth");
const { errorPage } = require("./views/layout");

const app = express();
app.set("trust proxy", 1); // Railway sits behind a proxy
app.use(express.urlencoded({ extended: false, limit: "15mb" })); // room for uploaded schedule PDFs
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(auth.loadUser);
app.use(require("./shadow").middleware);   // shadow mode: an admin using the app as someone else (see src/shadow.js)
app.use(require("./routes/shadow"));
app.use(require("./activity").middleware);
app.use(require("./presence").middleware);   // who's on now, and which boards people have opened   // the activity log (App Settings → Accounts & sign-in → Activity)
// pages always show current data: no saved copies (Back button, reopened tabs), and nothing to see after signing out
app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use((req, res, next) => {   // finish the Welcome step first (password etc.), then the rest of the app
  if (!req.user || !require("./accounts").mustSetUp(req.user)) return next();
  if (/^\/(welcome|logout|account\/email\/confirm|img\/|favicon|.*\.(css|js|png|jpg|svg|ico|webmanifest)$)/.test(req.path)) return next();
  if (req.method !== "GET") return res.status(403).send("Finish setting up your account first.");
  res.redirect("/welcome");
});
// Coaches (not admins) get a Check-in link; remember that on the signed-in user
app.use(async (req, res, next) => {
  try { if (req.user && !auth.isAdmin(req.user)) req.user.is_coach = await require("./attendance").isCoach(req.user); next(); } catch (e) { next(e); }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(require("./routes/auth"));
// Every admin page knows which schedule you're working in (?s=, else your last one)
app.use("/admin", async (req, res, next) => {
  try {
    if (req.user && auth.isAdmin(req.user)) { req.sched = await require("./schedules").current(req, res); req.user.sched = req.sched; }
    next();
  } catch (e) { next(e); }
});
app.use("/admin/b", require("./routes/board")); // container engine actions
app.use("/admin/people", require("./routes/people")); // ⚙ App settings → People
app.use("/admin/requests", require("./routes/requests")); // family / change requests to approve
app.use("/admin/signins", require("./routes/signins")); // sign-in history for troubleshooting
app.use("/admin/activity", require("./routes/activity")); // the activity log: who did what, when
app.use("/admin/email-log", require("./routes/emailLog")); // every email sent, and what happened
app.use("/admin/online", require("./routes/online")); // who's on now
app.use("/checkin", require("./routes/checkin2")); // check-in on the new boards
app.use("/account", require("./routes/account")); // My Account
app.use("/admin/setup", require("./routes/setup"));
app.use("/admin/members", require("./routes/members"));
app.use("/admin/settings", require("./routes/settings"));
// old (pre-rebuild) addresses: send bookmarks somewhere sensible
app.get("/admin", (req, res) => res.redirect("/admin/settings"));
app.get(["/admin/rounds*", "/admin/seasons*", "/admin/programs*", "/admin/sessions*", "/admin/day*", "/admin/import*"], (req, res) => res.redirect("/admin/settings"));
app.get("/admin/athletes*", (req, res) => res.redirect("/admin/people"));
app.get("/admin/reports*", (req, res) => res.redirect("/reports"));
app.get(["/athletes*", "/request-change"], (req, res) => res.redirect("/dashboard"));
app.get("/admin/settings/archived", (req, res) => res.redirect("/admin/settings?tab=arch"));
// Board pictures
app.get("/img/board/:id", require("./routes/util").wrap(async (req, res) => {
  const r = (await require("./db").query(`SELECT image FROM schedules WHERE id=$1`, [parseInt(req.params.id, 10) || 0])).rows[0];
  const m = r && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(r.image || "");
  if (!m) return res.redirect("/claim-it-logo-sm.png");
  res.set("Content-Type", m[1]).set("Cache-Control", "public, max-age=604800").send(Buffer.from(m[2], "base64"));
}));
// "Add to calendar" from claim emails: a signed link, no sign-in needed
app.get("/cal/:token.ics", require("./routes/util").wrap(async (req, res) => {
  const C = require("./calendar"), id = await C.verify(req.params.token); const body = id && await C.ics(id);
  if (!body) return res.status(404).send("Not found");
  res.set("Content-Type", "text/calendar; charset=utf-8").set("Content-Disposition", `attachment; filename="claim-${id}.ics"`).send(body);
}));
// App pictures (My Claims header bars)
app.get("/img/app/:key", require("./routes/util").wrap(async (req, res) => {
  const r = await require("./appimages").get(String(req.params.key));
  const m = r && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(r.data || "");
  if (!m) return res.status(404).end();
  res.set("Content-Type", m[1]).set("Cache-Control", "public, max-age=604800").send(Buffer.from(m[2], "base64"));
}));
app.use(require("./routes/claim")); // My Claims on the container engine (before the old family pages)
app.use("/reports", require("./routes/reports2")); // reports on the engine (admins + people given access)
app.use("/s", require("./routes/publicBoard")); // public links for new boards (falls through to the old ones)

app.use((req, res) => res.status(404).send(errorPage("That page doesn't exist.")));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(errorPage("The server hit an error. Try again, and contact the Raptors if it keeps happening."));
});

async function start() {
  await migrate();
  await require("./catalog").load(); // activities, age groups, shortcuts, locations
  await require("./schedules").ensureDefault(); // existing data becomes the first schedule
  await auth.loadAdmins();
  await require("./engine/schema").migrate(); // containers, items, claims (the new engine)
  await require("./people").migrate(); // the People directory fields
  await require("./accounts").migrate(); // passwords, codes, family requests
  { const n = await require("./engine").recountClaims(); if (n) console.log(`Recounted claims: ${n} fixed`); }
  await require("./locations").migrate(); // saved places (names from older lists, addresses added in ⚙ App)
  setInterval(() => auth.cleanupExpired().catch((e) => console.error(e.message)), 60 * 60 * 1000);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log(`${require("./config").LABELS.app_name} running on port ${PORT}`));
  require("./reminders").start();
  require("./activity").ensure().catch((e) => console.error("activity log:", e.message));   // the log table (and its one-time fill from past claims) before any request   // day-before reminders (Board → Notifications)
}

module.exports = { app, start };
