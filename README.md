# Raptors Training Scheduler

Training reservations for Chippewa Valley Raptors families, launched from the private
SportsEngine **Training Sign-Up** page.

Flow: SportsEngine private page → this app → email sign-in link → My training → book sessions.

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
