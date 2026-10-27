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
app.use("/admin/import", require("./routes/import"));
app.use("/admin/rounds", require("./routes/rounds"));
app.use("/admin/seasons", require("./routes/seasons"));
app.use("/admin/b", require("./routes/board")); // container engine actions
app.use("/admin/people", require("./routes/people")); // ⚙ App settings → People
app.use("/admin/setup", require("./routes/setup"));
app.use("/admin/members", require("./routes/members"));
app.use("/admin/settings", require("./routes/settings"));
app.use("/admin/day", require("./routes/roster"));
app.use("/admin/reports", require("./routes/reports"));
app.use("/admin", require("./routes/admin"));
app.use("/s", require("./routes/public")); // public sign-up sheets (no account needed)
app.use("/checkin", require("./routes/checkin")); // attendance (admins + coaches)
app.use(require("./routes/parent"));

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
  await require("./locations").migrate(); // saved places (names from older lists, addresses added in ⚙ App)
  setInterval(() => auth.cleanupExpired().catch((e) => console.error(e.message)), 60 * 60 * 1000);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log(`${require("./config").LABELS.app_name} running on port ${PORT}`));
}

module.exports = { app, start };
