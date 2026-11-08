import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "leaflet/dist/leaflet.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider, RequireAuth } from "./auth";
import { Admin } from "./pages/Admin";
import { Audit } from "./pages/Audit";
import { Board } from "./pages/Board";
import { IncidentPage } from "./pages/Incident";
import { Login } from "./pages/Login";
import { Security } from "./pages/Security";
import { Shell } from "./shell";
import "./styles.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<Shell />}>
              <Route path="/" element={<Board />} />
              <Route path="/incidents/:id" element={<IncidentPage />} />
              <Route path="/security" element={<Security />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
