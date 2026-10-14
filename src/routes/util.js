const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const flashFrom = (req) => ({ ok: req.query.ok, err: req.query.err });
const go = (res, path, flash = {}) => {
  const q = new URLSearchParams(Object.entries(flash).filter(([, v]) => v)).toString();
  const [base, hash] = path.split("#"); // query must come before any #anchor
  res.redirect(`${base}${q ? `${base.includes("?") ? "&" : "?"}${q}` : ""}${hash ? `#${hash}` : ""}`);
};
const int = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const str = (v) => String(v ?? "").trim();
// Forms on the Setup page send return_to so actions land back where they started
const dest = (req, fallback, vars = {}) => {
  let r = String((req.body && req.body.return_to) || "");
  if (!r.startsWith("/admin/") || r.startsWith("//")) return fallback;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, v);
  return r;
};
module.exports = { wrap, flashFrom, go, int, str, dest };
