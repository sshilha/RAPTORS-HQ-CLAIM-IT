const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const flashFrom = (req) => ({ ok: req.query.ok, err: req.query.err });
const go = (res, path, flash = {}) => {
  const q = new URLSearchParams(Object.entries(flash).filter(([, v]) => v)).toString();
  res.redirect(q ? `${path}?${q}` : path);
};
const int = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const str = (v) => String(v ?? "").trim();
module.exports = { wrap, flashFrom, go, int, str };
