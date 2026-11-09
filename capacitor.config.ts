import type { CapacitorConfig } from "@capacitor/cli";

// The native shell for the one web app: every portal is served from a single build, so one shell
// covers staff and students alike.
//
// The native projects (android/ and ios/) are NOT in this repository. Generate them on a machine with
// the platform tools, which also decides whether to commit them:
//
//   npm ci && npm run build
//   npx cap add android          # needs Android Studio / the Android SDK
//   npx cap add ios              # needs macOS with Xcode and CocoaPods
//   npx cap sync
//
// A device build must be given the backend URL at build time, because a WebView has no server origin:
//
//   VITE_API_BASE_URL=https://<host> npm run build && npx cap sync
//
// See src/shared/lib/apiBase.ts. Without it the app starts and every request fails.
const config: CapacitorConfig = {
  appId: "com.flymasters.app",
  appName: "Fly Masters",
  webDir: "dist",
  server: {
    // The app is served from the bundle; only a live-reload run points at a dev server.
    androidScheme: "https",
  },
};

export default config;
