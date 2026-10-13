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

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(require("./routes/auth"));
app.use("/admin/import", require("./routes/import"));
app.use("/admin/rounds", require("./routes/rounds"));
app.use("/admin/seasons", require("./routes/seasons"));
app.use("/admin/reports", require("./routes/reports"));
app.use("/admin", require("./routes/admin"));
app.use(require("./routes/parent"));

app.use((req, res) => res.status(404).send(errorPage("That page doesn't exist.")));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(errorPage("The server hit an error. Try again, and contact the Raptors if it keeps happening."));
});

async function start() {
  await migrate();
  setInterval(() => auth.cleanupExpired().catch((e) => console.error(e.message)), 60 * 60 * 1000);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log(`Raptors Training running on port ${PORT}`));
}

module.exports = { app, start };
