// Where the refresh token is kept on each platform.
//
// The refresh token is the one long-lived credential a signed-in staff member holds: it is good for
// thirty days, where the access token is good for fifteen minutes. It therefore gets the best store
// the platform offers, not the one that was convenient.
//
//   native, with a secure-storage plugin  -> the iOS Keychain / Android Keystore, encrypted at rest
//   native, with @capacitor/preferences   -> native preferences: survives the WebView being reclaimed,
//                                            NOT encrypted; reported as such
//   anything else (web, or a native build -> localStorage on native, sessionStorage on the web, the
//   with neither plugin)                     same rule tokenStore.ts uses for the access token
//
// Plugins are looked up on `window.Capacitor.Plugins` at RUN time rather than imported. Neither plugin
// is in package.json today, so a static import would break the web build; this way a native build that
// adds one picks it up with no code change, and a build without one still works.
//
// Honesty matters more than a reassuring name here: `refreshStoreKind()` reports what is actually in
// use, `/api/version` style, so nobody signs off "encrypted storage" on a build that has none.
import { isNative } from "./native";
import { readToken, writeToken } from "./tokenStore";

export type RefreshStoreKind = "keychain" | "native-preferences" | "browser-storage";

type SecurePlugin = {
  get: (options: { key: string }) => Promise<{ value: string }>;
  set: (options: { key: string; value: string }) => Promise<unknown>;
  remove: (options: { key: string }) => Promise<unknown>;
};
type PreferencesPlugin = {
  get: (options: { key: string }) => Promise<{ value: string | null }>;
  set: (options: { key: string; value: string }) => Promise<unknown>;
  remove: (options: { key: string }) => Promise<unknown>;
};
type Plugins = { SecureStoragePlugin?: SecurePlugin; Preferences?: PreferencesPlugin };

/** The pure rule, so the choice can be tested without a device: which store a platform should use. */
export function pickRefreshStore(native: boolean, plugins: Plugins | undefined): RefreshStoreKind {
  if (!native) return "browser-storage";
  if (plugins?.SecureStoragePlugin) return "keychain";
  if (plugins?.Preferences) return "native-preferences";
  return "browser-storage";
}

const plugins = (): Plugins | undefined => {
  try {
    return (window as unknown as { Capacitor?: { Plugins?: Plugins } }).Capacitor?.Plugins;
  } catch {
    return undefined;
  }
};

/** What is actually storing the refresh token right now. Shown in diagnostics; never guessed at. */
export function refreshStoreKind(): RefreshStoreKind {
  return pickRefreshStore(isNative(), plugins());
}

/** True when the refresh token is encrypted at rest by the operating system. */
export const refreshStoreIsEncrypted = (): boolean => refreshStoreKind() === "keychain";

export async function readSecure(key: string): Promise<string | null> {
  const kind = refreshStoreKind();
  try {
    if (kind === "keychain") return (await plugins()!.SecureStoragePlugin!.get({ key })).value || null;
    if (kind === "native-preferences") return (await plugins()!.Preferences!.get({ key })).value || null;
  } catch {
    // A secure store throws rather than returning null when the key is absent, and can be locked.
    return readToken(key);
  }
  return readToken(key);
}

export async function writeSecure(key: string, value: string | null): Promise<void> {
  const kind = refreshStoreKind();
  try {
    if (kind === "keychain") {
      if (value === null) await plugins()!.SecureStoragePlugin!.remove({ key }).catch(() => {});
      else await plugins()!.SecureStoragePlugin!.set({ key, value });
      return;
    }
    if (kind === "native-preferences") {
      if (value === null) await plugins()!.Preferences!.remove({ key });
      else await plugins()!.Preferences!.set({ key, value });
      return;
    }
  } catch {
    // Fall through to browser storage rather than losing the session over a plugin error.
  }
  writeToken(key, value);
}
