const { esc } = require("./layout");
const { page } = require("./admin");
const { colorFor } = require("../config");
const { fmtTime } = require("../time");
const { typeLabel, limitFor, isUnlocked } = require("../rounds");

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return `${DAYS[dt.getUTCDay()]}, ${MON[m - 1]} ${d}, ${y}`; };

const sessionLabel = (s) => `${fmtTime(s.starts_at)} ${typeLabel(s.activity, s.age_groups, s.required_tags)}`;

function person(p, i, waitlist, ctx) {
  const { s, date, sessions } = ctx;
  const back = `/admin/day/${date}#s${s.id}`;
  const others = sessions.filter((x) => x.id !== s.id && !x.locked);
  return `<li><details class="who-row"><summary>
      <span class="who-n">${waitlist ? `W${i + 1}` : i + 1}</span>
      <span class="who-name">${esc(p.first_name)} ${esc(p.last_name)}</span>
      ${p.age_group ? `<span class="who-group">${esc(p.age_group)}</span>` : ""}
      ${p.counts_toward_limit ? "" : `<span class="who-tag" title="Took an unlocked spot">open spot</span>`}
    </summary>
    <div class="who-more">
      <div>${p.emails.length ? p.emails.map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join("<br>") : "No parent email linked"}
        · <a href="/admin/athletes/${p.athlete_id}">Athlete page</a></div>
      ${s.locked ? "" : `<div class="who-actions no-print">
        ${waitlist ? `<form method="post" action="/admin/reservations/${p.id}/promote"><input type="hidden" name="return_to" value="${esc(back)}">
          <button class="btn-ghost" type="submit">Move in</button></form>` : ""}
        <form method="post" action="/admin/reservations/${p.id}/cancel" onsubmit="return confirm('Remove ${esc(p.first_name)} from this session? They'll be emailed.')">
          <input type="hidden" name="return_to" value="${esc(back)}"><button class="btn-ghost danger" type="submit">Remove</button></form>
        ${others.length ? `<form method="post" action="/admin/reservations/${p.id}/move" class="move-form">
          <input type="hidden" name="return_to" value="/admin/day/${date}">
          <select name="to_session_id" required aria-label="Move to"><option value="">Move to…</option>
            ${others.map((x) => `<option value="${x.id}">${esc(sessionLabel(x))} (${x.booked.length}/${x.capacity})</option>`).join("")}</select>
          <label class="check"><input type="checkbox" name="over" value="1"> Add anyway</label>
          <button class="btn-ghost" type="submit">Move</button></form>` : ""}
      </div>`}
    </div>
  </details></li>`;
}

function namesList(s, ctx) {
  const c = { ...ctx, s };
  return `${s.booked.length ? `<ol class="who-list">${s.booked.map((p, i) => person(p, i, false, c)).join("")}</ol>` : `<p class="muted small">No one yet.</p>`}
    ${s.waiting.length ? `<p class="label-like wl">Waitlist</p><ol class="who-list wait">${s.waiting.map((p, i) => person(p, i, true, c)).join("")}</ol>` : ""}
    ${addForm(s, ctx)}`;
}

// Add any athlete (admins skip limits and group rules); the session's own groups are listed first
function addForm(s, { date, athletes }) {
  if (s.locked) return "";
  const inIds = new Set([...s.booked, ...s.waiting].map((p) => p.athlete_id));
  const pool = athletes.filter((a) => !inIds.has(a.id));
  if (!pool.length) return "";
  // "fits" = on this schedule's roster, in one of the session's groups
  const grp = (a) => (a.mem && Object.prototype.hasOwnProperty.call(a.mem, String(s.schedule_id)) ? a.mem[String(s.schedule_id)] : null);
  const fit = (a) => grp(a) !== null && (!s.age_groups.length || s.age_groups.includes(grp(a)));
  const fits = pool.filter(fit);
  const rest = pool.filter((a) => !fit(a));
  const opt = (a) => `<option value="${a.id}">${esc(a.last_name)}, ${esc(a.first_name)}${grp(a) ? ` (${esc(grp(a))})` : ""}</option>`;
  return `<details class="add-who no-print"><summary>+ Add athlete</summary>
    <form method="post" action="/admin/sessions/${s.id}/add">
      <input type="hidden" name="return_to" value="/admin/day/${date}#s${s.id}">
      <select name="athlete_id" required aria-label="Athlete"><option value="">Choose athlete…</option>
        ${fits.length ? `<optgroup label="On the roster for this">${fits.map(opt).join("")}</optgroup>` : ""}
        ${rest.length ? `<optgroup label="Everyone else">${rest.map(opt).join("")}</optgroup>` : ""}</select>
      <label class="check"><input type="checkbox" name="over" value="1"> Add anyway if full (adds a spot)</label>
      <button class="btn-small" type="submit">Add</button>
    </form>
    <p class="fine">Admins can add anyone, past the limits. They get the usual confirmation email.</p>
  </details>`;
}

