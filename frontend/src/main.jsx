import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router.jsx";
import { Providers } from "./app/providers.jsx";
import "./styles/index.css";

const savedTheme = window.localStorage.getItem("invoiceflow-theme");
const systemPrefersDark = window.matchMedia?.(
  "(prefers-color-scheme: dark)",
).matches;
document.documentElement.dataset.theme =
  savedTheme ?? (systemPrefersDark ? "dark" : "light");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </React.StrictMode>,
);
