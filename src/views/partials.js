const { esc } = require("./layout");
const { APP_URL, LABELS } = require("../config");
const { ACTIVITIES, ACTIVITY_COLORS } = require("../config");
const { BLOCK_CHOICES, limitFor } = require("../rounds");
const { inputParts } = require("../time");

const swatch = (a) => `<span class="swatch" style="background:${ACTIVITY_COLORS[a]}"></span>`;

function blockSelect(name, value, attrs = "") {
  return `<select name="${name}" ${attrs}>
    <option value=""${value ? "" : " selected"}>Whole session</option>
    ${BLOCK_CHOICES.map((m) => `<option value="${m}"${Number(value) === m ? " selected" : ""}>${m}-min blocks</option>`).join("")}
  </select>`;
}

const spotsLabel = (spots, block) => (block ? `${spots} per ${block}-min block` : `${spots} spots`);

// Limits per athlete, per activity, for a round (unlimited = checkbox)
const shown = (list) => (list && list.length ? ACTIVITIES.filter((a) => list.includes(a)) : ACTIVITIES);

function limitsTable(round, activities) {
  return `<table class="limits"><thead><tr><th>Type</th><th>Per person</th><th>Unlimited</th></tr></thead><tbody>
    ${shown(activities).map((a) => {
      const i = ACTIVITIES.indexOf(a);
      const v = limitFor(round || {}, a);
      return `<tr><td><input type="hidden" name="has_${i}" value="1">${swatch(a)}<strong>${esc(a)}</strong></td>
        <td><input type="number" name="lim_${i}" min="1" max="50" value="${v ?? 2}" aria-label="${esc(a)} limit" class="lim-n"${v == null ? " disabled" : ""}></td>
        <td><label class="check"><input type="checkbox" name="unl_${i}" value="1" class="lim-unl"${v == null ? " checked" : ""}> Unlimited</label></td></tr>`;
    }).join("")}
  </tbody></table>`;
}

// Compact version: one small card per activity (used on the Setup page)
function limitsCards(round, activities) {
  return `<div class="limit-cards">${shown(activities).map((a) => {
    const i = ACTIVITIES.indexOf(a);
    const v = limitFor(round || {}, a);
    return `<div class="limit-card" style="--c:${ACTIVITY_COLORS[a]}"><input type="hidden" name="has_${i}" value="1"><span class="lc-name">${esc(a)}</span>
      <input type="number" name="lim_${i}" min="1" max="50" value="${v ?? 2}" aria-label="${esc(a)} sessions per athlete" class="lim-n"${v == null ? " disabled" : ""}>
      <label class="check"><input type="checkbox" name="unl_${i}" value="1" class="lim-unl"${v == null ? " checked" : ""}> Unlimited</label></div>`;
  }).join("")}</div>`;
}

function limitsForm(round, { returnTo, readonly, compact, activities } = {}) {
  return `<form method="post" action="/admin/rounds/${round.id}/limits" class="limits-form${compact ? " compact" : ""}">
    ${returnTo ? `<input type="hidden" name="return_to" value="${esc(returnTo)}">` : ""}
    <fieldset class="plain"${readonly ? " disabled" : ""}>
    ${compact ? limitsCards(round, activities) : limitsTable(round, activities)}
    <div class="limits-foot">${unlockFields(round)}
      <label class="check waitlist-check"><input type="checkbox" name="waitlist" value="1"${round && round.waitlist ? " checked" : ""}> Use a waitlist when sessions fill up</label>
      ${readonly ? "" : `<button class="btn-ghost" type="submit">Save limits</button>`}
    </div>
    <p class="fine">Sessions are locked to these limits. Inside the unlock period, or when you unlock a session by hand, any athlete can take its open spots, and those spots don't use up the athlete's limit. With the waitlist off, full sessions simply show "Full"; each session can override this.</p>
    </fieldset>
  </form>`;
}

