import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SessionUser } from "../api";
import { useAuth } from "../auth";
import { Brand } from "../shell";
import { kvSet } from "../offline";

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);

  useEffect(() => {
    if (auth.user) navigate("/", { replace: true });
  }, [auth.user, navigate]);

  useEffect(() => {
    api<{ hasUsers?: boolean }>("/api/auth/bootstrap")
      .then((data) => setHasUsers(data.hasUsers !== false))
      .catch(() => setError("The installation cannot be reached from this device. A session has to be opened once while the link is up."));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await kvSet("user", result.user);
      auth.setUser(result.user);
      navigate("/", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-cover">
        <Brand />
        <h1>Containment and search, kept inside the system.</h1>
        <ol>
          <li>Scene surround on four sides, street blocks, and foot-search tasks.</li>
          <li>The fewest road closures that seal a drawn area.</li>
          <li>A land search ring from the person, the time, and the ground.</li>
          <li>A marine datum from wind, current, and the vessel.</li>
          <li>Public-order routes on foot, with resources held on the line of march.</li>
        </ol>
        <p>The models run here. They do not send a case to an external AI service.</p>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <p className="eyebrow">Sign in</p>
          <h2>Open the installation</h2>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          {!hasUsers && (
            <p className="hint">
              This installation has no accounts yet. An operator must supply PRESERVE_EVAL_PASSWORD and restart to seed evaluation accounts, or create accounts through an existing admin path.
            </p>
          )}
          <button type="submit" className="primary" disabled={busy || !hasUsers}>
            {busy ? "Checking" : "Enter"}
          </button>
        </form>
      </section>
    </div>
  );
}
