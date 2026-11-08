import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api, type SessionUser } from "./api";
import { kvDelete, kvGet, kvSet, outboxAll, outboxCount, outboxRemove } from "./offline";

type AuthState = {
  user: SessionUser | null;
  ready: boolean;
  online: boolean;
  link: boolean;
  device: boolean;
  setDevice: (value: boolean) => void;
  evaluationInstall: boolean;
  outbox: number;
  refreshOutbox: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth missing");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [device, setDeviceState] = useState(() => localStorage.getItem("preserve-device") === "1");
  const [evaluationInstall, setEvaluationInstall] = useState(false);
  const [outbox, setOutbox] = useState(0);

  const online = link && !device;

  async function refreshOutbox() {
    setOutbox(await outboxCount());
  }

  function setDevice(value: boolean) {
    setDeviceState(value);
    localStorage.setItem("preserve-device", value ? "1" : "0");
  }

  useEffect(() => {
    let stop = false;
    async function boot() {
      try {
        const health = await fetch("/api/health", { cache: "no-store" });
        if (!health.ok) throw new Error("down");
        const me = await api<{ user: SessionUser; evaluationInstall: boolean }>("/api/auth/me");
        if (stop) return;
        setLink(true);
        setUser(me.user);
        setEvaluationInstall(me.evaluationInstall);
        await kvSet("user", me.user);
      } catch {
        const cached = await kvGet<SessionUser>("user");
        if (!stop) {
          setLink(false);
          if (cached) setUser(cached);
        }
      } finally {
        if (!stop) {
          await refreshOutbox();
          setReady(true);
        }
      }
    }
    void boot();
    const onLink = () => setLink(navigator.onLine);
    window.addEventListener("online", onLink);
    window.addEventListener("offline", onLink);
    const timer = window.setInterval(() => {
      if (localStorage.getItem("preserve-device") === "1") return;
      fetch("/api/health", { cache: "no-store" })
        .then((res) => setLink(res.ok))
        .catch(() => setLink(false));
    }, 15000);
    return () => {
      stop = true;
      window.removeEventListener("online", onLink);
      window.removeEventListener("offline", onLink);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!online || !user) return;
    let cancel = false;
    (async () => {
      const items = await outboxAll();
      for (const item of items) {
        try {
          await api(`/api/incidents/${item.incidentId}/plans`, {
            method: "POST",
            body: JSON.stringify({
              module: item.module,
              input: item.input,
              environment: item.environment,
            }),
          });
          await outboxRemove(item.id);
        } catch {
          break;
        }
      }
      if (!cancel) await refreshOutbox();
    })();
    return () => {
      cancel = true;
    };
  }, [online, user]);

  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* the local session still ends */
    }
    await kvDelete("user");
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      ready,
      online,
      link,
      device: device || !link,
      setDevice,
      evaluationInstall,
      outbox,
      refreshOutbox,
      signOut,
      setUser,
    }),
    [user, ready, online, link, device, evaluationInstall, outbox],
  );

  if (!ready) {
    return (
      <div className="booting">
        <p>Opening PRESERVE</p>
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
