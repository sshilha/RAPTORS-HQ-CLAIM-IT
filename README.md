# Raptors Claim It

Claim It is the Chippewa Valley Raptors' sign-up app. Admins build **Claim Boards** (training programs, volunteer
shifts, events); families and volunteers **claim** spots; coaches **check in** who came; admins see **reports**.

Stack: Node.js + Express, PostgreSQL, Resend (email). Hosted on Railway. No front-end build step: pages are rendered on
the server; `public/` holds the stylesheet, images and two small browser scripts.

---

## 1. Running it

### On Railway (production)

| Setting | What it's for |
|---|---|
| `DATABASE_URL` | The Railway Postgres database (reference it from the database service). |
| `APP_URL` | The app's address with `https://`, e.g. `https://claimit.chippewavalleyraptors.com`. Every emailed link, public link and QR code uses it. |
| `RESEND_API_KEY` | Sends email. Without it, emails are only written to the server log. |
| `EMAIL_FROM` | The sender, on your **verified** Resend domain, e.g. `Raptors Claim It <claimit@chippewavalleyraptors.com>`. The sender *name* can be changed in Communication → Branding. |
| `ADMIN_EMAILS` | Comma-separated emails that are always administrators (more can be added in App Settings). |
| `NODE_ENV` | `production` (secure cookies). |
| `DEV_SHOW_LINK` | **Must be `false` (or unset) in production.** When `true`, sign-in links are shown on screen (local testing only). |
| `GOOGLE_MAPS_API_KEY` | Optional: address suggestions when adding Locations (Places API New). |
| `NO_REMINDERS` | Optional: `1` turns off the reminder checker (local testing). |
| `ENV_LABEL` | **Staging only**, e.g. `STAGING`: a striped bar on every page, a faint watermark, `[STAGING]` in the tab title and in every email subject. Leave it unset in production. |

The database sets itself up on every start (tables and columns are added as needed). Railway runs `npm start`.

### On your computer

1. A `.env` file with `DATABASE_URL`, `APP_URL=http://localhost:3000`, `ADMIN_EMAILS`, `DEV_SHOW_LINK=true`.
2. `npm install`, then **`Start Claim It.bat`** or `npm run local` (restarts on code changes).
3. A local database: `npm run db` starts one in Docker (`docker-compose.yml`).

### Checking it

- **`npm run check`**: starts its own copy of the app (port 3999) on your `.env` database, signs in as the first
  `ADMIN_EMAILS` admin, loads every main page, and prints ok / FAIL for each. Read-only. Run it after any change.
  (The admin must have signed in to that database at least once.)
- **`npm test`**: the engine tests (claiming, limits, waitlists, check-in rules). **These create test boards**, so point
  `.env` at a throwaway database first.

### Deploying a new version

1. **Back up the database** in Railway (Database → Backups) before any deploy that mentions database changes.
2. Replace `src/` and `public/` (and `package.json`, `README.md`, `test/`) with the new ones. **Delete `src/` first**
   when a version removes files, so old files don't linger. Keep `.git`, `.env`, `node_modules`.
3. `git status` to review, then commit and push. Railway deploys on push.

---

## 2. Go-live checklist

