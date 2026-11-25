// Communication → Send a message, and Send an automated email now.
const { esc } = require("./layout");
const when = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const hidden = (b) => Object.entries(b).flatMap(([k, v]) => [].concat(v).map((x) => `<input type="hidden" name="${esc(k)}" value="${esc(x)}">`)).join("");
function composePage({ acc, mBoards, nBoards, teams, mItems, nItems, people, lists, mm, form = {} }) {
  const canM = acc.has("comm.message"), canN = acc.has("comm.sendnow");
  const bOpts = (bs) => bs.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("");
  const iOpts = (is) => is.map((i) => `<option value="${i.id}">${esc(when(i.starts_at))} · ${esc(i.title || "Session")} (${esc(i.board)})</option>`).join("");
  const teamList = [...new Set(mBoards.flatMap((b) => teams[b.id] || []))].sort();
  return `<div class="sub-body no-subs qs-sheet">
    ${canM ? `<section class="nt-sec"><h3>Send a message</h3><p class="fine">Families get it from the club, in the club's email style; replies go to the club's address. For an athlete it goes to their parents/guardians and their own sign-in.${mm === null ? "" : " You can message the boards (and teams) your role covers."}</p>
      <form method="post" action="/admin/messages/preview" class="qs-form ms-form">
        <fieldset class="ms-to"><legend>To</legend>
          <label class="radio-row"><input type="radio" name="to" value="board" checked> A board (or one team on it)</label>
          <div class="ms-sub" data-for="board"><select name="board">${bOpts(mBoards)}</select>
            <select name="team"><option value="">Every team</option>${teamList.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
            <select name="who"><option value="list">Everyone on the board's list</option><option value="signed">Only people signed up for upcoming sessions</option></select></div>
          <label class="radio-row"><input type="radio" name="to" value="session"> A session (everyone signed up)</label>
          <div class="ms-sub" data-for="session" hidden><select name="session">${iOpts(mItems)}</select></div>
          <label class="radio-row"><input type="radio" name="to" value="people"> Pick people</label>
          <div class="ms-sub" data-for="people" hidden><input type="search" class="ms-find" placeholder="Type to filter names"><select name="people" multiple size="8" class="ms-people">${people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><span class="qs-hint">Hold Ctrl (or ⌘) to pick several.</span></div>
          ${lists.length ? `<label class="radio-row"><input type="radio" name="to" value="list"> A People list</label><div class="ms-sub" data-for="list" hidden><select name="list">${lists.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</select></div>` : ""}
        </fieldset>
        <label class="field-l"><span>Subject</span><input name="subject" maxlength="150" required placeholder="e.g. Practice moved to the north field"></label>
        <label class="field-l"><span>Message</span><textarea name="message" rows="8" required placeholder="Write your message. **bold** works, and links like [the schedule](https://…)."></textarea></label>
        <div class="q-actions"><button class="btn-small" type="submit">Preview</button><span class="fine">Nothing is sent until you confirm on the next screen.</span></div></form></section>` : ""}
    ${canN ? `<section class="nt-sec" id="now"><h3>Send an automated email now</h3><p class="fine">Sends one of the automatic emails right away, for example to re-send open spots. It goes to the same people it normally would.</p>
      <form method="post" action="/admin/messages/now" class="qs-form ms-now">
        <label class="field-l"><span>Email</span><select name="kind">${Object.entries(require("../messages").NOW).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></label>
        <label class="field-l" data-k="leftover leftover_today helper"><span>Board</span><select name="board">${acc.admin || !require("../messages").allowed(acc, "comm.sendnow") ? `<option value="">Every board</option>` : ""}${bOpts(nBoards)}</select></label>
        <label class="field-l" data-k="rsvp" hidden><span>Event</span><select name="session" disabled>${iOpts(nItems.filter((i) => i.t === "rsvp"))}</select></label>
        <label class="field-l" data-k="reminder" hidden><span>Session</span><select name="session" disabled>${iOpts(nItems.filter((i) => i.t !== "rsvp"))}</select></label>
        <label class="field-l" data-k="invite welcome" hidden><span>Person</span><select name="person" disabled>${people.filter((p) => p.email).map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(p.email)}</option>`).join("")}</select></label>
        <div class="q-actions"><button class="btn-small" type="submit">Preview</button></div></form></section>` : ""}
    <script>(function () {
      var f = document.querySelector(".ms-form"); if (f) { var sync = function () { var v = (f.querySelector("input[name=to]:checked") || {}).value; [].forEach.call(f.querySelectorAll(".ms-sub"), function (d) { var on = d.dataset.for === v; d.hidden = !on; [].forEach.call(d.querySelectorAll("select,input"), function (x) { x.disabled = !on; }); }); };
        f.addEventListener("change", sync); sync(); var q = f.querySelector(".ms-find"); if (q) q.addEventListener("input", function () { var t = q.value.toLowerCase(); [].forEach.call(f.querySelectorAll(".ms-people option"), function (o) { o.hidden = t && o.textContent.toLowerCase().indexOf(t) < 0; }); }); }
      var n = document.querySelector(".ms-now"); if (n) { var s2 = function () { var k = n.kind.value; [].forEach.call(n.querySelectorAll("[data-k]"), function (l) { var on = l.dataset.k.split(" ").indexOf(k) >= 0; l.hidden = !on; [].forEach.call(l.querySelectorAll("select"), function (x) { x.disabled = !on; }); }); }; n.kind.addEventListener("change", s2); s2(); }
    })();</script></div>`;
}
function previewPage({ body, r, email }) {
  return `<div class="sub-body no-subs qs-sheet"><section class="nt-sec"><h3>Check before sending</h3>
    <p><b>To:</b> ${esc(r.what)}: <b>${r.athletes.length}</b> ${r.athletes.length === 1 ? "person" : "people"}, <b>${r.emails.length}</b> email address${r.emails.length === 1 ? "" : "es"}.</p>
    ${r.athletes.length ? `<details><summary class="link-dark">Who</summary><p class="fine">${r.athletes.slice(0, 200).map((a) => esc(a.name)).join(", ")}${r.athletes.length > 200 ? "…" : ""}</p></details>` : ""}
    ${!r.emails.length ? `<p class="ar-note">No one to send to: none of these people have an email on file.</p>` : ""}
    <div class="ms-email"><iframe title="Email preview" srcdoc="${esc(email.html)}"></iframe></div>
    <form method="post" action="/admin/messages/send" class="q-actions">${hidden(body)}${r.emails.length ? `<button class="btn-small" type="submit">Send to ${r.emails.length}</button>` : ""}<a class="link-dark" href="/admin/messages">Change it</a></form></section></div>`;
}
function nowPreview({ body, p, label }) {
  return `<div class="sub-body no-subs qs-sheet"><section class="nt-sec"><h3>Send now: ${esc(label)}</h3>
    <p>${esc(p.what)}.</p>${!p.count ? `<p class="ar-note">Nothing to send right now.</p>` : ""}
    <form method="post" action="/admin/messages/now" class="q-actions">${hidden({ ...body, confirm: "1" })}${p.count ? `<button class="btn-small" type="submit">Send it now</button>` : ""}<a class="link-dark" href="/admin/messages#now">Back</a></form></section></div>`;
}
module.exports = { composePage, previewPage, nowPreview };