// Who can sign up for a sheet
function modeForm(round, { returnTo, readonly } = {}) {
  const { MODES } = require("../schedules");
  const cur = round.signup_mode || "roster";
  return `<form method="post" action="/admin/rounds/${round.id}/mode" class="mode-form">
    ${returnTo ? `<input type="hidden" name="return_to" value="${esc(returnTo)}">` : ""}
    <fieldset class="plain"${readonly ? " disabled" : ""}>
    ${Object.entries(MODES).map(([k, [label, help]]) => `<label class="mode-opt${k === cur ? " on" : ""}">
      <input type="radio" name="signup_mode" value="${k}"${k === cur ? " checked" : ""}>
      <span><b>${esc(label)}</b><span class="fine">${esc(help)}</span></span></label>`).join("")}
    ${readonly ? "" : `<button class="btn-ghost" type="submit">Save</button>`}
    </fieldset>
  </form>`;
}

// Share link + QR code for public sheets
function shareBox(round) {
  const url = `${APP_URL}/s/${round.share_token}`;
  return `<div class="share-box">
    <img src="/admin/rounds/${round.id}/qr.svg" alt="QR code for the sign-up link" width="112" height="112">
    <div class="share-main">
      <p class="label-like">Share link</p>
      <div class="share-row"><input readonly value="${esc(url)}" aria-label="Share link" onclick="this.select()">
        <button class="btn-ghost" type="button" onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='Copied'">Copy</button></div>
      <p class="fine">${round.published_at ? "Anyone with this link can sign up. Post it on SportsEngine, email it, or print the QR code." : "Publish this to make the link work."}
        <a href="/admin/rounds/${round.id}/qr.svg" download="signup-qr.svg">Download QR</a></p>
    </div></div>`;
}

// Per-session waitlist choice: follow the round, or force on/off
function waitlistSelect(value, round, attrs = "") {
  const def = round && round.waitlist ? "on" : "off";
  return `<select name="waitlist" ${attrs}>
    <option value=""${value == null ? " selected" : ""}>Round default (${def})</option>
    <option value="on"${value === true ? " selected" : ""}>On</option>
    <option value="off"${value === false ? " selected" : ""}>Off</option>
  </select>`;
}

// "Unlock open spots [7] [days] before each session", or never
function unlockFields(round) {
  const h = round ? (round.unlock_hours === undefined ? 168 : round.unlock_hours) : 168;
  const days = h != null && h % 24 === 0;
  return `<div class="unlock-fields"><span class="label-like">Unlock open spots</span>
    <span class="unlock-row">
      <input type="number" name="unlock_n" min="0" max="1440" value="${h == null ? 7 : days ? h / 24 : h}" class="unlock-n" aria-label="Unlock period"${h == null ? " disabled" : ""}>
      <select name="unlock_unit" class="unlock-unit" aria-label="Unit"${h == null ? " disabled" : ""}>
        <option value="days"${h == null || days ? " selected" : ""}>days</option><option value="hours"${h != null && !days ? " selected" : ""}>hours</option></select>
      <span class="unlock-before">before each session</span>
      <label class="check"><input type="checkbox" name="unlock_never" value="1" class="unlock-never"${h == null ? " checked" : ""}> Never automatically</label>
    </span></div>`;
}

// Script that greys out the number when Unlimited is checked
const limitsScript = `<script>
document.querySelectorAll(".lim-unl").forEach(function (c) {
  c.addEventListener("change", function () { c.closest("tr, .limit-card").querySelector(".lim-n").disabled = c.checked; });
});
document.querySelectorAll(".unlock-never").forEach(function (c) {
  c.addEventListener("change", function () {
    var w = c.closest(".unlock-fields");
    w.querySelector(".unlock-n").disabled = c.checked; w.querySelector(".unlock-unit").disabled = c.checked;
  });
});
</script>`;

module.exports = { swatch, blockSelect, spotsLabel, limitsTable, limitsForm, limitsScript, unlockFields, waitlistSelect, modeForm, shareBox };
