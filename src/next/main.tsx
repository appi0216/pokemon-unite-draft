import React from "react";
import { createRoot } from "react-dom/client";
import Studio from "./Studio";
import "./studio.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Studio />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => {});
  });
}
