import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { initFirebase } from "@skatingx/firebase-client";

import { App } from "./app/App";
import { ActiveAthleteProvider } from "./app/providers/activeAthleteContext";
import "./styles/index.css";

initFirebase();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ActiveAthleteProvider>
        <App />
      </ActiveAthleteProvider>
    </BrowserRouter>
  </StrictMode>,
);
