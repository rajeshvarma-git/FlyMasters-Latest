// Client-side switches, fixed when the app is built.
//
// HR (attendance, leave, salary, payroll) is not part of the initial release. The server refuses
// the HR routes unless it runs with HR_ENABLED=true; this switch hides the matching screens. To
// turn HR on, set HR_ENABLED=true on the server AND build the app with VITE_HR_ENABLED=true.
export const HR_ENABLED = import.meta.env.VITE_HR_ENABLED === "true";
