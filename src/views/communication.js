// App Settings → People → Communication: every email the app sends, the branding, and the editor
const { esc } = require("./layout");
const { page } = require("./admin");
const ET = () => require("../emailTemplates");
const fmt = (d) => (d ? new Date(d).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

function listPage({ user, flash, head, templates, brand: b, logo }) {
  const groups = [...new Set(templates.map((t) => t.group))];
  const vrow = (x = { name: "", value: "" }) => `<div class="cm-var"><span class="cm-br">{{</span><input name="var_name" value="${esc(x.name)}" placeholder="season" maxlength="40"><span class="cm-br">}}</span><span class="cm-eq">=</span><input name="var_value" value="${esc(x.value)}" placeholder="2026–27" maxlength="300"><button type="button" class="x" onclick="this.parentNode.remove()" aria-label="Remove">×</button></div>`;
  return page({ title: "Communication", tab: "people", user, flash, xwide: true,
    body: `${head({ active: "communication" })}
    <section class="panel cm-brand" id="brand"><div class="cm-h"><div><h2>Branding</h2><p class="fine">Every email uses these: the logos and colors in the header, the sender, the footer, and your own variables.</p></div>
      <button type="button" class="sb-btn" onclick="var f=document.getElementById('cm-bf'); f.hidden=!f.hidden">Edit branding</button></div>
      <div class="cm-sum"><span><b>Logos:</b> ${[logo ? "your logo" : "", b.logo_app !== false ? "Claim It" : ""].filter(Boolean).join(" + ") || "none (your club's name instead)"}</span>
        <span><b>Sender:</b> ${esc(b.sender_name || "(the app's default)")}${b.reply_to ? ` · replies go to ${esc(b.reply_to)}` : ""}</span>
        <span><b>Your variables:</b> ${(b.vars || []).length ? b.vars.map((x) => `<code>{{${esc(x.name)}}}</code>`).join(" ") : "none yet"}</span></div>
      <form method="post" action="/admin/people/communication/brand" id="cm-bf" class="cm-bform" hidden>
        <div class="cm-cols">
          <div><p class="q-label">Logos in the header</p>
            <div class="cm-logo">${logo ? `<img src="${esc(logo)}" alt="Your logo" id="cm-logo-img">` : `<span class="fine" id="cm-logo-none">No logo of your own yet</span><img id="cm-logo-img" alt="" hidden>`}
              <label class="btn-ghost">Choose your logo<input type="file" accept="image/*" hidden id="cm-logo-file"></label>
              ${logo ? `<label class="radio-row"><input type="checkbox" name="remove_logo" value="1"> Remove it</label>` : ""}<input type="hidden" name="logo_data" id="cm-logo-data"></div>
            <label class="radio-row"><input type="checkbox" name="logo_app" value="1"${b.logo_app !== false ? " checked" : ""}> Also show the Claim It logo</label>
            <p class="q-label">Colors</p>
            <div class="cm-colors"><label>Header<input type="color" name="header_color" value="${esc(b.header_color)}"></label><label>Button<input type="color" name="button_color" value="${esc(b.button_color)}"></label><label>Button text<input type="color" name="button_text" value="${esc(b.button_text)}"></label></div></div>
          <div><label class="field-l"><span>Sender name <span class="opt">(who emails are from)</span></span><input name="sender_name" maxlength="60" value="${esc(b.sender_name)}" placeholder="e.g. Chippewa Valley Raptors"></label>
            <label class="field-l"><span>Reply-to email <span class="opt">(where replies go)</span></span><input type="email" name="reply_to" maxlength="120" value="${esc(b.reply_to)}" placeholder="e.g. info@chippewavalleyraptors.com"></label>
            <label class="field-l"><span>Footer <span class="opt">(variables work here too)</span></span><textarea name="footer" rows="3" maxlength="600" placeholder="{{org_name}}&#10;PO Box 123, Chippewa Falls, WI">${esc(b.footer)}</textarea></label></div>
        </div>
        <p class="q-label">Your own variables <span class="fine-inline">Use them in any email, like <code>{{season}}</code>. Change the value here and every email updates.</span></p>
        <div class="cm-vars" id="cm-vars">${(b.vars || []).map(vrow).join("")}</div>
        <button type="button" class="link-dark" onclick="document.getElementById('cm-vars').insertAdjacentHTML('beforeend', ${esc(JSON.stringify(vrow()))})">+ Add a variable</button>
        <div class="q-actions"><button type="button" class="btn-ghost" onclick="document.getElementById('cm-bf').hidden=true">Cancel</button><button class="sb-btn primary" type="submit">Save branding</button></div>
      </form></section>
    ${groups.map((g) => `<section class="panel cm-group"><h2>${esc(g)}</h2><div class="table-wrap"><table class="cm-table"><thead><tr><th>Email</th><th>Sent when</th><th>Goes to</th><th>Subject</th><th></th></tr></thead><tbody>
      ${templates.filter((t) => t.group === g).map((t) => `<tr><td><b>${esc(t.name)}</b>${t.custom ? `<span class="st-pill info">Customized</span>` : `<span class="st-pill plain">Default</span>`}</td><td class="fine">${esc(t.when)}</td><td class="fine">${esc(t.to)}</td>
        <td><code class="cm-subj">${esc(t.subject)}</code></td><td><a class="sb-btn" href="/admin/people/communication/${t.key}">Edit</a></td></tr>`).join("")}</tbody></table></div></section>`).join("")}
    <script>(function () { var f = document.getElementById("cm-logo-file"); if (!f) return;
      if (location.hash === "#brand" && /err=/.test(location.search)) document.getElementById("cm-bf").hidden = false;
      f.addEventListener("change", function () { var file = f.files[0]; if (!file) return; var img = new Image(), rd = new FileReader();
        rd.onload = function () { img.onload = function () { var w = Math.min(600, img.width), h = Math.round(img.height * w / img.width), c = document.createElement("canvas"); c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h); var d = c.toDataURL("image/png"); document.getElementById("cm-logo-data").value = d;
          var el = document.getElementById("cm-logo-img"); el.src = d; el.hidden = false; var n = document.getElementById("cm-logo-none"); if (n) n.hidden = true; }; img.src = rd.result; }; rd.readAsDataURL(file); }); })();</script>` });
}

function editPage({ user, flash, head, t, brand: b }) {
  const chip = (k, d) => `<button type="button" class="cm-chip" data-var="${esc(k)}" title="${esc(d)}">{{${esc(k)}}}</button>`;
  return page({ title: `Edit · ${t.name}`, tab: "people", user, flash, xwide: true,
    body: `${head({ active: "communication" })}<div class="sub-top"><a class="back-btn" href="/admin/people/communication">← Communication</a><h2>${esc(t.name)} ${t.custom ? `<span class="st-pill info">Customized</span>` : `<span class="st-pill plain">Default</span>`}</h2></div>
    <p class="fine cm-meta"><b>Sent when:</b> ${esc(t.when)} · <b>Goes to:</b> ${esc(t.to)}${t.custom && t.updated_by ? ` · Last changed by ${esc(t.updated_by)}, ${esc(fmt(t.updated_at))}` : ""}</p>
    <div class="cm-edit">
      <form method="post" action="/admin/people/communication/${t.key}" class="panel cm-form" id="cm-form">
        <label class="field-l"><span>Subject</span><input name="subject" value="${esc(t.subject)}" maxlength="200" required data-target></label>
        <label class="field-l"><span>Heading <span class="opt">(the big line at the top)</span></span><input name="heading" value="${esc(t.heading || "")}" maxlength="200" data-target></label>
        <label class="field-l"><span>Message</span><textarea name="body" rows="9" maxlength="6000" data-target>${esc(t.body)}</textarea>
          <span class="fine">A blank line starts a new paragraph. <b>**bold**</b> · links: <code>[text](https://…)</code>. A line whose variables are all empty is left out.</span></label>
        ${t.button ? `<label class="field-l"><span>Button label <span class="opt">(leave empty for no button)</span></span><input name="button_label" value="${esc(t.buttonLabel || "")}" maxlength="60" data-target></label>` : ""}
        <div class="cm-vars-pick"><p class="q-label">Variables <span class="fine-inline">Click one to put it where your cursor is.</span></p>
          <div><span class="cm-vg">This email</span>${t.vars.map(([k, d]) => chip(k, d)).join("")}</div>
          <div><span class="cm-vg">Every email</span>${ET().GLOBAL_VARS.map(([k, d]) => chip(k, d)).join("")}</div>
          ${(b.vars || []).length ? `<div><span class="cm-vg">Yours</span>${b.vars.map((x) => chip(x.name, x.value)).join("")}</div>` : `<div class="fine">Add your own (like <code>{{season}}</code>) under Branding on the Communication page.</div>`}</div>
        <div class="cm-acts">
          ${t.custom ? `<button type="submit" class="btn-ghost danger" formaction="/admin/people/communication/${t.key}/reset" formnovalidate onclick="return confirm('Put this email back to the default wording?')">Reset to default</button>` : "<span></span>"}
          <span><button type="button" class="sb-btn" id="cm-test">Send me a test</button><button type="submit" class="sb-btn primary">Save</button></span></div>
      </form>
      <section class="panel cm-prev"><div class="cm-prev-h"><b>Preview</b> <span class="fine">with sample details</span></div>
        <div class="cm-prev-subj"><span class="fine">Subject:</span> <b id="cm-subj"></b></div><iframe id="cm-frame" title="Email preview"></iframe></section>
    </div>
    <script>(function () {
      var form = document.getElementById("cm-form"), last = form.querySelector("textarea[name=body]"), timer = null, frame = document.getElementById("cm-frame");
      form.querySelectorAll("[data-target]").forEach(function (el) { el.addEventListener("focus", function () { last = el; }); el.addEventListener("input", later); });
      document.querySelectorAll(".cm-chip").forEach(function (c) { c.addEventListener("click", function () {
        var v = "{{" + c.dataset.var + "}}", el = last, s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
        el.value = el.value.slice(0, s) + v + el.value.slice(e); el.focus(); el.selectionStart = el.selectionEnd = s + v.length; later(); }); });
      function body() { return new URLSearchParams(new FormData(form)); }
      function later() { clearTimeout(timer); timer = setTimeout(preview, 250); }
      function preview() { fetch("/admin/people/communication/${t.key}/preview", { method: "POST", headers: { Accept: "application/json" }, body: body() })
        .then(function (r) { return r.json(); }).then(function (j) { document.getElementById("cm-subj").textContent = j.subject; frame.srcdoc = j.html; }); }
      document.getElementById("cm-test").addEventListener("click", function () { var b = this; b.disabled = true;
        fetch("/admin/people/communication/${t.key}/test", { method: "POST", headers: { Accept: "application/json" }, body: body() }).then(function (r) { return r.json(); })
          .then(function (j) { b.disabled = false; alert(j.sent ? "Sent a test to " + j.to + "." : "Test written to the server log (email isn't set up on this server)."); })
          .catch(function () { b.disabled = false; alert("The test didn't send. Try again."); }); });
      preview();
    })();</script>` });
}
module.exports = { listPage, editPage };
