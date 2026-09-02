// First, deliberately: it reads the password-reset marker out of the URL before
// the Supabase client (pulled in below via AuthContext) can consume and erase it.
import "./lib/recoveryLink";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { RewardProvider } from "./context/RewardContext";
import { RegionProvider } from "./context/RegionContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CurrencyProvider>
          <RewardProvider>
            <RegionProvider>
              <App />
            </RegionProvider>
          </RewardProvider>
        </CurrencyProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
