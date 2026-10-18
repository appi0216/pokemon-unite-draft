import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./legacy.css";
import "./adaptive-ui.css";
import "./setup-refresh.css";
import "./workspace-layout.css";
import "./ui-tokens.css";
import "./responsive-controls.css";
import { registerAppWorker } from "./pwa/runtime";
registerAppWorker();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);


