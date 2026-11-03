// Loading and saving the editable lists, with renames cascading through existing data.
const { query } = require("./db");
const config = require("./config");

const clone = (x) => JSON.parse(JSON.stringify(x));

async function load() {
  await query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const row = (await query(`SELECT value FROM app_settings WHERE key='catalog'`)).rows[0];
  if (row) {
    const c = normalize(row.value);
    // The app was renamed to Raptors Claim It; upgrade the old default names (custom names are kept)
    let upgraded = false;
    if (["Raptors Training", "Raptors Sign-Ups", "Sign-Ups"].includes(c.app_labels.app_name)) {
      c.app_labels = { ...c.app_labels, app_name: "Raptors Claim It", app_short: "Claim It" }; upgraded = true;
    }
    // Each sign-up space is a "Claim Board" now (unless it's been renamed to something else)
    const sl = (c.app_labels.schedule || [])[0];
    if (!sl || sl === "Schedule") { c.app_labels = { ...c.app_labels, schedule: ["Claim Board", "Claim Boards"] }; upgraded = true; }
    if (upgraded) await query(`UPDATE app_settings SET value=$1, updated_at=now() WHERE key='catalog'`, [JSON.stringify(c)]);
    config.apply(c);
  }
  else {
    await query(`INSERT INTO app_settings (key, value) VALUES ('catalog', $1)`, [JSON.stringify(config.DEFAULT_CATALOG)]);
    config.apply(clone(config.DEFAULT_CATALOG));
  }
}

function normalize(c) {
  return {
    activities: (c.activities || []).map((a) => ({
      name: String(a.name), color: a.color || "#8899aa", all_ages: !!a.all_ages,
      default_spots: a.default_spots || 8, default_block: a.default_block || null,
      default_limit: a.default_limit === null || a.default_limit === undefined ? null : a.default_limit,
      aliases: a.aliases || [], active: a.active !== false, schedule_id: a.schedule_id || null, item_list: !!a.item_list,
    })),
    age_groups: c.age_groups || [], presets: c.presets || [], locations: c.locations || [],
    family_names: c.family_names || "initial",
    app_labels: c.app_labels || require("./config").DEFAULT_CATALOG.app_labels,
    board_settings_moved: !!c.board_settings_moved,
    seasons_flattened: !!c.seasons_flattened,
    change_email: typeof c.change_email === "string" && c.change_email ? c.change_email : "info@chippewavalleyraptors.com",
    new_accounts: c.new_accounts === "open" ? "open" : "approval",
    password_policy: c.password_policy === "required" ? "required" : "optional",
    places_migrated: !!c.places_migrated,
  };
}

async function save(next, db = { query }) {
  await db.query(`INSERT INTO app_settings (key, value, updated_at) VALUES ('catalog', $1, now())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(next)]);
  config.apply(next);
}

const current = () => clone(config.CATALOG.current);

// How much data refers to an activity / age group (used to block unsafe removals)
// How much of one schedule's data uses an activity
module.exports = { load, save, current, normalize };
