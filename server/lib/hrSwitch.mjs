// HR (attendance, leave, salary) is not part of the initial release. It stays off unless the
// server is started with HR_ENABLED=true. Read on every call, so a test (or a restart with the
// variable set) is enough to turn it on; nothing is cached.

export const hrEnabled = () => String(process.env.HR_ENABLED || "").trim().toLowerCase() === "true";

/** The answer every HR route gives while HR is off. */
export function hrOff(res) {
  return res.status(403).json({ error: "HR is not switched on for this release.", code: "HR_DISABLED" });
}
