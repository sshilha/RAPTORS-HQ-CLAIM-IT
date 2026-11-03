# Raptors Claim It

![Raptors Claim It](public/claim-it-logo.png)

**Branding:** the logo (`public/claim-it-logo*.png`) appears on the sign-in screen, the top bar,
public share pages, and emails. The raptor eye is the browser/home-screen icon
(`favicon*.png`, `apple-touch-icon.png`, `icon-512.png`, `manifest.json`), and shared links show
`og-image.jpg` as their preview. Emails load the logo from `APP_URL`, so set it in Railway.

**Claim It** for short. Sign-ups for the Chippewa Valley Raptors: training, concessions and
volunteer shifts, events, anything with times and spots. Families see what's open and tap
**Claim it**; "My Claims" shows what they've got. Rename it under Settings → Activities &
groups → Names & labels (app name and short name).

## Schedules and levels

A **schedule** is a separate sign-up instance (e.g. "Training", "Concessions"). Each one
names its own levels under Settings → Schedule → Schedule settings:

| Level | What it is | e.g. |
|---|---|---|
| Sheet level | One sign-up sheet with its own dates, rules, limits, and who signs up | Round, Event, Week |
| Type | What people sign up for, with default spots and limits | Activity, Role, Item |
| Slot | One bookable time with spots, whole or split into blocks | Session, Shift, Slot |

Each schedule also picks which types (activities/roles) it offers. App-wide names (app,
organization, participant, group) are under Settings → Activities & groups → Names & labels.

## Settings layout

**Settings home:** **⚙ App** (app-wide settings), **+ New** (create one), then a card for each
active Claim Board (live status, counts, next session) with **Open**, **Copy**, and **Archive**.
**View archived** lists archived boards with **View**, **Copy**, **Reopen**, and **Delete** (empty
boards only). **Copy** makes a new board from an existing one: settings always; activities, groups,
participants, and the calendar (open seasons and rounds shifted to a new first day, as drafts)
as chosen. Each one is called a **Claim Board** by default (changeable under ⚙ App).

**Levels.** Each Claim Board has 1–4 levels that you name (Claim Board settings); the last level
is what people claim, with a number of spots:
- 1 level: a simple list (e.g. Task: "Bring a case of water", 6 spots).
- 2 levels (Categories & items): e.g. Concessions › Grill 8–10 AM, or Desserts › Brownies. Areas are made right on the board (just a name); each shift/item
  has its own spots and, if the board has dates, its own date and time. No calendar builder.
- 3 levels: e.g. Round › Activity › Session (Winter Training).
- 4 levels: e.g. Day › Area › Station › Shift.
Boards with 1–2 levels show three numbered steps on their page (1 Add items, 2 Rules: per-person
limit, waitlist, when claiming opens, open leftover spots (Never, or N days/hours before: anyone can take spots still open, even past
their limit; default Never on 1–2 level boards), a question to ask when people claim (your wording;
optionally required; answers shown to others or kept private), and for dated boards the cancel deadline; 3 Publish &
share, with the share link only for "Anyone with the link") and keep their rules (who signs up, limits, unlocking, waitlist, publish) on the
board's Setup page. Anything claimable can have a date and time, or be an undated item with a name;
undated items show as a list on My Claims and the public page, and have no cancel deadline.
The number of levels can change only while the board is empty.

**Do things have dates and times?** No: people pick from a list (put the day in the board's name,
times in item names). Yes: choose the **Available views**: List (a day-by-day list with dates and times, no calendar),
Calendar, or Both: List & Calendar
(people switch between the calendar and a day-by-day list; their choice is remembered). New item-list
boards start as lists. Items appear in the order you add them.

A **Claim Board is the season or event itself**, e.g. "Winter Training 2026–27" or "2027 Arctic
Rumble Volunteering". Next year, **Copy** it (the name bumps to 2027–28 automatically).
**Archive** hides it from families and makes it read-only (reports still work); **Reopen** unlocks it.

The **New claim board** wizard (Details → Structure → Settings, with a live summary before
Create) asks the board-wide questions up front (structure, who can claim,
limits to certain people, whether things have dates, and if so the available views), with defaults that follow the structure. They stay
editable in **Claim Board Setup** (the first settings step), which asks the questions that decide which other steps exist:
- **Who can claim?** Anyone with the link / Signed-in families / Only people I add. Applies to
  the whole board (every round). "Only people I add" adds the People step.
- **Limit some things to certain people?** No / Yes, by group or tag. On item lists, each item
  gets a **Who** picker (e.g. Salad only for 10U); items limited to a group or tag aren't offered
  on the public link. "Yes" adds
  the Groups & tags step (and People, where tags are given out), and the group/"Only for" pickers.
