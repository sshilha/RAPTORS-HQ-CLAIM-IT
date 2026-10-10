module.exports = {
  TZ: "America/Chicago",
  AGE_GROUPS: ["8U", "10U", "12U", "14U", "16U", "18U"],
  ACTIVITIES: ["Hitting", "Pitching", "Catching", "Defense", "Cage Time"],
  // Colors match the vendor's schedule so the grid reads like the PDF
  ACTIVITY_COLORS: { Hitting: "#93c47d", Pitching: "#7fa7d9", Catching: "#f6cf55", Defense: "#d0503f", "Cage Time": "#9a85cc" },
  // Activities open to every age group by default
  ALL_AGES_ACTIVITIES: ["Cage Time"],
  APP_URL: (() => {
    const u = (process.env.APP_URL || "").trim().replace(/\/$/, "");
    return u && !/^https?:\/\//.test(u) ? `https://${u}` : u; // tolerate a missing https://
  })(),
};
