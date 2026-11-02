// Texting is turned off: the club isn't using a text-message provider, so no screen offers texted codes.
// (Sign-in uses passwords, emailed links, and admin one-time codes.)
const enabled = () => false;
const live = () => false;
const dev = () => false;
async function send() { throw new Error("Texting is turned off."); }
module.exports = { enabled, live, dev, send };