- **Available views:** List / Calendar / Both.
It also holds the board's levels, **Locations**, and **View** (what people see of who's going).
Tabs that aren't needed don't appear: "Anyone with the link" boards never show Teams & tags or
People (visitors are anonymous, so limits don't apply).

**Navigation:** on computers the main links are in the top bar (My Claims · Claim Boards ·
Check-in · Reports); phones keep the bottom bar. ⚙ App settings is a small admin-only link by the
email and Sign out. The board screen is home base: its header has the name, event date and location (edit in place),
Share (public boards) and a large Publish/Unpublish; the left column is the work (items, categories
& items, or activities then rounds); the right column summarizes Board settings, Rules, and Teams,
tags & people, each with Manage. Every other board page shows a trail back to the board.

**Board page:** one header (name, Draft/Published, ⚙ Settings, Publish board), stat tiles (items,
spots, claimed), then for 1–2 level boards two columns: **Manage items** on the left; **Rules**
(one-line summary + Edit rules) and **Publish & share** (status, share link/QR once published) on
the right. 3–4 level boards keep their rounds list under the same header.

**Attendance:** Claim Board Setup → Attendance sets the board default (track or not) and the
**Coaches** (emails) who may take attendance on that board. Each activity in a round, each area
(2-level), or each item (1-level) can override it (e.g. track Hitting, not Cage Time). The
**Check-in** page (admins: all boards; coaches: their boards only, nothing else) lists the day's
tracked sessions; tap one to mark ✓ Here / ✗ No-show, Mark everyone else here, or add a walk-in.
Reports → **Attendance**: claimed, here, no-show, not marked, walk-ins, showed-up %.

**Open** (on the card) shows the board itself: its rounds or items, calendar, and rules.
**Settings** (on the card) walks through setup as numbered steps: 1 Name & structure,
2 Activities (skipped for 1-level boards), 3 Groups & tags, 4 People, 5 Locations & family
view, 6 Archive or delete. Steps 3–4 are only needed for roster-only claims or tag rules.

**What each part holds:**
- **Setup:** its rounds (or events/weeks), times, calendar, import.
- **Participants** (named per schedule): who can use its "roster only" sign-ups and their group
  there. A person exists once in the app and can be in several schedules with a different group in each.
- **Activities:** the schedule's own types. Different schedules can reuse a name (each has its own
  color, spots, limit, and settings).
- **Groups & tags:** the board's own groups, shortcuts, and **tags** (e.g. Catcher, Pitcher). People
  get tags on the Athletes tab (per row, or check several and Add tag). Set **Only for** on an
  activity in a round (e.g. Catching · Catcher only): only people with that tag can claim it, and
  everyone else doesn't see it. Labels show the full rule ("Catching 12U–18U · Catcher only").
- **Settings:** name, level words, locations, family view (who's going: full names, first name +
  last initial, or hidden), archive/restore, delete (when empty). Archiving hides the board from
  families without deleting anything.

**⚙ App:** app name and short name, organization, what each board is called, **Locations** (saved
places with addresses; location boxes suggest them, and people see them as 📍 links to Google
Maps directions; any other typed location shows as plain text; set `GOOGLE_MAPS_API_KEY` in
Railway to turn on address search as you type), and
**Administrators** (add or remove app-wide admins; anyone in the `ADMIN_EMAILS` variable is a
built-in admin that can't be removed in the app, so you can't lock yourself out).

## Who signs up (per sheet)

- **Roster only:** linked participants in the sheet's groups (how training works).
- **Signed-in families:** any signed-in family can sign up themselves (a "Me" tab) or any of
  their participants; groups don't restrict it.
- **Anyone with the link:** a public page at `/s/<token>` (share link + QR code on the sheet).
  People enter a name and email, no account needed; they can sign in later with that email
  to see or cancel.

# (Original training scheduler notes)

Training reservations for Chippewa Valley Raptors families, launched from the private
SportsEngine **Training Sign-Up** page.

Flow: SportsEngine private page → this app → email sign-in link → My Training calendar → tap a day → reserve.

**Families** see a month calendar for each athlete (tabs if they have more than one): dots
show the activities offered each day, ✓ marks days already booked. A "This round" summary
shows what's used (e.g. Hitting 1 of 2, Defense 0 of 1, Cage Time unlimited) on the calendar
and on every day page. Tapping a day lists its sessions (block grid for split sessions) with
reserve, waitlist, and cancel right there, plus buttons to jump to the previous/next
training day. Each session shows who's going (names only, never contact details; Settings →
Family view picks full names, first name + last initial, or hidden). Upcoming reservations are
listed under the calendar.

## How it works

- **Programs** have an activity (Hitting, Pitching, Catching, Defense) and the age groups
  they're open to, e.g. "Winter Hitting 12U–18U" and a separate "Winter Hitting 10U".
- **Sessions** belong to a program: date, time, location, coach, capacity. Add one or
  repeat it weekly for up to 12 weeks.
- **Eligibility** comes from the athlete's age group. No separate group lists.
- **Priority booking:** until the program's priority end date, each athlete can hold a set
  number of reservations (default 2) in that program, counting waitlist spots. After that,
  any open session can be booked. The switch happens automatically.
- **Waitlist:** full sessions offer "Join waitlist". When a spot opens (a cancellation or
  capacity increase), the first waitlisted athlete moves in automatically and the family gets an email.
