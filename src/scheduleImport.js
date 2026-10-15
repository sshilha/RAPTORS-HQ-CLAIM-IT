// Parses vendor schedule text (from the Turn Two PDF or pasted) into sessions.
// Format per line: "<date>" lines followed by "6-7:30pm-Hitting-12/14/16/18U" lines.
const { AGE_GROUPS, ACTIVITIES, ALL_AGES_ACTIVITIES, ACTIVITY_META } = require("./config");
const { programName } = require("./rounds");

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTH_RE = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?!\\d|st|nd|rd|th)`, "gi");
const MONTH_YEAR_RE = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`, "i");
// Spaces are stripped first, so "Cage Time 1" arrives as "CageTime1"; age groups are optional
const SESSION_RE = /^(\d{1,2})(?::(\d{2}))?(am|pm)?-(\d{1,2})(?::(\d{2}))?(am|pm)?-([a-z]+?)\d*(?:-((?:\d{1,2}\/)*\d{1,2})u)?$/i;

// Matches an activity by name (spaces ignored) or by one of its import codes from Settings
function activityFor(word) {
  const w = word.toLowerCase();
  const squash = (x) => String(x).replace(/\s/g, "").toLowerCase();
  return ACTIVITIES.find((a) => squash(a) === w) ||
    ACTIVITIES.find((a) => ((ACTIVITY_META[a] || {}).aliases || []).some((x) => squash(x) === w)) || null;
}

const to24 = (h, suffix) => (suffix.toLowerCase() === "am" ? h % 12 : (h % 12) + 12);

// Training runs afternoons/evenings: unmarked 11 = AM, 12 = noon, 1–10 = PM.
const guess24 = (h) => (h === 11 ? 11 : h === 12 ? 12 : h + 12);

function times(sh, sm, ss, eh, em, es) {
  const endH = es ? to24(eh, es) : guess24(eh);
  const end = endH * 60 + em;
  let startH;
  if (ss) startH = to24(sh, ss);
  else {
    // Pick the AM or PM reading that falls within 6 hours before the end
    const options = [sh % 12, (sh % 12) + 12].filter((h) => {
      const m = h * 60 + sm;
      return m < end && end - m <= 360;
    });
    startH = options.length ? options[options.length - 1] : guess24(sh);
  }
  const start = startH * 60 + sm;
  if (start >= end) return null;
  const f = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { start: f(start), end: f(end) };
}


function parseSchedule(text, { year, groups } = {}) {
  const GROUPS = groups && groups.length ? groups : AGE_GROUPS;
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const sessions = [];
  const warnings = [];
  let detectedYear = null;
  let curYear = year || null;
  let lastMonth = null;
  let curDate = null;
  let round = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;

    if (!detectedYear) {
      const my = line.match(MONTH_YEAR_RE);
      if (my) { detectedYear = parseInt(my[2], 10); if (!curYear) curYear = detectedYear; }
    }

    const r = line.match(/\bround\s*(\d+)/i);
    if (r) { round = parseInt(r[1], 10); continue; } // round header also contains date ranges; skip it

    const compact = line.replace(/\s+/g, "");
    const m = compact.match(SESSION_RE);
    if (m) {
      if (!curDate) { warnings.push(`No date found before "${line}"`); continue; }
      const activity = activityFor(m[7]);
      let ages = m[8] ? m[8].split("/").map((n) => `${parseInt(n, 10)}U`) : [];
      if (activity && !ages.length) {
        if (!ALL_AGES_ACTIVITIES.includes(activity)) { warnings.push(`${curDate.label}: skipped "${line}" (no age group)`); continue; }
        ages = [...GROUPS];
      }
      const badAges = ages.filter((a) => !GROUPS.includes(a));
      const t = times(+m[1], +(m[2] || 0), m[3], +m[4], +(m[5] || 0), m[6]);
      if (!activity) { warnings.push(`${curDate.label}: unknown activity in "${line}"`); continue; }
      if (badAges.length) { warnings.push(`${curDate.label}: unknown age group ${badAges.join(", ")} in "${line}"`); continue; }
      if (!t) { warnings.push(`${curDate.label}: couldn't read the times in "${line}"`); continue; }
      const sorted = GROUPS.filter((g) => ages.includes(g));
      sessions.push({
        date: curDate.iso, start: t.start, end: t.end, activity, ages: sorted, round,
        program: programName(round ? `Round ${round}` : "Imported", activity, sorted),
        source: line,
      });
      continue;
    }

    // Date line(s): a row can hold several dates; sessions belong to the last one
    const dates = [...line.matchAll(MONTH_RE)];
    if (dates.length && !MONTH_YEAR_RE.test(line) && !/[–—]/.test(line)) { // dashes = header date ranges
      const d = dates[dates.length - 1];
      const month = MONTHS.indexOf(d[1].toLowerCase());
      if (!curYear) curYear = new Date().getFullYear();
      // Advance the year once per rollover (e.g. December → January)
      for (const x of dates) {
        const mi = MONTHS.indexOf(x[1].toLowerCase());
        if (lastMonth !== null && mi < lastMonth) curYear++;
        lastMonth = mi;
      }
      const day = parseInt(d[2], 10);
      const iso = `${curYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      curDate = { iso, label: `${d[1][0].toUpperCase()}${d[1].slice(1).toLowerCase()} ${day}` };
      continue;
    }

    // A line that starts with a time but didn't parse (e.g. "3-7pm-Cage Time 1")
    if (/^\d{1,2}(:\d{2})?\s*(am|pm)?\s*-/i.test(line)) {
      warnings.push(`${curDate ? curDate.label : "No date"}: couldn't read "${line}"`);
    }
  }
  return { sessions, warnings, detectedYear };
}

module.exports = { parseSchedule };
