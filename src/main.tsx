import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initNative } from "@shared/lib/native";

// A no-op in a browser. Nothing called the old student-only version, so the native shell started with
// its splash screen up and the Android back button unhandled.
void initNative();

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");
const root = createRoot(container);
const mount = () => root.render(<App />);

// LOCAL PREVIEW ONLY: dev server + VITE_PREVIEW=true. The whole branch is removed from
// production builds (import.meta.env.DEV is false). Delete this block and
// src/portals/student/lib/studentPreviewMock.ts to remove the student preview.
const staffPrefix = /^\/(staff|admin|counselor|telecaller|partner|r)(\/|$)/;
if (import.meta.env.DEV && import.meta.env.VITE_PREVIEW === "true" && !staffPrefix.test(window.location.pathname)) {
  import("@student/lib/studentPreviewMock").then((m) => { m.installStudentPreview(); mount(); });
} else {
  mount();
}