- **Cancellation deadline:** parents can cancel online until X hours before the session
  (default 24). Leaving a waitlist is always allowed. Admins can remove anyone at any time.
- **Emails** go to every parent linked to the athlete: reserved, waitlisted, moved off
  waitlist, canceled, and session canceled.
- **My training** shows each athlete's upcoming sessions with cancel buttons.

## Admin (emails in ADMIN_EMAILS)

Admins have three items in the bottom nav: **My Training**, **Reports**, and **Settings**.
Settings has three tabs: **Schedule** (seasons, rounds, times, sessions, calendars, import,
Who's signed up), **Athletes** (athletes and parents), and **Activities & groups** (activities,
groups, shortcuts, locations, family view).

- **Schedule** (Settings → Schedule) is one page for everything: each open season, its rounds, and each round's
  times and sessions (activity + group + spots), with add/edit right there. Open a round's
  calendar to schedule sessions on days. Also: open a new season (empty or copied),
  import the vendor schedule, and view completed seasons (read-only).

- **Seasons** sit above rounds (e.g. "Winter Training 2026–27"). Open a season empty or as a
  copy of last season (rounds, times, sessions, spots, schedule, and booking dates shift to
  the new dates; copied rounds start as drafts). **Complete season** hides it from families
  and makes it read-only everywhere (enforced on the server); it stays viewable in Admin and
  can be reopened. The Rounds list shows open seasons by default.
- **Reports:** Session fill, Activity and group summary, Athlete participation, and
  Reservation detail. Filter by season, round, date range (same From/To for one day),
  activity, and age group. Download any report as CSV or print it. Reports count
  reservations, not attendance.

- **Rounds** are set up in levels, top down:
  1. **Round:** name, first and last day, booking opens, priority ends, priority limit,
     cancellation hours, location. Create as many rounds as you need; a new round can start
     as a copy of an old one (times, sessions, and the schedule shift by the gap in dates).
  2. **Times:** the round's time slots (3–4:30, 4:30–6, …).
  3. **Sessions:** activity + group + spots (+ optional coach), e.g. "Defense 12U–18U, 14 spots".
     Changing spots updates every scheduled occurrence and pulls athletes off the waitlist.
  4. **Schedule:** click days on the calendar, pick a time (or "Other time", which is saved
     as a new time slot), check one or more sessions, and schedule them all at once.
     "Copy" duplicates a day onto other days.
  Rounds are drafts, hidden from families, until you click **Publish round**.