1. Railway settings above, especially `DEV_SHOW_LINK=false`, `APP_URL`, a verified `EMAIL_FROM` domain.
2. Back up the database.
3. **App Settings → Accounts & sign-in**: new-account approval, password policy.
4. **App Settings → People → Requests**: the email that gets request notices.
5. **App Settings → People → Communication → Branding**: logo, sender name, reply-to, footer. Reread the
   **Invitation** email (every parent/guardian's first email). Use **Test** to see emails in a real inbox.
6. **App Settings → Organization**: Locations, Wording (club and app names). **Old data**: download, then remove (§6).
7. No test boards or claims left on published boards (reminders send on their own).
8. Dry run: invite 2–3 families, a coach, and try the public link as an outsider. **Sign in as** helps here (§4.8).

---

## 3. How it's organized

- **Board** (a Claim Board): a program, volunteer event, etc. Has up to 3 **levels** (e.g. Round › Age group ›
  Activity, or Area › Shift), then **sessions** (the spots people claim, with times, places and spot counts).
- **Claim**: a person holding a spot (or on its waitlist). Claims belong to the **person**, not to whoever clicked, so a
  family and an athlete who signs in see and share the same claims and limits.
- **Board defaults**: who can claim (anyone with the link · anyone with an account · only people on the board), who's
  going (shown or not), limits, timing (when claiming opens, cancel deadline), a question, attendance, check-in lock.
  Any level can override any of them.
- **People**: everyone in the app. **Athletes** (claimed for by their parents/guardians, or signing in themselves) and
  **adults** (parents/guardians, coaches, volunteers). Adults with an email sign in with it. One record per person.
- **Access & people** (per board): who's on the board, their group (e.g. 10U) and tags (e.g. Catcher). Levels and
  sessions can be limited to groups or tags.
- **Sign-in**: an emailed link, a password, or a one-time code from an admin. The first sign-in goes through a short
  Welcome step (name, password, phone), filled in from People when known. **Passwords: Optional** (App Settings →
  Accounts & sign-in): links or passwords, either way. **Passwords: Required**: everyone sets a password on their first
  sign-in (which uses a link); after that a link request is refused ("Your account uses a password") and email is only
  for Forgot password. Admins too.

---

## 4. Admin guide

### 4.1 Boards
- **All Boards** (dashboard): tabs All · Published · Draft · Archived; search, sort; each card shows the next date and
  claims. **+ Create Board** is a three-step wizard (Details · Structure · Settings). **Duplicate** copies a board's
  setup (optionally sessions moved to a new first day, people, coaches; never claims).
- A board's tabs: **Board setup** (the tree of levels and sessions: add, rename, duplicate, delete). **Add session** can
  **Split into time slots** (e.g. 3:00 to 7:00, a slot every 30 minutes, the same spots each) and make them on **Just this
  date**, **Repeat weekly**, or **Pick dates on a calendar** (200 sessions at most at once). **Copy a day** copies every
  session on one day (this level or the whole board) onto days picked on a calendar, skipping any already there; each session's **People** page to add or remove someone directly) · **Board details** · **Access &
  people** · **Board defaults** · **Notifications**.
- **Preview** shows the sign-up page as any person on the board. **Publish** opens it to families.
- **Archive**, then **Delete permanently** (type the board's name) when it's truly done.

### 4.1b Moving setup between copies (staging → production)
- **A board:** its header → **Export** (tick People on the board / Coaches) downloads a `.claimit.json` file with its
  setup, look, wording, Board defaults, Notifications, every level with its settings, and every session. Never claims or
  check-ins. In the other copy: All Boards → **Import a board** → the file → a summary → **Create the board** (always a
  new, unpublished board; same name gets "(imported)").
- **A level:** its ⋯ menu in Board setup → **Export** (the level with everything inside it). In the other copy, open the
  level it belongs inside (or the board itself, for a top level) → **Import a level**. It has to go where the same kind
  of level goes on a board with the same number of levels; otherwise the summary says where it goes.
- **People:** People → **Export** downloads everyone as a spreadsheet the People **Import** reads as is.
- People on an imported board are found here by email, or name + birth year (a parent's email breaks ties); anyone not
  found is listed in the summary (import People first, then add them). Coaches travel by email. (src/transfer.js)

### 4.1a RSVP boards
Create Board → type **RSVP** (or Board details → Type & look). For events where athletes just say whether they're coming
(team events, meetings, games). Only people on the board answer (set on creation), and what they answer for is called an
Event. Families see each event with **Going / Can't make it** and an optional note, changeable until it starts; no spots.
Board Setup shows "N going"; an event's People page shows Going · Can't make it · No answer yet (with notes) and
**Remind them** (emails only those who haven't answered: "Please RSVP" in Communication). Going is a regular claim, so My
Claims, day-before reminders, check-in and reports include it; Can't make it is stored as a canceled claim marked
`rsvp='no'` (src/rsvp.js). RSVP boards have no public link.

### 4.2 Notifications (per board)
Reminder timing (off · 2 h · 12 h · 1 day · 2 days · 3 days before; default 1 day) and switches for the claim emails
(claimed, waitlisted, canceled, moved off the waitlist). Public-link confirmations always send (they carry the cancel
link). Reminders are checked every 15 minutes and sent once per claim.

### 4.3 Check-in and Reports
- **Check-in**: a day's sessions (folder tabs per board when several), then a session's list with ✓ Here / ✗ No-show,
  **Mark the rest here**, **+ Add walk-in**. Built for phones. Coaches can change it until the board's **check-in lock**
  (Board defaults → Attendance; default the end of the next day); admins always can.
- **Reports**: per board (and team): By person · All claims, Download CSV.

### 4.4 People
- **Import** (CSV or Excel): choose Athletes / Adults / Mixed; match the columns (up to 4 parents/guardians; remembered
  for the next file with the same columns); then the **review pop-up**: every row's status and what will happen, fix
  or untick anything, resolve possible matches. Nothing is saved until **Import**. Lists can be set separately for the
  athletes and their parents/guardians. After: invite the new adults, view who was imported, **Undo** (24 hours).
  - An import **updates and adds; it never removes or erases** (blank cells change nothing; parents/guardians and
    lists not in the file stay).
  - **Not in this file** (on the result page): compare with last season's list and archive, or list, who didn't return.
  - **Yearly routine**: import the new roster onto e.g. *2027 Athletes*, compare with *2026 Athletes*, archive or list
    the rest; then on the new board, Access & people → Add from People → that list.
- **A person's page**: details, family, boards, claims; **Merge a duplicate into …**; **Sign in as …**.
- **Clean up**: sign-ins unused for a year (admins never listed). Keep (hidden a year) or Delete (anyone with past claims
  is archived instead, so Reports keeps their history).
- **Requests**: new-account, add-a-family-member and change requests from My Account.

### 4.5 Communication (App Settings → People)
All 20 emails the app sends, grouped (Sign-in & accounts · Claims · Requests · Notices to admins). **Edit**: subject,
heading, message (blank line = paragraph, `**bold**`, `[text](link)`), button label, with clickable **variables** and a
live preview; **Reset to default**. **Test** beside each sends it (as saved, with sample details) to any address.
**Branding**: your logo (+ the Claim It logo), colors, sender name, reply-to, footer, and your own variables
(e.g. `{{season}}`). A line whose variables are all empty is left out of the email.

### 4.6 Families and athletes (what they see)
- **My Claims**: upcoming claims (filter by person and time) and boards open to sign up. **My Account**: Account
  (Profile rows with Change; Access) and Family (members with Change, + Add a family member; Sharing for athletes who sign
  in; My requests).
- **Add to calendar**: on each upcoming claim in My Claims and on claimed sessions on the sign-up page (and RSVP Going):
  Apple Calendar or desktop Outlook (a calendar file), Google Calendar, Outlook.com, Microsoft 365. `/claims/<id>/calendar`
  (only your own or your family's claims).
- **Sign-up page**: who's signing up (picked automatically when there's only one person), list or calendar, claim and
  cancel, remaining spots.
- **Public link** (`/s/<code>`): claim with a name and email, no account; the confirmation has a private cancel link.

### 4.7 Athletes who sign in themselves
On the athlete's People page: their own email, Send invite, and two switches: family can see/manage claims, family gets
the emails (both on by default). Athletes 18+ can change these in My Account → Family → Sharing.

### 4.8 Sign in as (shadow mode)
App Settings → Accounts & sign-in → **Sign in as** (or a person's page). Use the app exactly as someone else: a person
with a sign-in (from their sign-in screen, "Continue as … (admin, no password)"), someone who used a public link (their
board with their name filled in, plus **Their links**), or a visitor. A striped banner shows who you are.
**Changes are real; emails are held**, not sent (open "N emails held" to read them, Send to me, or Send to them).
Their last sign-in time isn't touched. Logged in Sign-in activity. Ends after 4 hours or **Exit shadow mode**.

---

## 5. Code map

```
server.js                 starts the app
src/app.js                Express setup, routes, startup (database setup, reminders)
src/db.js                 database connection + the startup setup script (core, then old tables only if present)
src/engine/               the board engine: index.js (levels, settings, who can claim, limits, claiming),
                          schema.js (board_nodes, board_items, board_claims), notify.js (claim emails), copy.js (Duplicate)
src/auth.js, accounts.js  sessions, sign-in (links, passwords, codes), invites, sign-in activity
src/people.js             People: records, family links, lists, status, merge, clean up
src/peopleImport.js       the import (columns, matching, review analysis, commit, undo, not in this file)
src/emailTemplates.js     every email: defaults, variables, branding, rendering, send
src/email.js              sending (Resend); holds emails in shadow mode
src/shadow.js             shadow mode (Sign in as)
src/reminders.js          reminder checker (every 15 minutes)
src/calendar.js           Add to calendar (.ics + Google)
src/oldData.js            Old data: summary, download (.zip of CSVs), remove
src/schedules.js, groups.js, catalog.js, rounds.js   board helpers, groups/tags, app catalog, labels
src/routes/               one file per area (setup, board, members, claim, publicBoard, people, settings, account,
                          requests, checkin2, reports2, auth, shadow, signins)
src/views/                the pages (layout.js = shell; admin.js = admin page wrapper; apphead.js = App Settings
                          header and tabs; setup2.js = Board Setup + the board header; one file per area otherwise)
public/styles.css         all styles (one rule per line, in the order they apply)
public/import-review.js   the import review pop-up
public/app-ui.js          sortable table headings, and keeping your place after a change (loaded on every page)
test/engine.test.js       engine tests (npm test)
test/check.js             page health check (npm run check)
```

### Layout standard (keep new pages to it)
- **Page top:** the same space below the top bar on every page (28px; 16px on phones).
- **Back button:** always **above** the header, in a `<nav class="back-row"><a class="back-btn" href="…">(arrow svg)Label</a></nav>`.
  Nothing else goes above the header (page-wide status banners, like Preview and shadow mode, are the only exception).
- **Header:** the navy `bh2` band (or the App Settings header), then tabs / folder sub-tabs, then the white sheet.
- **Form buttons:** a `q-actions` (or `a-act`) row at the end of the form: right-aligned, **Cancel first, then the main
  action**, 16px below the last field. The main button is lime (`btn-small` or `sb-btn primary`); Cancel is outlined
  (`btn-ghost` / `link-dark`); Delete / Remove / Decline is a red outline (`btn-ghost danger`). All buttons in a row are
  the same height and line up.
- **One-line rows** (add, rename, filter, bulk actions) keep their button beside the field (`inline-add`, `inline-edit`).
- **Tables:** every table heading sorts on click (▲/▼, remembered per table for the session) via `public/app-ui.js`.
  Editing grids where row order is saved opt out: `levels`, `limits`, the import review, or add `data-nosort`. Put a
  `data-sort="…"` on a cell to sort it by a different value than its text.
- **While scrolling:** what stays on screen is chosen per screen in `public/app-ui.js` (`SCREENS`: a path pattern and the
  pieces that stick, top to bottom; "band" = the navy title band, "head" = the tables' column headings). Everything else
  scrolls behind them. Phones keep only the band (shrunk to its title) plus Check-in's bars. The logo tucks into the top bar
  once scrolled; "↑ Top" appears far down a long page. Current choices: All Boards band+tabs · Board setup band+board tabs ·
  other board screens band+board tabs+sub-tabs · People band+main tabs+filters · other App Settings band+main tabs+sub-tabs+
  headings · Reports band+bar+sub-tabs+headings · Check-in day band+day bar · session check-in band+counts+Signed up ·
  My Claims band+Who/When · My Account band+tabs+sub-tabs · Create Board band+steps · Duplicate band+bar · sign-up page
  unchanged (only the sessions scroll).
- **After a change** (any POST form), the page returns to the same scroll spot (and scrolling lists), unless it redirects
  to an anchor that exists on the page.
- **Phones:** nothing wider than the screen; tab bars scroll sideways; long text and toolbars wrap.
- The rules live at the end of `public/styles.css` ("CONSISTENCY STANDARD"), so most pages follow them without extra work.

Conventions: pages are template strings built on the server (`esc()` every value); forms post and redirect with a flash
message (`go(res, url, { ok | err })`); every database change is additive and runs at startup, so deploying is just a push.

---

## 6. Database

- Main tables: `schedules` (boards), `board_nodes` (levels), `board_items` (sessions), `board_claims`, `athletes`
  (everyone in People), `users` (sign-ins), `parent_athletes` (family links), `schedule_members` (who's on a board),
  `people_lists` / `people_list_members`, `email_templates`, `app_kv` (branding and other settings), `import_batches`,
  `shadow_sessions` / `shadow_outbox`, `login_events` (sign-in activity), `sessions` (sign-in sessions).
- **Old data**: the system before the rebuild used `seasons`, `rounds`, `programs`, `training_sessions` and
  `reservations`. Nothing uses them now. **App Settings → Organization → Old data** shows what's there, downloads it all
  as a .zip of CSVs, then removes it (tick the box, type REMOVE OLD DATA). A new database never creates them, and the app
  runs the same with or without them. Back up the database first.

---

## 7. Version history (short)

- **v0.35.1** Add to calendar in the app (My Claims, sign-up page, RSVP).
- **v0.35** Export / import a board or a level (e.g. staging → production); People → Export.
- **v0.34.3** `ENV_LABEL` marks a staging copy on every page, tab title and email subject.
- **v0.34.2** Messages ("Saved", errors) float bottom right (along the bottom on phones) instead of pushing the page down;
  success fades after 6 seconds (hover keeps it), errors stay until closed. Sign-in screens keep theirs in place.
- **v0.34.1** Board Setup: the tree's ⋯ menu floats above the page (it was cut off inside the tree box).
- **v0.34** Add session: split into time slots, pick dates on a calendar; Copy a day onto other days.
- **v0.33.3** What stays on screen while scrolling, chosen screen by screen.
- **v0.33.2** Only the title band stays put while scrolling; the logo tucks into the top bar once scrolled.
- **v0.33.1** Sticky title band, tabs, filters, Apply bar and column headings while scrolling; ↑ Top.
- **v0.33** Sortable table headings everywhere; pages keep their scroll position after a change.
- **v0.32.3** People table: long family (and contact) text wraps inside its column.
- **v0.32.2** Import: choosing a file goes to Match the columns first; the review opens with Next: Review & import.
- **v0.32.1** Sign-in help for people new to it: a "First time here?" box with numbered steps on the sign-in page (follows the
  password setting), plainer Check your email and Welcome pages, a "Need help?" contact (the Requests email) on each, and a
  printable /help page (also linked from the Invitation email).
- **v0.32** RSVP board type (Going / Can't make it with a note, no-answer list with Remind).
- **v0.31.1** People table: six columns (Person with kind and team · Contact · Family · Lists & boards · Status), fixed
  widths, chips wrap inside their column, cards on phones; adults with linked kids are tagged Parent/guardian.
- **v0.31** Consistency pass: headers in two spots (with / without a back button), back buttons always above the header,
  form buttons right-aligned Cancel · Save 16px below the last field with one lime main button, red Delete/Decline, nothing
  wider than a phone (27 pages were); My Account Change rows and Requests Decline match every other form.
- **v0.30.1** Passwords: Required now means password sign-in after the first time (email only for Forgot password).
- **v0.30** Cleanup: old-data tool; app independent of the old tables; dead code and unused styles removed (visually
  identical, checked with before/after screenshots); fixes found along the way (new 1–2-level boards couldn't be
  duplicated; renaming a group or tag didn't update level limits; Locations counted old data only); phone board tabs
  scroll; `npm run check`; this README.
- **v0.29** Reminders, board Notifications, Add to calendar, merge people, Communication Test buttons, import "Not in
  this file", People Clean up; Board defaults Edit fix; Welcome step fills in from People; one-person sign-up default.
- **v0.28** Sign in as (shadow mode), held emails with send, public-link visitors; 4 parents/guardians in import.
- **v0.27** Communication: every email editable, branding, variables.
- **v0.26** People import rebuilt (review pop-up, matching, undo, lists); "parent/guardian" wording.
- **v0.22–v0.25** My Account, Check-in, Reports, Create/Duplicate board, public cancel page redesigns; old system removed.
- **v0.13–v0.21** Dashboard and board page redesigns, App Settings, organizers, athletes who sign in, sign-up page.
- **v0.5–v0.12** My Claims, sign-up page, reports, accounts and sign-in, requests, public link, check-in, Board Setup.
