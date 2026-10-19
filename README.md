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
- 2 levels: e.g. Area › Shift. Areas are made right on the board (just a name); each shift/item
  has its own spots and, if the board has dates, its own date and time. No calendar builder.
- 3 levels: e.g. Round › Activity › Session (Winter Training).
- 4 levels: e.g. Day › Area › Station › Shift.
Boards with 1–2 levels show three numbered steps on their page (1 Add items, 2 Rules: per-person
limit, waitlist, when claiming opens, a question to ask when people claim (your wording;
optionally required; answers shown to others or kept private), and for dated boards the give-it-up
deadline; 3 Publish &
share, with the share link only for "Anyone with the link") and keep their rules (who signs up, limits, unlocking, waitlist, publish) on the
board's Setup page. Anything claimable can have a date and time, or be an undated item with a name;
undated items show as a list on My Claims and the public page, and have no give-it-up deadline.
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
Reports · ⚙ App); phones keep the bottom bar.

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
