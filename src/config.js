module.exports = {
  TZ: "America/Chicago",
  AGE_GROUPS: ["10U", "12U", "14U", "16U", "18U"],
  ACTIVITIES: ["Hitting", "Pitching", "Catching", "Defense"],
  APP_URL: (process.env.APP_URL || "").replace(/\/$/, ""),
};
