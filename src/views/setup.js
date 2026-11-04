const { esc } = require("./layout");
const { page } = require("./admin");
const { colorFor } = require("../config");
const { typeLabel, defaultsFor } = require("../rounds");
const { niceRange, shortRange, statusPill } = require("./dates");
const { blockSelect, spotsLabel, limitsForm } = require("./partials");
const SC = require("../schedules");
const { LABELS } = require("../config");

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
let CUR = { id: "" };
const home = () => `/admin/setup?s=${CUR.id}`;
const back = (anchor) => `<input type="hidden" name="return_to" value="${home()}${anchor ? `#${anchor}` : ""}">`;
const swatch = (a) => `<span class="swatch" style="background:${colorFor(a, CUR.id)}"></span>`;

// Items without a date (and titled ones), with spots and who's claimed
// "Only for" picker for one item: groups and tags, in a small dropdown
const LEVEL_INFO = {
  middle: () => ["The top grouping, like a season part or a day. Settings here (limits, timing, who can claim) cover everything inside it.", "Round, Day, Week"],
  section: () => ["A grouping inside the level above, like an area of a tournament. Its settings cover what's inside it.", "Area, Field, Team"],
  activity: (last) => [last ? "What people claim, with spots." : "A grouping of what people claim, like an activity or area. Its settings (who, limits, attendance) cover what's inside it.", "Activity, Area, Category"],
  slot: () => ["What people claim. It has a number of spots, and can have a date and time or just be a named item.", "Session, Shift, Task, Item"],
  participant: () => ["The people who use this board. They can be kids, parents/guardians, or anyone.", "Athlete, Volunteer"],
  group: () => ["How people are sorted, so things can be limited to certain groups.", "12U, Team, Level"],
};

// Board type: training or volunteer (decides the My Claims tab). Guessed from the wording until set.
function boardTypeOf(sc) {
  if (sc && ["training", "volunteer", "rsvp"].includes(sc.board_type)) return sc.board_type;
  const L = SC.labels(sc || {});
  return /volunteer|helper|worker/i.test(L.participant.one) || /shift/i.test(L.slot.one) ? "volunteer" : "training";
}
function boardTypeField(sc) {
  const cur = sc ? boardTypeOf(sc) : "training";
  const r = (v, t, d) => `<label class="mode-opt"><input type="radio" name="board_type" value="${v}"${cur === v ? " checked" : ""}><span><b>${t}</b><span class="fine">${d}</span></span></label>`;
  return `<div class="opt-row">${r("training", "Program", "Sessions or events people sign up to take part in, like training, clinics, or camps.")}${r("rsvp", "RSVP", "Events your athletes answer Going or Can't make it, like team events, meetings or games. No spots to claim.")}${r("volunteer", "Volunteer", "Shifts and jobs people help with.")}</div>`;
}
// Board picture: shown on My Claims and the board's sign-up page instead of the logo.
// The browser shrinks it (max 640px) before it's sent.
// Initials from a board name: "Winter Training 2027" -> "WT", "Raptors Rumble Volunteers" -> "RRV"
function initials(name) {
  const w = String(name || "").split(/\s+/).filter((x) => /^[A-Za-z]/.test(x));
  const code = (w.length >= 2 ? w.slice(0, 3).map((x) => x[0]).join("") : w.length === 1 ? w[0].slice(0, 2) : String(name || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 2)).toUpperCase();
  return code.length >= 2 ? code.slice(0, 3) : (code + "B").slice(0, 2);
}
const codeOf = (sc) => (sc && sc.short_code) || initials(sc && sc.name);
function imagePicker(sc) {
  const has = !!(sc && sc.image);
  const code = sc ? codeOf(sc) : "";
  const src = has ? `/img/board/${sc.id}?v=${sc.image_at ? new Date(sc.image_at).getTime() : 0}` : "/claim-it-logo-sm.png";
  return `<div class="img-pick">
    <span class="img-prev${has ? "" : " code"}"><img src="${src}" alt="Board picture"${has ? "" : " hidden"}><b class="img-code">${esc(code)}</b></span>
    <div class="img-ctl">
      <label class="btn-ghost img-btn">Choose picture<input type="file" accept="image/*" hidden></label>
      <button type="button" class="link-dark img-rm"${has ? "" : " hidden"}>Remove picture</button>
      <label class="code-l"><span>Short code <span class="opt">${has ? "(optional with a picture)" : "(2–3 letters, shown when there's no picture)"}</span></span>
        <input name="short_code" class="code-in" maxlength="3" value="${esc(code)}" placeholder="e.g. WT" ${has ? "" : 'required pattern="[A-Za-z0-9]{2,3}"'} title="2–3 letters or numbers" autocomplete="off"></label>
      <input type="hidden" name="image_data" value="">
    </div>
  </div>`;
}
const IMAGE_JS = `<script>
(function () {
  document.querySelectorAll(".img-pick").forEach(function (box) {
    var file = box.querySelector("input[type=file]"), data = box.querySelector("input[name=image_data]"), img = box.querySelector(".img-prev img"), rm = box.querySelector(".img-rm");
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var im = new Image(); im.onload = function () {
          var k = Math.min(1, 640 / Math.max(im.width, im.height)), c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          var url = c.toDataURL("image/jpeg", 0.82);
          data.value = url; img.src = url; img.hidden = false; box.querySelector(".img-prev").classList.remove("code"); rm.hidden = false; setCode(false);
        }; im.src = r.result;
      };
      r.readAsDataURL(f);
    });
    rm.addEventListener("click", function () { data.value = "remove"; img.hidden = true; box.querySelector(".img-prev").classList.add("code"); rm.hidden = true; file.value = ""; setCode(true); });
    var code = box.querySelector(".code-in"), tile = box.querySelector(".img-code"), hint = box.querySelector(".code-l .opt");
    function setCode(req) { code.required = req; if (req) code.setAttribute("pattern", "[A-Za-z0-9]{2,3}"); else code.removeAttribute("pattern");
      hint.textContent = req ? "(2–3 letters, shown when there's no picture)" : "(optional with a picture)"; }
    code.addEventListener("input", function () { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); tile.textContent = code.value || "?"; code.dataset.touched = "1"; });
    // new board: suggest a code from its name as it's typed
    var nm = document.getElementById("wz-name");
    if (nm && !code.value) nm.addEventListener("input", function () { if (code.dataset.touched) return;
      var w = nm.value.split(/\\s+/).filter(function (x) { return /^[A-Za-z]/.test(x); });
      var c = (w.length >= 2 ? w.slice(0, 3).map(function (x) { return x[0]; }).join("") : w.length === 1 ? w[0].slice(0, 2) : nm.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 2)).toUpperCase();
      code.value = c; tile.textContent = c || "?"; });
  });
})();
</script>`;

