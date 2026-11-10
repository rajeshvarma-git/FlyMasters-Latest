// HR (attendance, leave, salary) is not part of the initial release. It stays off unless the
// server is started with HR_ENABLED=true. Read on every call, so a test (or a restart with the
// variable set) is enough to turn it on; nothing is cached.

export const hrEnabled = () => String(process.env.HR_ENABLED || "").trim().toLowerCase() === "true";

/**
 * Telecaller HR follows the same switch, with one override: TELECALLER_HR_ENABLED=true turns it on for
 * telecallers alone, =false keeps it off even when HR_ENABLED is true.
 *
 * This lives here, beside hrEnabled, because two places answer this question - the telecaller routes
 * and /api/version - and a deployment where those two disagree is exactly the bug that is impossible
 * to see from the outside.
 */
export const telecallerHrEnabled = () => {
  const own = String(process.env.TELECALLER_HR_ENABLED || "").trim().toLowerCase();
  if (own === "true") return true;
  if (own === "false") return false;
  return hrEnabled();
};

/** The answer every HR route gives while HR is off. */
export function hrOff(res) {
  return res.status(403).json({ error: "HR is not switched on for this release.", code: "HR_DISABLED" });
}
