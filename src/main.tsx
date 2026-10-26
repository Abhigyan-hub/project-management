import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { supabaseConfigError } from "./lib/supabase";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {supabaseConfigError ? (
      <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 520, margin: "15vh auto", padding: 24 }}>
        <h1 style={{ fontSize: 22 }}>Supabase is not configured</h1>
        <p>{supabaseConfigError}</p>
      </div>
    ) : (
      <App />
    )}
  </StrictMode>,
);
