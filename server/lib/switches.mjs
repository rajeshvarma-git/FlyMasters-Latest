/**
 * Super Admin switches: the few controls that change how the whole business is protected.
 *
 * They live in the database (app_records, table 'system_switches') so the Super Admin flips them from his own
 * portal, with no deploy and no Railway setting. A switch that has never been touched falls back to its
 * default, and the sign-in code switches fall back to the old LOGIN_WHATSAPP_MFA setting so nothing changes
 * for an existing deployment until someone decides.
 */
const TABLE = "system_switches";

const envOn = () => String(process.env.LOGIN_WHATSAPP_MFA || "").trim().toLowerCase() === "on";

export const SWITCHES = [
  {
    key: "login_code_staff",
    label: "WhatsApp sign-in code for staff",
    help: "After the password, every staff member must enter a 6-digit code sent to their own WhatsApp number.",
    risky: "Staff with no WhatsApp number on their profile cannot sign in while this is on.",
    defaultValue: () => envOn(),
  },
  {
    key: "login_code_students",
    label: "WhatsApp sign-in code for students",
    help: "After the password, every student must enter a 6-digit code sent to their own WhatsApp number.",
    risky: "Costs one WhatsApp message per student sign-in.",
    defaultValue: () => envOn(),
  },
  {
    key: "transfer_needs_approval",
    label: "Admin cross-branch transfers need my approval",
    help: "When an Admin asks to move leads or students to another branch, nothing moves until you accept.",
    risky: "If turned off, Admins' cross-branch requests are refused instead of waiting for you.",
    defaultValue: () => true,
  },
];

export const switchByKey = (key) => SWITCHES.find((s) => s.key === key) || null;

/** Current value of one switch. */
export async function switchOn(pool, key) {
  const def = switchByKey(key);
  if (!def) return false;
  const r = await pool.query("SELECT data FROM app_records WHERE id = $1 AND table_name = $2", [`switch:${key}`, TABLE]);
  const stored = r.rows[0]?.data;
  return stored && typeof stored.value === "boolean" ? stored.value : def.defaultValue();
}

/** Every switch with its value and who last changed it. */
export async function listSwitches(pool) {
  const r = await pool.query("SELECT id, data FROM app_records WHERE table_name = $1", [TABLE]);
  const stored = new Map(r.rows.map((row) => [row.data?.key, row.data]));
  return SWITCHES.map((s) => {
    const row = stored.get(s.key);
    const has = row && typeof row.value === "boolean";
    return {
      key: s.key, label: s.label, help: s.help, risky: s.risky,
      value: has ? row.value : s.defaultValue(),
      isDefault: !has,
      changedBy: row?.changed_by || null, changedByName: row?.changed_by_name || null, changedAt: row?.changed_at || null,
    };
  });
}

export async function setSwitch(pool, key, value, by) {
  const data = { key, value: Boolean(value), changed_by: by?.id || null, changed_by_name: by?.name || null, changed_at: new Date().toISOString() };
  await pool.query(
    `INSERT INTO app_records (id, table_name, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [`switch:${key}`, TABLE, JSON.stringify(data)],
  );
}