- **Waitlist (optional):** off by default. Turn it on per round ("Use a waitlist when sessions
  fill up" in the round's limits), and override per session (Round default / On / Off). With it
  off, full sessions show "Full"; admins can still "Add anyway" to add a spot.
- **Limits per athlete** are set per round, per activity (e.g. Hitting 2, Defense 1,
  Catching 1, Cage Time unlimited). Sessions are **locked** to these limits: an athlete can
  reserve a locked session only while she has an unused reservation for that activity.
- **Unlocking:** each round has an unlock period (default 7 days before each session, or
  never). Inside it, open spots are open to any athlete. You can also unlock by hand, per
  session (its roster page) or for whole days (select days on the round calendar). Spots
  taken from unlocked sessions don't use up the athlete's limit; reports mark them
  "(open spot)". The calendar shows unlocked sessions with 🔓.
- **Blocks:** a session can be split into 15/20/30/45/60-minute blocks, with spots per block.
  Cage Time defaults to 30-minute blocks of 2: scheduling Saturday 3–7 creates eight blocks.
  The calendar shows a day's blocks as one chip; parents pick times from a grid.
- **Who's signed up** (`/admin/day/<date>`): every session on a day with the athletes booked
  and the waitlist, grouped by session (split sessions show each block's names). Tap a name
  for parent emails and to **Remove**, **Move** to another session that day, or **Move in**
  from the waitlist. **+ Add athlete** adds anyone (admins skip limits and group rules);
  "Add anyway" adds a spot when it's full. Families are emailed. Print for a coach sheet. Open it from the 👥 on any day of a round's
  calendar, a block chip, or the "Who's signed up" link admins see on the family day page.
- **Settings** holds the building blocks, all editable: **activities** (name, color, default
  spots, split into blocks, default limit or unlimited, open to all groups, import codes,
  hidden), **groups** (ages, levels, or anything), **group shortcuts** (one-click group
  picks), and **locations**. Renames cascade through existing data; removal is blocked while
  something still uses it (hide an activity instead). New groups join all-groups sessions.

- **Import schedule:** upload the Turn Two schedule PDF (or paste its text). The app reads
  lines like `6-7:30pm-Hitting-12/14/16/18U` under each date and creates draft rounds
  (one per ROUND header) after a review screen. Set each round's name, booking-open, and
  priority-end dates there. An import whose round name matches an existing round from the
  same season adds to it. Re-importing skips sessions that already exist. Times without
  am/pm are read as afternoon/evening (11 = 11 AM). Cage Time is imported for all ages.

- **Programs and sessions:** create programs, add sessions, see the reserved list and
  waitlist for each session, edit or cancel a session.
- **Athletes and parents:** add athletes with an age group and one or more parent emails.

All times are Central.

Stack: Node.js 20+, Express, PostgreSQL, Resend (email).

## Deploy to Railway

1. **Push this code** to the `RAPTORS-HQ-TRAINING-SCHEDULER` repo (replace the README-only commit).
2. **Add Postgres:** in the Railway project, click **+ New → Database → PostgreSQL**.
3. **Set variables** on the app service (Variables tab):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
   | `APP_URL` | your public URL, e.g. `https://training.chippewavalleyraptors.com` |
   | `NODE_ENV` | `production` |
   | `ADMIN_EMAILS` | your email (comma-separate for more) |
   | `DEV_SHOW_LINK` | `true` for your first test only, then delete it |
   | `RESEND_API_KEY` | from resend.com (leave unset until email is ready) |
   | `EMAIL_FROM` | `Raptors Training <training@chippewavalleyraptors.com>` |

4. **Generate a domain:** service → Settings → Networking → Generate Domain. Put that URL in `APP_URL`.
   For a custom domain, add `training.chippewavalleyraptors.com` there and create the CNAME Railway shows.
5. Tables are created automatically on startup. Check `/health` returns `{"status":"ok"}`.

## Email setup (Resend)

1. Create a free account at resend.com and add the domain `chippewavalleyraptors.com`.
2. Add the DNS records Resend gives you (SPF/DKIM) wherever the domain's DNS is managed.
3. Create an API key and set `RESEND_API_KEY`. Remove `DEV_SHOW_LINK`.

Until the key is set, sign-in links are written to the Railway deploy logs.

## Testing the POC

1. Open the app, enter your email, click **Send sign-in link**.
2. With `DEV_SHOW_LINK=true` the link appears on screen; otherwise check email (or logs).
3. In **Admin**, add yourself as a parent of a test athlete, create a program, and add sessions.
4. Go to **My training** and book as a parent. Test the waitlist with capacity 1 and a second email.

## SportsEngine button

On the private Training Sign-Up page, add a button or link pointing to your `APP_URL`, labeled
**Open training scheduler**. SportsEngine controls who can see the page; this app handles sign-in.

## Security notes

- Sign-in links are single-use, expire in 15 minutes, and are stored hashed.
- Opening the link shows a **Sign in** button (a POST), so Outlook Safe Links and other email
  scanners can't use up the link before the parent clicks it.
- Max 5 links per email per 15 minutes. Sessions last 30 days in an HttpOnly cookie.
- Anyone can request a link for any email; they only see athletes linked to that email.

## Project layout

```
server.js          entry point
src/app.js         app setup
src/routes/        auth, parent, admin routes
src/booking.js     reservation rules (priority, waitlist, cancel, promotion)
src/notify.js      reservation emails
src/auth.js        sign-in links, sessions, admin check
src/db.js          Postgres pool + table creation
src/email.js       Resend email sender
src/time.js        Central time helpers
src/config.js      age groups, activities
src/views/         HTML pages
public/styles.css  styles
```

## Next steps

- Authentication decision once SportsEngine responds (SSO vs. email allowlist + private-page link)
- SportsEngine CSV import for athletes and parent emails
- Reminder emails the day before a session

## Run it on your computer (no Railway needed)

1. Install **Node.js 20 or newer** (nodejs.org, LTS) and **Docker Desktop** (for the database).
2. In the project folder:
   ```
   npm install
   copy .env.example .env      (Mac/Linux: cp .env.example .env)
   npm run db                  starts PostgreSQL in Docker
   npm run local               starts the app; restarts when you change a file
   ```
3. Or just double-click **Start Claim It.bat** (Windows): it installs packages the first time, starts the
   app, and opens the browser. Close its window to stop the app.
4. Open http://localhost:3000 and sign in with an email from ADMIN_EMAILS. With
   DEV_SHOW_LINK=true the sign-in link appears on screen (and in the terminal).

Tables are created automatically on first start. Data stays between runs; to start fresh:
`docker compose down -v`.

**No Docker?** Install PostgreSQL directly (postgresql.org) and point DATABASE_URL at it, or use
a free hosted database (Neon or Supabase) and paste its connection string into DATABASE_URL.

**Test from your phone:** on the same Wi-Fi, set APP_URL to http://YOUR-COMPUTER-IP:3000 (find the
IP with `ipconfig`), restart, and open that address on the phone. Windows may ask to allow Node
through the firewall: allow it on private networks.

**Let someone else try it:** run a tunnel such as `npx cloudflared tunnel --url http://localhost:3000`
(or ngrok), set APP_URL to the https address it prints, and restart.


## Board pages (1-2 levels)
- **Claim Boards card → Edit**: what the board *is*: name, event date and location, a description shown to
  people, an organizer (shown to people and in confirmation emails), and the structure (levels and names).
- **Board → Setup screen** (*Name Setup*): the work (items or categories & items), Publish/Unpublish and
  Share, and summary cards for Settings and Teams, tags & people.
- **Settings** (*Name Settings*): how people interact with it: Who can claim, How people see it, Limits,
  Timing, Question, Attendance; each with Edit → Cancel · Save.
- **Teams, tags & people** (*Name Teams, tags & volunteers*): teams and tags, then the people list.


## The container engine (in progress)
`src/engine/` holds the new model every board will run on: **board → containers (up to 3 deep) →
items → claims**. Settings set on the board, a container, or an item flow down until something lower
overrides them: who can claim here (only narrows), per-person limit (every limit on the path applies),
attendance, claiming opens, cancel deadline, open leftover spots, waitlist, location. Board-only: who
can get in at all, one Publish, and the claim question. Containers can have a *visible from* date.
Tests: `npm test` (uses the DATABASE_URL in .env; use a scratch database: it clears the engine tables).
Stage 2 (done): the board Setup screen runs on the engine as an outline: every container with a twisty
(open/close in place; remembered per board), add/rename/remove containers and items inside them, a Settings card per container (Edit opens the overrides; each value shows Set here /
From <container> / Board default), one board-level Publish. Board-wide defaults are on the Settings page.
Not yet on the engine: what people see and claim (stage 4), check-in, reports, copy board.


## People (⚙ App settings → People)
One directory of everyone: **athletes** (current team, SportsEngine group, birth year, jersey #, notes,
linked parents) and **adults** (email to sign in, phone, organization, current team, SportsEngine group,
notes) with roles **Parent / Coach / Volunteer** (a person can have several). Each person's page shows
their family links, the boards they're on (team, tags, claims), and, for coaches, which boards they take
attendance on. Parents linked by email anywhere become directory adults automatically. On a board,
**From People** picks from the directory (filter by kind, current team, SportsEngine group; Check all
shown). Imports also fill current team and SportsEngine group. Only admins edit details; people use
**Request a change** (bottom of My Claims), emailed to the address set in App settings → Change requests
(default info@chippewavalleyraptors.com).


## App settings
A hub of cards (People · Locations · Administrators · App name & wording · Change requests), each opening
its own page (/admin/settings/app?part=…). People can also be imported straight into the directory
(/admin/people/import: current team, SportsEngine group, any number of parent email columns) without
putting them on a board; add them to a board later from its From People tab.


## People lists
Named groups of people (2026 Season Athletes, 2026 Season Parents, Board Members). A person can be on
several. On People: list chips filter the directory; check people (or the header box for all shown) and
Add to list / Move from this list to another / Take off this list (+ New list right in the menu). Lists
can be renamed or deleted (people stay). Imports can put everyone in the file on a list. Each person's page
shows their lists. On a board's From People tab, filter by list and Check all shown.


## Stage 4: My Claims (people) on the engine
/dashboard: 🔓 Extra spots open (leftover spots claimable past limits), Your upcoming claims (Cancel), and
Sign up for something (a card per board the person can use). /b/:sid: Who's signing up? (their kids and
Me; skipped when there's one), then only what that person can claim, grouped by containers, with plain
limit notes, big Claim buttons, the board's question, cancel deadlines, and List | Calendar (remembered).
Claim/cancel/waitlist emails: src/engine/notify.js. Not yet on the engine: the public link (/s/...),
Check-in, Reports.


## Reports access (People)
Admins see every report. Any adult in People can be given **Reports access**: the boards they coach, or
specific boards, optionally only some teams. They then get Reports in their menu (/reports): By person
(claimed, waitlisted, attended, no-shows) and All claims (who, team, where, when, status, attended), plus
CSV, limited to their boards and teams. Attendance fills in once Check-in runs on the engine.
People without access see "My Claim History" (their family's past and upcoming claims) instead.


## Sign-in and My Account
Sign in with an **email link** (always) or a **password** (optional, set in My Account; 5 wrong tries =
15-minute lock). **Forgot password?** emails a reset link. Texting is turned off (no text-message provider). Admins can make a one-time **sign-in code** for someone (People → person → Help them sign in);
they enter it at /login/code. Passwords use Node's built-in scrypt (no new packages).


**My Account** (/account): edit own name and organization; change sign-in email (confirmed from the new
address); set/change/remove password; contact phone. Family and access are view-only.
Adding a family member or changing one's details is a **request** (App settings → Requests), approved by
an admin (approving can link an existing person instead of duplicating); people are emailed the result.


## Accounts, invites, and the Welcome step
**App settings → Accounts & sign-in:**
- **New accounts:** *Approval required* (default) or *Anyone can sign up*. With approval, an unknown email gets
  "We don't have an account" → **Request an account** (name, email, phone, organization, how they're connected),
  which lands in Requests; approving creates the account and emails a 7-day invite. People the club already
  knows always get in: admins, coaches on a board, anyone in People, and parents linked to athletes.
- **Passwords:** *Optional* (Welcome step offers one, with Skip) or *Required* (everyone without one is taken to
  the Welcome step until they set one).

**Welcome step** (/welcome): name, password, mobile number. Shown at a person's first sign-in; required (no
skip) when they were invited, an admin turned on **Require setup at next sign-in** for them, or passwords are
Required. Until it's done, every page leads back to it.

**Invites:** People → person → Sign-in & setup → Send invite / Resend (7-day link), or check several people
on the People list → *Send invite*. The People list shows each adult's account status (Not invited, Invited,
Last in).

**Sign-in history:** every attempt (who, how, result and reason, device) is recorded. See it on a person's
page, or App settings → Sign-in activity (filter by email/phone, "Only problems").

**Who can claim (board setting):** *Anyone with the link* (no account needed; account holders also see it on
My Claims), *Anyone with an account* (approved accounts only), *Only people assigned to the board* (the
assigned people, or family linked to them, claiming for them).


## Address search (optional): Google Places API (New)
Locations' address box can suggest addresses as you type. It uses **Places API (New)** from the server
(the key never appears in the web page). Google no longer lets new projects use the older Places API.
1. console.cloud.google.com → create a project (e.g. "Raptors Claim It") → set up **Billing** (required;
   small club use should stay within Google's free monthly allowance; add a budget alert to be safe).
2. APIs & Services → Library → enable **Places API (New)**.
3. APIs & Services → Credentials → Create credentials → **API key** → Edit → API restrictions →
   *Restrict key* → **Places API (New)** only. (Application restriction: None; only the server uses it.)
4. Railway → your service → Variables → add `GOOGLE_MAPS_API_KEY` = the key. Redeploy.


## Public link ("Anyone with the link" boards)
Publishing a board set to *Anyone with the link* gives it a link (/s/<code>); the board's Setup screen has
**Share** with the link, Copy, the QR code (downloadable) and Open. Visitors see the same List / Calendar
sign-up page with "No account needed"; **Claim** asks for first/last name, email and the board's question
(remembered on that device). The person is matched by email in People (or added as an adult volunteer), so
per-person limits apply by email. The confirmation email has a private **Cancel my spot** link (cancel
deadline applies). Signed-in people who open the link go to the regular sign-up page.


## Check-in (new boards)
/checkin: admins see every board; coaches see the boards they coach. The day view lists sessions that take
attendance (board default, overridable per level), with ‹ › for the previous/next day that has sessions.
A session's roster has big ✓ Here / ✗ No-show buttons (saved instantly; tap again to clear), each person's
team and answer, "Mark everyone else here", and + Walk-in (pick from the board or People, or type a name).
Walk-ins don't use a spot or count toward limits. Attendance shows in Reports (Attended, No-shows).

## Copy a board (new boards)
Claim Boards → Copy: always copies the setup and levels (with every level's settings, question, wording,
groups, picture, type, location, organizer). Optional: sessions (every date moved to a new first day, same
local times; suggested: same weekday a year later), people on the board, coaches. Never claims; the copy
starts unpublished.


## Admins assigning people to spots
Board Setup → each spot's **👥** link opens its People page: who's in it (and the waitlist) with answers and
labels, **Remove** (works past the cancel deadline; the waitlist moves up), and **+ Add someone** (from the
board's people or anyone in People). Adding follows the board's rules (eligibility, limits, full → waitlist)
unless **Override the rules** is checked, which puts them in the spot anyway. **Email them** (on by default)
sends the usual claimed / canceled email; people moved up off the waitlist are always told. Admin adds show
as "Added by admin" (and "Override") on the page and in Reports.


## Board Setup (three panels)
/admin/setup?s=<board>[&n=<level>]: header (status, real counts, Preview, Share for public boards, Duplicate,
Publish/Unpublish) and tabs (Board setup · Board details → the board's Edit window · Access & people ·
Board defaults). Left: the structure tree (search, + Add, ⋯ Add/Rename/Settings/Delete, claimed/spots per
level, remembers open branches). Center: the selected level — its child levels as cards, or its sessions
(date, time, location, claimed bar, People / Edit / Delete). Right: that level's settings with where each
comes from (Set here / From board / From <level>) and "Override inherited settings" (the same settings form
as before; "same as above" restores the inherited value). Clicking in the tree swaps the center and right
panels without reloading; every save returns with the level selected. Level names come from each board.

**Duplicate and repeat (Board Setup):** a session's Duplicate button opens the Add form filled in with its
values (change what's different and save). A level's Duplicate (⋯ menu or beside Rename) copies it with its
sub-levels, settings, and sessions, never claims, right after the original as "Name (copy)". When adding a
session (or duplicating one), **Repeat weekly** creates one per chosen weekday from the date through
"Until" (up to 200 at once), same times in Central time, with a live count before saving.

**Deleting a board:** archive it first (Claim Boards → Archive), then View archived → **Delete permanently**.
The confirmation lists what goes (levels, sessions, all claims including past ones and attendance, the board's
people list, coaches, public link) and requires typing the board's name. People, accounts, and other boards
stay. Live boards can't be deleted.

**Preview (admins):** Board Setup → Preview opens /b/<id>?preview=1 for any board (draft, live, or archived),
as it will look to families once published. "Previewing as" picks anyone on the board's list (or someone not
on it) to see exactly their sessions, eligibility, and limits. Claim/Cancel are shown but turned off.


## Claim Board Dashboard (/admin/settings)
Header (like Board Setup) with Create Board; the gray line shows counts (active boards = not archived; Upcoming claims = confirmed claims on future
sessions; Volunteers = different people signed up for upcoming shifts on volunteer boards). Tabs All /
Published / Draft / Archived (existing published/archived state), search, and sort (name, next date, status,
newest) all on the page (sort is remembered). Cards: navy header with the board's type, status, name, and
level names; the board's own picture (the same /img/board/<id> My Claims uses) on the right fading into
navy, or its short code with lime stripes. The name sits in the same place on every card. Stats: the board's
top level, its people (the assigned list, or who has signed up on open boards), and its sessions; next
session and upcoming claims. Buttons: Open · Duplicate · Archive (archived: View · Duplicate · Reopen ·
Delete permanently). 4 / 3 / 2 / 1 cards per row as the screen narrows (laptop / small laptop / tablet / phone).


## People vs. a board's people
**People (App settings) is where people live:** details, families/parents, contact info, lists, and the only
spreadsheet import. A board's **Access & people** tab keeps who is on that board and their group and tags
there (groups and tags are per board). Add people with **Add from People** (search, filter by list / team,
Check all shown; group "Match their team" puts each person in the board group named like
their team) or **Quick add someone new** (first + last name required; "Add all details" for athlete/adult,
team, SE group, birth year, jersey, parent emails or the adult's email/phone, notes; saved in People). Names
link to People for editing. Checked people: Set group, Add/Remove tag, Remove from board (they stay in People).


## Board tabs as cards
Board details, Access & people, and Board defaults each show a grid of cards (like App settings), each with
its current value; **Open** shows just that section under the board header with "← Back to …"
(?card=<id> in the address). Saves return to the same card. Board details now uses folder sub-tabs instead:
General (name, dates, location, description, whether sessions have dates and times) · Type & look (Program /
Volunteer, available views, picture, short code) · Organizers · Structure & names (level names only) (&sub= in the address). They share one form, so saving a sub-tab keeps everything else. Access & people now uses folder sub-tabs: <People word>
(the list, count, + Add people opens Add from People / Quick add above it) · Groups & tags (intro, copy from another
board, Groups, Tags) · Group shortcuts (boards with 3+ levels). &sub= in the address; old ?card= links map on. Board defaults now uses folder sub-tabs: Who (who can
claim, who's going) · Limits & timing · Question & attendance · Level changes (with a count). &sub= in the address;
saves return to their sub-tab.


## App Settings header
Every App settings page uses the same header: navy band (App Settings, live counts of people / requests
waiting / admins, no page buttons; the gray bar holds only the tabs): People (red badge
when requests are waiting) · Accounts & sign-in · Organization. App Settings opens on People. Areas with more
than one page have a second row of sub-tabs: People → People · Requests; Accounts & sign-in → Account settings ·
Administrators · Sign-in activity; Organization → Locations · Wording. Sub-tabs are folder tabs on a white sheet. A person's page and Import light People. Each page's own buttons and filters sit below
the header: People's toolbar (+ Add person, Import, + New list; filters: List, search, kind, role, team), Requests (Show: Waiting / Handled / All), Sign-in activity (search, Only problems),
Locations (search).


## Lists instead of SportsEngine group
The SportsEngine group field is gone. On first start of this version, any existing values become lists of the
same name (with those people on them), then the old column is dropped. The People import has **Make lists
from this column** (guessed from columns like Program or SportsEngine Group): each person goes on the list
named in that column, creating lists as needed, in addition to the optional "put everyone on a list".

**People table:** a **Lists** column (each person's lists as chips) and a **Status** column: adults are Active
(last sign-in date) / Invited / Not invited / Needs setup / No email; athletes are Ready (a parent is linked) /
No parent (nobody can claim for them yet). The **Status** filter in the People toolbar uses the same rule, e.g.
Not invited → Check all shown → Send invite.


## Athletes who sign in themselves
An athlete's People page has **Own sign-in & family sharing**: their own email (they sign in like any adult:
link, password, Welcome step, invites), plus **Family can see and manage their claims** and **Family gets the
emails** (both on by default). Signed in, the athlete sees themselves by name on My Claims and sign-up pages. Sharing off hides
them from parents' My Claims / removes parents from their claim emails. Admins can always change it; the athlete
can change it in My Account → My family & sharing only when 18+ (by birth year). One person, one record: an
athlete can also hold adult roles (volunteer, coach); giving an athlete the email of an unused adult record folds
that record in (archived), and an adult record with family, boards, or claims is refused with a message.
Status in People: an athlete with their own sign-in shows the sign-in statuses (Active, Invited, …).

**Names, never "Me" / "You":** everywhere people are shown (My Claims family filter, claim lines, the sign-up page's
person pills and limits, confirmation messages, My Account), the person's first name is used, or their email when no
name is on file. The public link's confirmation uses the name the visitor typed.

**Board type:** Program (sessions or events people take part in: training, clinics, camps) or Volunteer. Program is
shown everywhere Training used to be (Board details, dashboard cards, My Claims badges); stored value unchanged.


## My Claims header and card pictures
My Claims has the same navy header as other pages (My Claims, the signed-in person's name or email, upcoming claims
and the next one). Its two cards, Your Upcoming Claims and Sign Up for Something, have navy header bars; each can
show a picture set in App Settings → Organization → Pictures (stored in the app_images table, served at
/img/app/<key>, resized to 1600px wide in the browser). The picture sits on the right fading into navy; without one
the bar is navy with lime stripes. Board pictures (Board details → Type & look) are unchanged.

**Organizers:** a board can have several (Board details → Organizers: one row each, + Add organizer, ×). Stored in
schedules.organizers; every page and email shows them on one line ("Questions? Jane Smith (jane@…) · Bob Lee (715…)"),
or name and contact as before when there's just one. Existing organizers carried over.


## Sign-up page layout
The family sign-up page (/b/<id>), the public link (/s/<code>), and admin Preview share the app's layout:
← My Claims (or ← Back to Setup in Preview; none on the public link) · navy header (board picture or short-code tile,
name, Program/Volunteer badge, dates · location · organizers) · gray bar: "Signing up for" with a tab per person on the
left and their remaining spots on the right ("Previewing as" picker in Preview; "No account needed" on the public link) ·
folder sub-tabs List · Calendar (when sessions have dates) · white sheet: description, one row with By <activity level> ·
By day on the left (month arrows in Calendar) and the filters on the right, then the sessions or calendar.

**Remaining spots line:** lists each limit that applies to the selected person, and adds "no limit on anything else" when
there's no board-wide limit and some of what they can see isn't under any limit.

**Scrolling on the sign-up page:** the page fits the window and only the list (or the calendar) scrolls; everything above
it stays put, so you can switch person or view at any time. The scroll spot is remembered across claiming, cancelling,
and switching person (per board and view). Windows too short for this (under ~260px of room) fall back to normal page
scrolling. The description shows as one line in the header (tap to expand); filters carry their label in the first choice.


## My Account layout
Navy header (My Account, name · email) · two tabs with folder sub-tabs: Account → Profile · Access, where Profile
is one page of rows (Name, Phone, Sign-in email, Password), each showing the current value with Change, which opens
that row's existing form (email: new address + confirmation link; password: current + new, or set) with Cancel; Family → Family members (+ Add a family member opens the add form; each person
has Change, a request about that person) · Sharing (athletes who sign in) · My requests (count). Old ?tab=profile/signin/access/requests links land on the matching sub-tab. ?tab=&sub= in the address; saves return to
their spot, and sending a request lands on My requests.

**Fix:** a one-time cleanup ("people who sign in are adults") was running on every start, which would have turned
athletes who sign in themselves into adults. It now runs once (app_flags kind_adult_fix_v1) and never touches
anyone with linked parents or a birth year.


## Check-in layout
Day list: navy header (Check-in, day · sessions · claimed · checked in) · gray bar with ‹ day › and Today · folder
sub-tabs per board when more than one board has sessions that day (All boards · …; ?b=) · session cards on the sheet.
Roster: ← the day · header (session, board • path · time · place) · gray bar with live counts and progress (left) and
Mark the rest here (right; asks first, marks only people not yet marked) · one list "Signed up (count)" with
+ Add walk-in on top (opens the fields; the walk-in joins the list marked here) and the Waitlist underneath · only the
list scrolls · big ✓ / ✗ buttons on phones. Check-in and Reports use the same 1440px page width as other pages. Fix: list-only scrolling now measures against the page's content, so short lists
work too.

**Reports layout:** navy header (Reports, board · team · people · claims · attended) · gray bar with the Board picker (and
Team when there's more than one) on the left and Download CSV on the right · folder sub-tabs By person · All claims
(with counts) · notes and the table on the sheet.

**Check-in lock:** Board defaults → Question & attendance → Attendance → "Lock check-in for coaches": at the end of the
session's day · at the end of the next day (default) · 2 days after · 1 week after · never (schedules.settings.checkin_lock
= days, -1 = never). After it, coaches see the session read-only ("Check-in closed Sat, Oct 31"; marking, Mark the rest
here, and walk-ins are refused on the server too). Before it: "Open until …". Admins can always change it ("Closed for
coaches …. You can still change it."). The roster's back button reads "Back to Check-in".


## Old system removed (v0.24.0)
Removed the pre-rebuild pages and routes: routes/{import,rounds,seasons,roster,reports,admin,public,checkin,parent}.js and
views/{rounds,seasons,roster,parent,checkin,reports,public,import}.js. Shared helpers moved to views/dates.js. Old
addresses redirect: /admin, /admin/rounds|seasons|programs|sessions|day|import → All Boards; /admin/athletes → People;
/admin/reports → Reports; /athletes/… and /request-change → My Claims; /admin/settings/archived → the dashboard's
Archived tab. Old data in the database is left as is.

**A session's People page** (Board setup → a session → People): ← Back to Setup · the board header (Board setup lit) ·
the session line · "In this spot (n of capacity)" with + Add someone (opens the add form above the list) · Waitlist.