// Levels and what they're called (the board's structure), used by the board's Edit window
function levelsTable(sc, hasItems, counts = []) {
  const L = SC.labels(sc), depth = SC.depthOf(sc), keys = SC.levelKeys(sc);
  const pick = SC.pickMode(sc);
  const radio = (name, value, cur, title, text) => `<label class="mode-opt"><input type="radio" name="${name}" value="${value}"${cur === value ? " checked" : ""}><span><b>${title}</b>${text ? `<span class="fine">${text}</span>` : ""}</span></label>`;
  const total = counts.reduce((a, b) => a + b, 0);
  return `<div class="struct-now">
      <p class="fine">This board has <b>${depth} level${depth === 1 ? "" : "s"}</b>. Each level holds the one below it, and the last level is what people claim.</p>
      <ol class="struct-levels">${keys.map((k, i) => `<li><b>Level ${i + 1}: ${esc(L[k].many)}${i === keys.length - 1 ? ` <span class="pill ok claim-pill">Claimed</span>` : ""}</b>
        <span class="fine">${esc(LEVEL_INFO[k](i === keys.length - 1)[0])}</span><span class="struct-count">${counts[i] ?? 0} now</span></li>`).join("")}</ol>
    </div>
    ${hasItems ? `<p class="lock-note">🔒 <b>The number of levels is locked</b> because this board already has ${total} thing${total === 1 ? "" : "s"} on it. To use a different number of levels, copy the board without its contents and set up the copy. Renaming the levels below is always fine.</p><input type="hidden" name="depth" value="${depth}">`
      : `<label class="field-l">Levels<select name="depth">
          ${[1, 2, 3, 4].map((n) => `<option value="${n}"${depth === n ? " selected" : ""}>${n} level${n === 1 ? "" : "s"}</option>`).join("")}</select>
          <span class="fine">You can change this while the board is empty.</span></label>`}
    <p class="q-label">What things are called</p>
    <div class="table-wrap"><table class="levels">
      <thead><tr><th>Level</th><th>One</th><th>Many</th></tr></thead>
      <tbody>${keys.map((k, i) => `<tr>
        <td><strong>Level ${i + 1}</strong>${i === keys.length - 1 ? ` <span class="pill ok claim-pill">Claimed</span>` : ""}<div class="fine">e.g. ${esc(LEVEL_INFO[k](i === keys.length - 1)[1])}</div></td>
        <td><input name="${k}_one" value="${esc(L[k].one)}" maxlength="24" required aria-label="Level ${i + 1} singular"></td>
        <td><input name="${k}_many" value="${esc(L[k].many)}" maxlength="24" required aria-label="Level ${i + 1} plural"></td></tr>`).join("")}
        ${["participant", "group"].map((k) => `<tr class="people-row">
        <td><strong>${k === "participant" ? "People" : "Their groups"}</strong><div class="fine">e.g. ${esc(LEVEL_INFO[k]()[1])}</div></td>
        <td><input name="${k}_one" value="${esc(L[k].one)}" maxlength="24" required></td>
        <td><input name="${k}_many" value="${esc(L[k].many)}" maxlength="24" required></td></tr>`).join("")}
      </tbody></table></div>
    <p class="q-label">Do ${esc(L.slot.many.toLowerCase())} have dates and times?</p>
    <div class="opt-row">
      ${radio("dated", "no", pick === "list" ? "no" : "yes", "No", "People pick from a list.")}
      ${radio("dated", "yes", pick === "list" ? "no" : "yes", "Yes", `Each ${esc(L.slot.one.toLowerCase())} has a date and time.`)}
    </div>
    <div class="sub-q dlg-views"${pick === "list" ? " hidden" : ""}>
      <p class="q-label">Available views</p>
      <div class="opt-row three">
        ${radio("pick", "list", pick === "dlist" ? "list" : pick, "List", "Day by day.")}
        ${radio("pick", "calendar", ["calendar", "list"].includes(pick) ? "calendar" : pick, "Calendar", "A month calendar.")}
        ${radio("pick", "both", pick, "Both", "People can switch.")}
      </div>
    </div>`;
}

