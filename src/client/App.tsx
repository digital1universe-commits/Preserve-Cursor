import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./auth";
import { Admin } from "./pages/Admin";
import { Audit } from "./pages/Audit";
import { Board } from "./pages/Board";
import { IncidentPage } from "./pages/Incident";
import { Login } from "./pages/Login";
import { Security } from "./pages/Security";
import { Shell } from "./shell";

export function PreserveApp() {
  return (
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
  );
}
