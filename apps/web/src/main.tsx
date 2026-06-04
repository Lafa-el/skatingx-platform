import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { initFirebase } from "@skatingx/firebase-client";

import { App } from "./app/App";
import { AuthProvider } from "./app/providers/AuthProvider";
import { FirestoreProvider } from "./app/providers/FirestoreProvider";
import "./styles/index.css";

initFirebase();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FirestoreProvider>
          <App />
        </FirestoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
