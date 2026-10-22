import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { isLocalHost } from "@shared/localHost";
import { installStaffPreview, isStaffPreview } from "@shared/staffPreview";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");
const root = createRoot(container);
const mount = () => root.render(<App />);

// LOCAL PREVIEW ONLY: dev server + VITE_PREVIEW=true + served from localhost. The whole branch is removed from
// production builds (import.meta.env.DEV is false). Delete this block and
// src/portals/student/lib/studentPreviewMock.ts to remove the student preview.
const staffPrefix = /^\/(staff|admin|counselor|telecaller|partner|r)(\/|$)/;
// LOCAL PREVIEW ONLY (staff portals): same three locks, see src/shared/staffPreview.tsx.
if (isStaffPreview() && /^\/(staff|admin|counselor|telecaller)(\/|$)/.test(window.location.pathname)) {
  installStaffPreview();
  mount();
} else if (import.meta.env.DEV && import.meta.env.VITE_PREVIEW === "true" && isLocalHost() && !staffPrefix.test(window.location.pathname)) {
  import("@student/lib/studentPreviewMock").then((m) => { m.installStudentPreview(); mount(); });
} else {
  mount();
}
