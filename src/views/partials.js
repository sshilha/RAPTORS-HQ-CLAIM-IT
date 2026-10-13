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
    <div class="limits-foot">
      <label class="ends">Limits end (optional)<input type="datetime-local" name="priority_ends_at" value="${inputParts(round.priority_ends_at).local}"></label>
      ${readonly ? "" : `<button class="btn-ghost" type="submit">Save limits</button>`}
    </div>
    <p class="fine">Sessions of each activity one athlete can hold in this round. After "limits end", athletes can book any open spot; leave it blank to keep the limits all round.</p>
    </fieldset>
  </form>`;
}

// Script that greys out the number when Unlimited is checked
const limitsScript = `<script>
document.querySelectorAll(".lim-unl").forEach(function (c) {
  c.addEventListener("change", function () { c.closest("tr, .limit-card").querySelector(".lim-n").disabled = c.checked; });
});
</script>`;

module.exports = { swatch, blockSelect, spotsLabel, limitsTable, limitsForm, limitsScript };
