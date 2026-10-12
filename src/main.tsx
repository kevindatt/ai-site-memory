import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

// Service worker: production builds only. Caches the versioned app shell so
// the installed PWA opens offline; it never caches document contents,
// tokens, or audit data (see public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline-first is best-effort: the app works fully without it.
    });
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
