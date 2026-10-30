import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@slayply/ui/theme.css";
import "@slayply/ui/components.css";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Side panel root element is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