const lockMark = (s) => {
  const round = { unlock_hours: s.unlock_hours, activity_limits: s.activity_limits, priority_limit: s.priority_limit, schedule_id: s.schedule_id };
  return s.round_id && limitFor(round, s.activity) != null && isUnlocked(s, round) ? ` <span title="Unlocked: open to all athletes">🔓</span>` : "";
};

function rosterPage({ user, flash, date, sessions, athletes, prev, next }) {
  const ctx = { date, sessions, athletes };
  // One card per session; split sessions (blocks) are grouped into one card per program
  const cards = [];
  for (const s of sessions) {
    if (s.block_minutes) {
      let c = cards.find((x) => x.blocks && x.program_id === s.program_id);
      if (!c) cards.push((c = { ...s, blocks: [] }));
      c.blocks.push(s);
    } else cards.push(s);
  }
  const total = sessions.reduce((n, s) => n + s.booked.length, 0);
  const athleteCount = new Set(sessions.flatMap((s) => s.booked.map((p) => p.athlete_id))).size;
  return page({
    title: `Who's signed up · ${longDay(date)}`, tab: "setup", user, flash, xwide: false,
    body: `<div class="day-nav no-print">
      <a class="back" href="javascript:history.back()">Back</a><span class="spacer"></span>
      <button class="btn-ghost" type="button" onclick="window.print()">Print</button>
      ${prev ? `<a class="month-nav" href="/admin/day/${prev}" aria-label="Previous training day">‹</a>` : `<span class="month-nav off">‹</span>`}
      ${next ? `<a class="month-nav" href="/admin/day/${next}" aria-label="Next training day">›</a>` : `<span class="month-nav off">›</span>`}
    </div>
    <section class="panel">
      <h1>Who's signed up</h1>
      <p class="muted tight"><strong>${esc(longDay(date))}</strong>. ${sessions.length ? `${cards.length} session${cards.length === 1 ? "" : "s"}, ${total} spot${total === 1 ? "" : "s"} claimed by ${athleteCount} athlete${athleteCount === 1 ? "" : "s"}.` : "No sessions on this day."}</p>
    </section>
    ${cards.map((c) => `<section class="panel who-card" id="${c.blocks ? `p${c.program_id}` : `s${c.id}`}" style="--c:${colorFor(c.activity, c.schedule_id)}">
      <div class="who-head">
        <div><h2>${esc(typeLabel(c.activity, c.age_groups, c.required_tags))}${c.blocks ? "" : lockMark(c)}</h2>
          <p class="muted tight">${esc(fmtTime(c.starts_at))}–${esc(fmtTime((c.blocks ? c.blocks[c.blocks.length - 1] : c).ends_at))}${c.round_name ? ` · ${esc(c.round_name)}` : ""}${c.location ? ` · ${esc(c.location)}` : ""}${c.coach ? ` · Coach ${esc(c.coach)}` : ""}</p></div>
        ${c.blocks ? `<span class="pill">${c.blocks.reduce((n, b) => n + b.booked.length, 0)}/${c.blocks.reduce((n, b) => n + b.capacity, 0)}</span>`
          : `<span class="pill${c.booked.length >= c.capacity ? " wait" : " ok"}">${c.booked.length}/${c.capacity}</span>`}
      </div>
      ${c.locked ? `<p class="rule no-print">Archived Claim Board: read-only.</p>` : ""}
      ${c.blocks ? `<div class="who-blocks">${c.blocks.map((b) => `<div class="who-block" id="s${b.id}">
          <div class="who-block-head"><b>${esc(fmtTime(b.starts_at))}</b>${lockMark(b)} <span>${b.booked.length}/${b.capacity}</span>
            <a class="link-dark sm no-print" href="/admin/sessions/${b.id}">Manage</a></div>
          ${namesList(b, ctx)}</div>`).join("")}</div>`
        : `${namesList(c, ctx)}<p class="no-print"><a class="link-dark" href="/admin/sessions/${c.id}">Edit, unlock, or cancel this session</a></p>`}
      ${c.notes ? `<p class="fine">${esc(c.notes)}</p>` : ""}
    </section>`).join("")}`,
  });
}

module.exports = { rosterPage };
