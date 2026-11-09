// Is this running inside the Capacitor shell, and what the shell needs at start-up.
//
// Everything mobile goes through here, because a WebView differs from a browser in two ways that
// matter to the staff portals:
//
//   1. There is no server origin. A relative fetch("/api/...") resolves against capacitor://localhost
//      (iOS) or http://localhost (Android) and never reaches the backend, so requests need an
//      absolute base. See shared/lib/apiBase.ts.
//   2. The WebView is destroyed when the operating system reclaims the app, so sessionStorage is
//      emptied every time the app is backgrounded for long enough. See shared/lib/tokenStore.ts.
//
// The platform question is answered through Capacitor, but the rules above are plain functions that
// take `native` as an argument, so they can be tested without a device.
import { Capacitor } from "@capacitor/core";

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false; // the plugin is absent in a plain browser build
  }
};

export const nativePlatform = (): "ios" | "android" | "web" => {
  try {
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  } catch {
    return "web";
  }
};

/**
 * Start-up for the native shell: status bar, splash screen and the Android back button.
 * A no-op in a browser, so it is safe to call unconditionally from the entry point.
 */
export async function initNative(): Promise<void> {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
    if (nativePlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#4F46E5" });
    }
  } catch {
    /* plugin unavailable */
  }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* plugin unavailable */
  }

  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      // Android's hardware back button: step back through the app, and leave the app only from the top.
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  } catch {
    /* plugin unavailable */
  }
}
