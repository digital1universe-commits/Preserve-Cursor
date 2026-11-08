import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SessionUser } from "../api";
import { useAuth } from "../auth";
import { Brand } from "../shell";
import { kvSet } from "../offline";

type Account = { email: string; displayName: string; appointment: string; role: string; agency: string };

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("commander@hmp.preserve.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ password: string; accounts: Account[] } | null>(null);

  useEffect(() => {
    if (auth.user) navigate("/", { replace: true });
  }, [auth.user, navigate]);

  useEffect(() => {
    api<{ demoBanner: boolean; password?: string; accounts?: Account[] }>("/api/auth/bootstrap")
      .then((data) => {
        if (data.demoBanner && data.password && data.accounts) {
          setBanner({ password: data.password, accounts: data.accounts });
          setPassword(data.password);
        }
      })
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

  const featuredOrder = ["commander@hmp.preserve.test", "search@crc.preserve.test", "field@hmp.preserve.test"];
  const featured = banner
    ? featuredOrder.flatMap((email) => banner.accounts.filter((account) => account.email === email))
    : undefined;

  return (
    <div className="login">
      <section className="login-cover">
        <Brand />
        <h1>Containment and search, kept inside the system.</h1>
        <ol>
          <li>Siege cordon posts, an outer ring, and a rendezvous.</li>
          <li>The fewest road closures that seal a drawn area.</li>
          <li>A land search ring from the person, the time, and the ground.</li>
          <li>A marine datum from wind, current, and the vessel.</li>
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
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Checking" : "Enter"}
          </button>
        </form>
        {banner && featured && (
          <div className="eval">
            <p className="eyebrow">Evaluation access</p>
            <p>These accounts ship with this build so it can be reviewed. Remove them before any operational use.</p>
            <ul>
              {featured.map((account) => (
                <li key={account.email}>
                  <button type="button" onClick={() => setEmail(account.email)}>
                    <strong>{account.displayName}</strong>
                    <span>{account.email}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p>
              Password <code>{banner.password}</code>
            </p>
            <details>
              <summary>All evaluation accounts</summary>
              <ul>
                {banner.accounts.map((account) => (
                  <li key={account.email}>
                    {account.agency} · {account.appointment} · {account.email}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
