// npm run check: a quick health check you can run on your own computer after any change.
// Starts its own copy of the app (port 3999, your local database from .env), signs in as the first ADMIN_EMAILS admin,
// loads every main page, and reports. It only reads pages; it doesn't change any boards, people or claims.
const { spawn } = require("child_process");
const path = require("path");
const PORT = process.env.CHECK_PORT || 3999, BASE = `http://localhost:${PORT}`;
const admin = String(process.env.ADMIN_EMAILS || "").split(",")[0].trim().toLowerCase();
if (!process.env.DATABASE_URL || !admin) { console.error("Needs DATABASE_URL and ADMIN_EMAILS (run it with: npm run check)."); process.exit(1); }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const app = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT), NO_REMINDERS: "1", DEV_SHOW_LINK: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; app.stdout.on("data", (d) => (log += d)); app.stderr.on("data", (d) => (log += d));
  const stop = () => { try { app.kill(); } catch (e) {} };
  try {
    for (let i = 0; i < 60 && !/running on port/.test(log); i++) await wait(250);
    if (!/running on port/.test(log)) throw new Error("The app didn't start:\n" + log.slice(-800));
    // sign in as the admin (a session, the same as a sign-in link would make)
    const { query, pool } = require("../src/db"), auth = require("../src/auth");
    const u = (await query(`SELECT id FROM users WHERE lower(email)=$1`, [admin])).rows[0];
    if (!u) throw new Error(`${admin} hasn't signed in to this database yet. Sign in once, then run the check again.`);
    let cookie = ""; await auth.createSession({ cookie: (n, v) => (cookie = `${n}=${v}`) }, u.id);
    const board = (await query(`SELECT id FROM schedules WHERE archived_at IS NULL ORDER BY id LIMIT 1`)).rows[0];
    const item = board && (await query(`SELECT id FROM board_items WHERE schedule_id=$1 ORDER BY id LIMIT 1`, [board.id])).rows[0];
    const person = (await query(`SELECT id FROM athletes WHERE archived_at IS NULL ORDER BY id LIMIT 1`)).rows[0];
    const code = (await query(`SELECT share_code FROM schedules WHERE share_code IS NOT NULL AND archived_at IS NULL LIMIT 1`)).rows[0];
    const pages = [["My Claims", "/dashboard"], ["My Account", "/account"], ["All Boards", "/admin/settings"], ["Create Board", "/admin/setup/new"],
      ["People", "/admin/people"], ["Import", "/admin/people/import"], ["Clean up", "/admin/people/cleanup"], ["Communication", "/admin/people/communication"],
      ["Requests", "/admin/requests"], ["Accounts", "/admin/settings/app?part=accounts"], ["Administrators", "/admin/settings/app?part=admins"], ["Sign-in activity", "/admin/signins"],
      ["Sign in as", "/admin/settings/app?part=shadow"], ["Locations", "/admin/settings/app?part=places"], ["Wording", "/admin/settings/app?part=labels"],
      ["Pictures", "/admin/settings/app?part=pictures"], ["Old data", "/admin/settings/app?part=olddata"], ["Check-in", "/checkin"], ["Reports", "/reports"]];
    if (board) pages.push(["Board setup", `/admin/setup?s=${board.id}`], ["Board details", `/admin/setup?s=${board.id}&tab=details`], ["Access & people", `/admin/members?s=${board.id}`],
      ["Board defaults", `/admin/setup/schedule?s=${board.id}`], ["Notifications", `/admin/setup/notifications?s=${board.id}`], ["Sign-up page (preview)", `/b/${board.id}?preview=1`],
      ["Duplicate", `/admin/setup/schedules/${board.id}/copy`]);
    if (item) pages.push(["A session's People", `/admin/b/${board.id}/items/${item.id}/people`], ["A session's check-in", `/checkin/i/${item.id}`]);
    if (person) pages.push(["A person", `/admin/people/${person.id}`], ["Merge", `/admin/people/${person.id}/merge`]);
    if (code) pages.push(["Public link (as a visitor)", `/s/${code.share_code}`, "visitor"], ["Sign-in page (as a visitor)", "/", "visitor"]);
    let bad = 0;
    for (const [name, url, as] of pages) {
      const r = await fetch(BASE + url, { headers: as === "visitor" ? {} : { cookie }, redirect: "manual" });
      const text = r.status === 200 ? await r.text() : "";
      const ok = r.status === 200 && !/Something went wrong/.test(text);
      if (!ok) bad++;
      console.log(`${ok ? "  ok  " : "  FAIL"}  ${name.padEnd(24)} ${url}${ok ? "" : `  (${r.status}${r.headers.get("location") ? " → " + r.headers.get("location") : ""})`}`);
    }
    await query(`DELETE FROM sessions WHERE user_id=$1 AND created_at > now() - interval '5 minutes' AND expires_at > now()`, [u.id]).catch(() => {});
    const errors = log.split("\n").filter((l) => /error/i.test(l) && !/^\s*$/.test(l));
    console.log(`\n${pages.length - bad} of ${pages.length} pages ok${errors.length ? ` · ${errors.length} server error line(s):\n  ${errors.slice(0, 5).join("\n  ")}` : " · no server errors"}`);
    await pool.end(); stop(); process.exit(bad || errors.length ? 1 : 0);
  } catch (e) { console.error("Check failed:", e.message); stop(); process.exit(1); }
}
main();
