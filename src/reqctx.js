// The current request's visitor, for shared page pieces (App Settings header, board tabs) that don't receive it.
const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();
module.exports = { middleware: (req, res, next) => als.run({ req }, next), access: () => { const s = als.getStore(); return s && s.req && s.req.user ? s.req.user._access || null : null; } };
