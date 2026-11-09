// Where a signed-in staff token is kept.
//
// On the web it stays in sessionStorage, which is deliberate: a staff token on a shared or public
// machine should not outlive the tab. That is today's behaviour and it does not change.
//
// Inside the Capacitor shell sessionStorage is the wrong choice, because the operating system destroys
// the WebView whenever it reclaims the app. The token would vanish every time the person switched apps
// for a while, and they would be signed out constantly. On a native platform the token goes to
// localStorage, which survives that.
//
// NOTE, still open: localStorage in a WebView is not secure storage. The token is a JWT valid for
// seven days with no server-side revocation, so on a rooted or jailbroken device it could be read.
// Moving to @capacitor/preferences with an encrypted store, or shortening the token's life and adding
// a refresh, is a decision for whoever signs off M1.3. It is not a reason to keep sessionStorage,
// which simply does not work.
import { isNative } from "./native";

/** The pure rule, testable without a device: which Storage a platform should use. */
export function storageFor(native: boolean, win: { sessionStorage: Storage; localStorage: Storage }): Storage {
  return native ? win.localStorage : win.sessionStorage;
}

const store = (): Storage | null => {
  try {
    return storageFor(isNative(), window);
  } catch {
    return null; // private mode, or storage disabled
  }
};

export function readToken(key: string): string | null {
  try {
    const primary = store();
    // Read both wherever the token may have been written: by the other platform's rule, or by an
    // older build. Writing follows one rule; reading forgives both.
    return (primary?.getItem(key) ?? null) || sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeToken(key: string, value: string | null): void {
  try {
    if (value === null) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      return;
    }
    store()?.setItem(key, value);
  } catch {
    /* private mode / storage disabled */
  }
}
