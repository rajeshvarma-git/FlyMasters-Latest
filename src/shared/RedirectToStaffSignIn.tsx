/**
 * Sends anyone who lands on a portal's own sign-in screen, or who is signed
 * out inside a portal, to the single staff door at /staff.
 *
 * A full-page navigation on purpose: /staff is outside this portal's router
 * basename, so react-router's Navigate cannot reach it.
 */
export default function RedirectToStaffSignIn() {
  if (typeof window !== "undefined" && window.location.pathname !== "/staff") {
    window.location.replace("/staff");
  }
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Taking you to sign in…
    </div>
  );
}
