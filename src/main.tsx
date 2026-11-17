import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
// The font ships with the game: no request to Google, no third party seeing
// who plays (an EU privacy issue), and it works offline.
import "@fontsource/luckiest-guy/latin-400.css";
import "@fontsource/luckiest-guy/latin-ext-400.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
