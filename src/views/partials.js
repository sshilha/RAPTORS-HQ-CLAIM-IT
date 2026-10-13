const { esc } = require("./layout");
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
function limitsTable(round) {
  return `<table class="limits"><thead><tr><th>Activity</th><th>Sessions per athlete</th><th>Unlimited</th></tr></thead><tbody>
    ${ACTIVITIES.map((a, i) => {
      const v = limitFor(round || {}, a);
      return `<tr><td>${swatch(a)}<strong>${esc(a)}</strong></td>
        <td><input type="number" name="lim_${i}" min="1" max="50" value="${v ?? 2}" aria-label="${esc(a)} limit" class="lim-n"${v == null ? " disabled" : ""}></td>
        <td><label class="check"><input type="checkbox" name="unl_${i}" value="1" class="lim-unl"${v == null ? " checked" : ""}> Unlimited</label></td></tr>`;
    }).join("")}
  </tbody></table>`;
}

// Compact version: one small card per activity (used on the Setup page)
function limitsCards(round) {
  return `<div class="limit-cards">${ACTIVITIES.map((a, i) => {
    const v = limitFor(round || {}, a);
    return `<div class="limit-card" style="--c:${ACTIVITY_COLORS[a]}"><span class="lc-name">${esc(a)}</span>
      <input type="number" name="lim_${i}" min="1" max="50" value="${v ?? 2}" aria-label="${esc(a)} sessions per athlete" class="lim-n"${v == null ? " disabled" : ""}>
      <label class="check"><input type="checkbox" name="unl_${i}" value="1" class="lim-unl"${v == null ? " checked" : ""}> Unlimited</label></div>`;
  }).join("")}</div>`;
}

function limitsForm(round, { returnTo, readonly, compact } = {}) {
  return `<form method="post" action="/admin/rounds/${round.id}/limits" class="limits-form${compact ? " compact" : ""}">
    ${returnTo ? `<input type="hidden" name="return_to" value="${esc(returnTo)}">` : ""}
    <fieldset class="plain"${readonly ? " disabled" : ""}>
    ${compact ? limitsCards(round) : limitsTable(round)}
    <div class="limits-foot">${unlockFields(round)}
      ${readonly ? "" : `<button class="btn-ghost" type="submit">Save limits</button>`}
    </div>
    <p class="fine">Sessions are locked to these limits. Inside the unlock period, or when you unlock a session by hand, any athlete can take its open spots, and those spots don't use up the athlete's limit.</p>
    </fieldset>
  </form>`;
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

module.exports = { swatch, blockSelect, spotsLabel, limitsTable, limitsForm, limitsScript, unlockFields };
