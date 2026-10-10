const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const flashFrom = (req) => ({ ok: req.query.ok, err: req.query.err });
const go = (res, path, flash = {}) => {
  const q = new URLSearchParams(Object.entries(flash).filter(([, v]) => v)).toString();
  const [base, hash] = path.split("#"); // query must come before any #anchor
  res.redirect(`${base}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`);
};
const int = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const str = (v) => String(v ?? "").trim();
module.exports = { wrap, flashFrom, go, int, str };