// Plain-language descriptions of "Who can claim", used by the wizard and Settings
function claimHelp(L) {
  const org = require("../config").LABELS.org_name || "your organization";
  const people = (L ? L.participant.many : "people").toLowerCase();
  return {
    public: `Anyone who has the link (or QR code) can claim with just a name and email, no account needed. People who already have an account also see it on My Claims. The link isn't secret, so anyone it's shared with can use it. <i>Best for volunteer sign-ups and public events.</i>`,
    family: `Only people with an approved ${esc(org)} Claim It account can see it and claim. Newcomers can request an account, or you can send them an invite. <i>Best for club-wide events.</i>`,
    roster: `Only the ${esc(people)} assigned to this board can claim, or a family member linked to them, claiming for them. <i>Best for training or team-only events.</i>`,
  };
}

// "Sat, Feb 7, 2026" or "Feb 7–8, 2026"
function eventDates(sc) {
  if (!sc.event_date) return "";
  const f = (d, o) => new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", o);
  if (!sc.event_end) return f(sc.event_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return `${f(sc.event_date, { month: "short", day: "numeric" })} – ${f(sc.event_end, { month: "short", day: "numeric", year: "numeric" })}`;
}

// when a session's check-in locks for coaches: days after the session's day (-1 = never)
const LOCKS = { "0": "At the end of the session's day", "1": "At the end of the next day", "2": "2 days after", "7": "1 week after", "-1": "Never" };
const lockDays = (sc) => { const v = sc && sc.settings && sc.settings.checkin_lock; return v == null || !(String(v) in LOCKS) ? 1 : Number(v); };
function scheduleSettingsPage({ user, flash, sc, counts, part = "structure", main = null, overrides = [], head = "", sub = "who" }) {
  const L = SC.labels(sc);
  const I = require("./icons");
  const P = require("../locations");
  const tab = { structure: "schedule", more: "schedule-more", archive: "schedule-archive" }[part] || "schedule";
  if (part === "archive") return page({ title: `Settings · ${sc.name}`, tab, user, flash, body: `<section class="panel"><h1>Archive or delete</h1>
      <p class="muted tight">When ${esc(sc.name)} is over, archive it: it's hidden from people and read-only, and its reports stay. Delete is only for empty boards.</p></section>
<section class="panel"><h1>Archive or delete</h1>
      <p class="muted tight">When ${esc(sc.name)} is over, archive it: it's hidden from people and read-only, and its reports stay. Delete is only for empty boards.</p></section>
    <section class="panel">
      <h2>${sc.archived_at ? "Archived" : "Archive"}</h2>
      <p class="muted">${sc.archived_at ? `People can't see anything in ${esc(sc.name)}. Restore it to make it active again.`
        : `Archiving hides ${esc(sc.name)} from people and moves it to the Archived list in Settings. Nothing is deleted, and you can restore it any time.`}</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/archive?s=${sc.id}"><button class="btn-ghost" type="submit">${sc.archived_at ? "Restore" : "Archive"} ${esc(sc.name)}</button></form>
    </section>
    <section class="panel">
      <h2>Delete</h2>
      <p class="muted">${counts.items ? `It has ${counts.items} ${esc(L.top.many.toLowerCase())}/${esc(L.middle.many.toLowerCase())}, so it can't be deleted until those are removed.` : `It's empty, so it can be deleted. ${counts.members ? `Its ${counts.members} ${esc(L.participant.many.toLowerCase())} stay in the app.` : ""}`}</p>
      <form method="post" action="/admin/setup/schedules/${sc.id}/delete?s=${sc.id}" onsubmit="return confirm('Delete the ${esc(sc.name)} schedule?')">
        <button class="btn-ghost danger" type="submit"${counts.items ? " disabled" : ""}>Delete ${esc(sc.name)}</button></form>
    </section>` });
  const radio = (name, value, cur, title, text, ex) => `<label class="mode-opt"><input type="radio" name="${name}" value="${value}" data-label="${esc(title.replace(/<[^>]+>/g, ""))}"${cur === value ? " checked" : ""}><span><b>${title}</b>${text ? `<span class="fine">${text}</span>` : ""}${ex ? `<span class="ex">e.g. ${esc(ex)}</span>` : ""}</span></label>`;
  const claim = SC.claimMode(sc), pick = SC.pickMode(sc), depth = SC.depthOf(sc);
  const EX = require("../examples").forDepth(depth);
  const CLAIM = { public: "Anyone with the link", family: "Anyone with an account", roster: "Only people assigned to the board" };
  const VIEWS = { list: "No dates: a list", dlist: "Dates and times: list view", calendar: "Dates and times: calendar", both: "Dates and times: list & calendar" };
  const WHO = { initial: "First name + initial", full: "Full names", off: "Hidden" };
  const action = `/admin/setup/schedules/${sc.id}?s=${sc.id}`;
  const rows = (list) => `<dl class="ss-rows">${list.filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  // One setup section: icon, title, description, Edit at top right; Edit swaps the answers for its form
  const sec = (id, icon, title, sub, view, form) => `<section class="ss" id="ss-${id}" data-card="${id}">
      <div class="ss-head"><span class="ss-ico">${icon}</span><div class="ss-titles"><h3>${title}</h3><p class="fine">${sub}</p></div>
        <button type="button" class="btn-ghost ss-edit">${I.pencil()} Edit</button></div>
      <div class="ss-view">${view}</div>
      <form method="post" action="${action}" class="ss-form" hidden><input type="hidden" name="q" value="${id}">${form}
        <div class="q-actions"><button class="btn-small" type="submit">Save</button><button type="button" class="btn-ghost ss-cancel">Cancel</button></div></form>
    </section>`;
  const levelLine = SC.levelKeys(sc).map((k) => esc(L[k].many)).join(" › ");
  const groups = SC.groupsFor(sc), tags = sc.tags || [];
  const chips = (list) => list.map((x) => `<span class="chip-s">${esc(x)}</span>`).join("");
  const published = !!counts.published;
  // inline editors in the header (name, event date, location)
  const inline = (id, view, form) => `<span class="inl" id="inl-${id}"><span class="inl-view">${view}<button type="button" class="pencil" aria-label="Edit">${I.pencil()}</button></span>
      <form method="post" action="${action}" class="inl-form" hidden><input type="hidden" name="q" value="${id}">${form}
        <button type="button" class="btn-ghost inl-cancel">Cancel</button><button class="btn-small" type="submit">Save</button></form></span>`;
  const dates = eventDates(sc);
  return page({
    title: `${sc.name} Settings`, tab, user, flash, xwide: true,
    body: `${head}
    <nav class="sub-tabs" aria-label="Board defaults">${[["who", "Who"], ["limits", "Limits &amp; timing"], ["qa", "Question &amp; attendance"], ...(depth > 1 ? [["levels", "Level changes"]] : [])]
      .map(([k, l]) => `<a href="/admin/setup/schedule?s=${sc.id}&sub=${k}"${k === sub ? ' aria-current="page"' : ""}>${l}${k === "levels" && overrides.length ? ` <i class="sub-n">${overrides.length}</i>` : ""}</a>`).join("")}</nav>
    <div class="settings-one" data-sub="${esc(sub)}">
    <p class="scope-note"><b>Board defaults for ${esc(sc.name)} only.</b> They apply to everything on this board, not other boards. ${depth > 1 ? `Any level can change them in its own ⚙ Settings on the <a href="/admin/setup?s=${sc.id}">Setup</a> tab.` : ""}</p>
    ${depth > 1 ? `<section class="ss" id="ss-levels" data-card="levels" data-order="90" data-title="Levels with their own settings" data-sum="${overrides && overrides.length ? `<b>${overrides.length}</b> level${overrides.length === 1 ? "" : "s"} change these defaults` : "None: every level uses the defaults"}" data-sub="Where a level changed a default">
      <span class="card-ico" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="5" rx="1"/><rect x="2.5" y="16.5" width="6" height="5" rx="1"/><rect x="15.5" y="16.5" width="6" height="5" rx="1"/><path d="M12 7.5V12M5.5 16.5V12h13v4.5"/></svg></span>
      <div class="ss-head"><div class="ss-titles"><h3>Levels with their own settings</h3><p class="fine">Each one changes a board default for everything inside it. Click a level to open it on the Setup tab.</p></div></div>
      ${overrides && overrides.length ? `<ul class="ovr-list">${overrides.map((o) => `<li><a href="/admin/setup?s=${sc.id}&n=${o.id}">${esc(o.path.join(" › "))}</a><span>${esc(o.c.join(" · "))}</span></li>`).join("")}</ul>` : `<p class="muted">No level has changed a default yet.</p>`}</section>` : ""}
    <section class="panel setup-panel" id="setup-form">

      ${sec("who", I.users(), "Who can claim", "Who can see this board and claim from it, and whether some things are limited.",
        rows([["Who can claim", `${CLAIM[claim]}<div class="fine">${{ public: "No account needed; anyone with the link. People with an account also see it on My Claims.", family: "Only people with an approved account.", roster: `Only the ${esc(L.participant.many.toLowerCase())} assigned to this board, or family linked to them.` }[claim]}</div>`], claim === "public" ? null : [`Limit some ${esc((depth > 1 ? L.activity.many : L.slot.many).toLowerCase())}`, sc.restricted ? `Yes, by ${esc(L.group.one.toLowerCase())} or tag` : "No"]]),
        `<div class="opt-row three">
          ${radio("claim", "public", claim, "Anyone with the link", claimHelp(L).public, EX.claim.public)}
          ${radio("claim", "family", claim, "Anyone with an account", claimHelp(L).family, EX.claim.family)}
          ${radio("claim", "roster", claim, "Only people assigned to the board", claimHelp(L).roster, EX.claim.roster)}
        </div>
        <div class="sub-q" data-restrict${claim === "public" ? " hidden" : ""}>
          <p class="q-label">Limit some ${esc((depth > 1 ? L.activity.many : L.slot.many).toLowerCase())} to certain people?</p>
          <div class="opt-row">
            ${radio("restrict", "no", sc.restricted ? "yes" : "no", "No", "Anyone who can claim can claim anything.")}
            ${radio("restrict", "yes", sc.restricted ? "yes" : "no", `Yes, by ${esc(L.group.one.toLowerCase())} or tag`, "", EX.restrict)}
          </div>
        </div>
        <p class="fine" data-public-note${claim === "public" ? "" : " hidden"}>With "Anyone with the link" people are anonymous, so there's nothing to limit by ${esc(L.group.one.toLowerCase())} or tag.</p>`)}

      ${sec("see", I.calendar(), "Who's going", "What people see of who has claimed each one. Emails and contact details are never shown.",
        rows([["Shown as", WHO[sc.family_names || "initial"]]]),
        `<div class="opt-row three">
          ${radio("family_names", "initial", sc.family_names || "initial", "First name + initial", "", EX.whoGoing)}
          ${radio("family_names", "full", sc.family_names || "initial", "Full names", "", EX.whoGoing.replace(/(\w+) (\w)\./g, (m, f, l) => `${f} ${({ S: "Smith", K: "Klein", P: "Peters", R: "Reed" })[l] || l + "…"}`))}
          ${radio("family_names", "off", sc.family_names || "initial", "Hidden", "Only how many spots are open", "2 of 4 spots open")}
        </div>`)}

      ${require("./board").boardDefaultsSections(sc)}
      ${sec("attendance", I.check(), "Attendance", "Whether attendance is taken, and the coaches who can take it.",
        rows([["Track attendance", sc.track_attendance ? "Yes, by default" : "No, not by default"], ["Coaches", (counts.coaches || []).length ? esc(counts.coaches.join(", ")) : "None"],
          ["Check-in locks", LOCKS[String(lockDays(sc))] || LOCKS["1"]]]),
        `<div class="opt-row">
          ${radio("track", "off", sc.track_attendance ? "on" : "off", "No, not by default", "Turn it on for just the ones that need it.", "")}
          ${radio("track", "on", sc.track_attendance ? "on" : "off", "Yes, by default", "", EX.attendance)}
        </div>
        <p class="fine">${depth >= 2 ? `Each ${esc(L.activity.one.toLowerCase())} can change this (e.g. track Hitting, not Cage Time).` : `Each ${esc(L.slot.one.toLowerCase())} can change this.`}</p>
        <label class="field-l"><span>Coaches who can take attendance <span class="opt">(one email per line)</span></span>
          <textarea name="coaches" rows="${Math.max(2, (counts.coaches || []).length + 1)}" placeholder="e.g. coach@example.com, one per line">${esc((counts.coaches || []).join("\n"))}</textarea></label>
        <p class="fine">They sign in with their email and only see Check-in. Admins can always take attendance.</p>
        <p class="ex">e.g. ${esc(EX.coaches)}</p>
        <label class="field-l"><span>Lock check-in for coaches</span><select name="checkin_lock">${Object.entries(LOCKS).map(([k, l]) => `<option value="${k}"${String(lockDays(sc)) === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <p class="fine">After this, coaches see a session's check-in but can't change it. Admins can always change it.</p>`)}
    </section>


    </div>
    <script>
    (function () {
      var val = function (f, n) { var el = f.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ""; };
      function sync(f) {
        var r = f.querySelector("[data-restrict]"), pn = f.querySelector("[data-public-note]"), vq = f.querySelector("[data-views]");
        if (r) r.hidden = val(f, "claim") === "public";
        if (pn) pn.hidden = val(f, "claim") !== "public";
        if (vq) vq.hidden = val(f, "dated") !== "yes";
      }
      // sections: Edit swaps the answers for the form; Cancel puts them back
      document.querySelectorAll(".ss").forEach(function (sec) {
        var f = sec.querySelector(".ss-form"), v = sec.querySelector(".ss-view"), b = sec.querySelector(".ss-edit");
        if (!f || !b) return;   // a read-only section (like "Levels with their own settings") has nothing to edit
        b.addEventListener("click", function () {
          document.querySelectorAll(".ss.open .ss-cancel, .inl.open .inl-cancel").forEach(function (c) { c.click(); });
          f.hidden = false; v.hidden = true; b.hidden = true; sec.classList.add("open");
        });
        sec.querySelector(".ss-cancel").addEventListener("click", function () { f.reset(); sync(f); f.hidden = true; v.hidden = false; b.hidden = false; sec.classList.remove("open"); });
        f.addEventListener("change", function () { sync(f); });
      });
      // header: pencil edits in place
      document.querySelectorAll(".inl").forEach(function (x) {
        var f = x.querySelector(".inl-form"), v = x.querySelector(".inl-view");
        if (!f || !x.querySelector(".pencil")) return;
        x.querySelector(".pencil").addEventListener("click", function () {
          document.querySelectorAll(".ss.open .ss-cancel, .inl.open .inl-cancel").forEach(function (c) { c.click(); });
          f.hidden = false; v.hidden = true; x.classList.add("open"); var i = f.querySelector("input:not([type=hidden])"); if (i) i.focus();
        });
        x.querySelector(".inl-cancel").addEventListener("click", function () { f.reset(); f.hidden = true; v.hidden = false; x.classList.remove("open"); });
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.querySelectorAll(".ss.open .ss-cancel, .inl.open .inl-cancel").forEach(function (c) { c.click(); }); });
      document.querySelectorAll(".turn-on").forEach(function (b) {
        b.addEventListener("click", function () { var sec = document.getElementById("ss-" + b.dataset.open); if (!sec) return;
          sec.scrollIntoView({ behavior: "smooth", block: "center" }); var e = sec.querySelector(".ss-edit"); if (e && !e.hidden) e.click(); });
      });
      var h = location.hash && document.querySelector(location.hash.replace("#q-", "#ss-"));
      if (h) { h.classList.add("just-saved"); setTimeout(function () { h.classList.remove("just-saved"); }, 1800); }
    })();
    </script>`,
  });
}

function newSchedulePage({ user, flash }) {
  const PRE = SC.PRESET_LABELS;
  const { LABELS } = require("../config");
  const levels = (l) => SC.LEVEL_KEYS[l.depth].map((k) => l[k][1]).join(" › ");
  const CHOICES = [
    ["list", "📋", "Item list", "1 level", "Donations, a potluck, team snacks", "Bring a case of water · 10 spots"],
    ["volunteer", "🗂️", "Categories & items", "2 levels", "Volunteer jobs by area, a potluck by course, donations by type", "Concessions › Grill 8–10 AM, or Desserts › Brownies"],
    ["training", "🥎", "Rounds & sessions", "3 levels", "Training with rounds, limits, and a calendar", "Round 1 › Hitting 12U–18U › Mon 6:00 PM"],
    ["event", "🏆", "Event days", "4 levels", "A multi-day event with areas and stations", "Saturday › Concessions › Grill › 8–10 AM"],
  ];
  const opt = (name, value, title, text, exKey) => `<label class="choice"><input type="radio" name="${name}" value="${value}">
    <span class="choice-body"><b>${title}</b><span>${text}</span>${exKey ? `<span class="ex" data-ex="${exKey}"></span>` : ""}</span><span class="choice-check" aria-hidden="true">✓</span></label>`;
  return page({
    title: "Create Board", tab: "home", user, flash, noBack: true,
    body: `<nav class="back-row"><a class="back-btn" href="/admin/settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>All Boards</a></nav>
    <section class="bh2 wz-hd"><div class="bh2-l"><span class="bh2-tile dash-tile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18M12 13v6M9 16h6"/></svg></span>
      <div><div class="bh2-t"><h1>Create Board</h1></div><span class="bh2-meta" id="wz-meta">Step 1 of 3 · Details. You can change everything later.</span></div></div></section>
    <nav class="bh2-tabs dash-tabs wz-tabs" aria-label="Steps"><ol class="wz-progress">
      <li data-step="1" class="on now"><button type="button" data-go="1"><span>1</span>Details</button></li><li data-step="2"><button type="button" data-go="2"><span>2</span>Structure</button></li><li data-step="3"><button type="button" data-go="3"><span>3</span>Settings</button></li>
    </ol></nav>
    <section class="sub-body no-subs wizard">
      <form method="post" action="/admin/setup/schedules" id="wz">

        <div class="wz-step" data-step="1">
          <h3 class="wz-h3">General</h3>
          <label class="field">Board name<input name="name" id="wz-name" required maxlength="60" autocomplete="off" placeholder="e.g. Winter Training 2026–27"></label>
          <div class="tip"><b>Helpful tip</b>Use a season or event name people will recognize, like "Winter Training 2026–27" or "Raptors Rumble Concessions".</div>
          <div class="field-row">
            <label class="field-l"><span>Event date <span class="opt">(optional)</span></span><input type="date" name="event_date"></label>
            <label class="field-l"><span>End date <span class="opt">(if more than one day)</span></span><input type="date" name="event_end"></label>
          </div>
          <label class="field-l"><span>Main location <span class="opt">(optional)</span></span>${require("../locations").picker("event_location", "")}
            <span class="fine">Areas and items can have their own location too, like the concession stand.</span></label>
          <label class="field-l"><span>Description <span class="opt">(optional, shown to people at the top)</span></span>
            <textarea name="description" rows="2" maxlength="600" placeholder="e.g. Drop donations at the concession stand by 7:30 AM Saturday."></textarea></label>
          <h3 class="wz-h3">Type &amp; look</h3>${boardTypeField(null)}
          <p class="q-label">Picture <span class="fine-inline">(optional)</span></p>${imagePicker(null)}
          <h3 class="wz-h3">Organizer <span class="opt">(optional; add more later in Board details)</span></h3>
          <div class="field-row">
            <label class="field-l"><span>Organizer</span><input name="contact_name" maxlength="60" placeholder="e.g. Jane Smith"></label>
            <label class="field-l"><span>Organizer email or phone</span><input name="contact_info" maxlength="80" placeholder="e.g. jane@example.com"></label>
          </div>
        </div>

        <div class="wz-step" data-step="2" hidden>
          <p class="muted tight">How is it organized? Pick one. The last level is what people claim.</p>
          <p class="alert" id="wz-pick-err" hidden>Pick a structure to continue.</p>
          <div class="choice-grid">${CHOICES.map(([k, icon, title, depth, use, ex]) => `<label class="choice struct">
            <input type="radio" name="preset" value="${k}" required>
            <span class="choice-icon" aria-hidden="true">${icon}</span>
            <span class="choice-body"><b>${title} <em>${depth}</em></b><span class="lv">${esc(levels(PRE[k]))}</span><span>${esc(use)}</span><span class="ex">e.g. ${esc(ex)}</span></span>
            <span class="choice-check" aria-hidden="true">✓</span></label>`).join("")}</div>
          <div class="wz-names" id="wz-names" hidden>
            <p class="q-label">What things are called <span class="fine-inline">(filled in for you; rename if you like)</span></p>
            <div class="table-wrap"><table class="levels"><thead><tr><th>Level</th><th>One</th><th>Many</th></tr></thead><tbody>
              ${["middle", "section", "activity", "slot", "participant", "group"].map((k) => `<tr data-key="${k}">
                <td><strong class="lvl-name"></strong><div class="fine lvl-help"></div></td>
                <td><input name="${k}_one" maxlength="24" aria-label="${k} singular"></td><td><input name="${k}_many" maxlength="24" aria-label="${k} plural"></td></tr>`).join("")}
            </tbody></table></div>
          </div>
          <fieldset class="q" id="wz-dated" hidden><legend>Do things have dates and times?</legend><div class="choice-row">
            ${opt("dated", "no", "No", "It's all one day or there are no set times. People pick from a list.", "datedNo")}
            ${opt("dated", "yes", "Yes", "Things have dates and times.", "datedYes")}</div></fieldset>
          <fieldset class="q" id="wz-views"><legend>Available views</legend><div class="choice-row three">
            ${opt("pick", "list", "List", "A day-by-day list with dates and times. No calendar.", "viewList")}
            ${opt("pick", "calendar", "Calendar", "People pick days on a calendar.", "viewCal")}
            ${opt("pick", "both", "Both: List &amp; Calendar", "People can switch between the calendar and a day-by-day list.")}</div></fieldset>
        </div>

        <div class="wz-step" data-step="3" hidden>
          <p class="muted tight">Filled in for the structure you picked. Change any of them.</p>
          <fieldset class="q"><legend>Who can claim?</legend><div class="choice-row three">
            ${opt("claim", "public", "Anyone with the link", claimHelp().public, "claim.public")}
            ${opt("claim", "family", "Anyone with an account", claimHelp().family, "claim.family")}
            ${opt("claim", "roster", "Only people assigned to the board", claimHelp().roster.replace("this board's list", "the list you make"), "claim.roster")}</div></fieldset>
          <fieldset class="q"><legend>Limit some things to certain people?</legend><div class="choice-row">
            ${opt("restrict", "no", "No", "Anyone who can claim can claim anything.")}
            ${opt("restrict", "yes", "Yes", "By team or tag.", "restrict")}</div></fieldset>
          <div class="wz-summary" aria-live="polite"><span class="label-like">Summary</span><p id="wz-sum"></p></div>
        </div>

        <div class="wz-nav">
          <button type="button" class="btn-ghost" id="wz-back" disabled>Back</button>
          <span class="spacer"></span>
          <button type="button" class="btn-small" id="wz-next">Continue</button>
          <button type="submit" class="btn-small" id="wz-create" hidden>Create board</button>
        </div>
      </form>
    </section>
    ${require("../locations").placeDialog()}
    ${IMAGE_JS}
    <script>
    (function () {
      var D = ${JSON.stringify(Object.fromEntries(Object.entries(PRE).map(([k, v]) => [k, { claim: v.claim, restrict: v.restrict ? "yes" : "no", dated: v.calendar === false ? "no" : "yes", depth: v.depth,
        names: Object.fromEntries(["middle", "section", "activity", "slot", "participant", "group"].map((x) => [x, v[x] || SC.PRESET_LABELS.training[x] || [x, x + "s"]])) }])))};
      var KEYS = ${JSON.stringify(SC.LEVEL_KEYS)};
      var HELP = ${JSON.stringify({ middle: LEVEL_INFO.middle(false)[0], section: LEVEL_INFO.section(false)[0], activity: LEVEL_INFO.activity(false)[0], slot: LEVEL_INFO.slot(true)[0], participant: LEVEL_INFO.participant()[0], group: LEVEL_INFO.group()[0] })};
      var namesTouched = false;
      function names() {
        var d = D[val("preset")]; if (!d) return;
        var keys = KEYS[d.depth];
        document.querySelectorAll("#wz-names tr[data-key]").forEach(function (tr) {
          var k = tr.dataset.key, i = keys.indexOf(k), people = k === "participant" || k === "group";
          tr.hidden = !(people || i >= 0);
          tr.querySelectorAll("input").forEach(function (inp) { inp.disabled = tr.hidden; });
          tr.querySelector(".lvl-name").textContent = people ? (k === "participant" ? "People" : "Their groups") : "Level " + (i + 1) + (i === keys.length - 1 ? " (claimed)" : "");
          tr.querySelector(".lvl-help").textContent = HELP[k] || "";
          if (!namesTouched) { tr.querySelector('input[name$="_one"]').value = d.names[k][0]; tr.querySelector('input[name$="_many"]').value = d.names[k][1]; }
        });
        document.getElementById("wz-names").hidden = false; document.getElementById("wz-dated").hidden = false;
      }
      document.getElementById("wz-names").addEventListener("input", function () { namesTouched = true; });
      var NAMES = ${JSON.stringify(Object.fromEntries(CHOICES.map(([k, , t, d]) => [k, t + " (" + d + ")"])))};
      var EXAMPLES = ${JSON.stringify(require("../examples").BY_DEPTH)};
      var form = document.getElementById("wz"), step = 1, touched = {};
      var $ = function (sel) { return form.querySelector(sel); };
      var val = function (n) { var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ""; };
      function set(n, v) { if (touched[n]) return; var el = form.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (el) el.checked = true; }
      function defaults() { var d = D[val("preset")]; if (!d) return; set("claim", d.claim); set("restrict", d.restrict); set("dated", d.dated); if (!val("pick")) set("pick", "calendar"); names(); refresh();
        var err = document.getElementById("wz-pick-err"); if (err) err.hidden = true; }
      function examples() {
        var d = (D[val("preset")] || {}).depth, ex = EXAMPLES[d];
        form.querySelectorAll("[data-ex]").forEach(function (el) {
          var v = ex && el.dataset.ex.split(".").reduce(function (o, k) { return o && o[k]; }, ex);
          el.textContent = v ? "e.g. " + v : ""; el.hidden = !v;
        });
      }
      function refresh() {
        examples();
        document.getElementById("wz-views").hidden = val("dated") !== "yes";
        var rq = document.querySelector('input[name="restrict"]').closest("fieldset"); rq.hidden = val("claim") === "public";
        var who = { public: "Anyone with the link", family: "Anyone with an account", roster: "Only people assigned to the board" }[val("claim")] || "";
        var when = val("dated") === "yes" ? ({ both: "dates, list & calendar", list: "dates, list view" }[val("pick")] || "dates, calendar") : "no dates (a list)";
        document.getElementById("wz-sum").innerHTML = "<b>" + (form.name.value.trim() || "Untitled").replace(/[<>&]/g, "") + "</b> · " + (NAMES[val("preset")] || "") +
          " · " + who + (val("claim") === "public" ? "" : " · " + (val("restrict") === "yes" ? "limited by group or tag" : "anyone can claim anything")) + " · " + when;
      }
      function show(n) {
        step = n;
        form.querySelectorAll(".wz-step").forEach(function (el) { el.hidden = +el.dataset.step !== n; });
        document.querySelectorAll(".wz-progress li").forEach(function (li) { var k = +li.dataset.step; li.classList.toggle("on", k <= n); li.classList.toggle("now", k === n); li.classList.toggle("done", k < n);
          li.querySelector("button").disabled = k > n; if (k === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current"); });
        document.getElementById("wz-meta").textContent = "Step " + n + " of 3 · " + ["Details", "Structure", "Settings"][n - 1] + ". You can change everything later.";
        document.getElementById("wz-back").disabled = n === 1;
        document.getElementById("wz-next").hidden = n === 3;
        document.getElementById("wz-create").hidden = n !== 3;
        if (n === 3) refresh();
        var f = form.querySelector('.wz-step[data-step="' + n + '"] input'); if (f && n === 1) f.focus();
      }
      document.getElementById("wz-next").addEventListener("click", function () {
        if (step === 1 && !form.name.value.trim()) { form.name.reportValidity(); return; }
        if (step === 1 && form.short_code && !form.short_code.checkValidity()) { form.short_code.reportValidity(); return; }
        if (step === 2 && !val("preset")) { document.getElementById("wz-pick-err").hidden = false; return; }
        show(step + 1);
      });
      document.getElementById("wz-back").addEventListener("click", function () { show(step - 1); });
      document.querySelectorAll(".wz-progress [data-go]").forEach(function (b) { b.addEventListener("click", function () { var k = +b.dataset.go; if (k < step) show(k); }); });
      form.name.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); document.getElementById("wz-next").click(); } });
      form.querySelectorAll('input[name="preset"]').forEach(function (r) { r.addEventListener("change", defaults); });
      ["claim", "restrict", "dated", "pick"].forEach(function (n) { form.querySelectorAll('input[name="' + n + '"]').forEach(function (r) { r.addEventListener("change", function () { touched[n] = true; refresh(); }); }); });
      form.name.addEventListener("input", refresh);
      defaults(); show(1);
    })();
    </script>`,
  });
}

// Board screen header: "<name> Setup", status, event details (edited from the board's card), Share and Publish
module.exports = { LOCKS, lockDays, scheduleSettingsPage, newSchedulePage, eventDates, levelsTable, imagePicker, IMAGE_JS, boardTypeField, boardTypeOf, initials, codeOf };
