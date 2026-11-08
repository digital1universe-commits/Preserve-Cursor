import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ROLE_LABEL } from "../format";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  appointment: string;
  role: string;
  active: boolean;
  evaluation: boolean;
  agencyShort: string;
  agencyId: string;
};

type Agency = { id: string; name: string; shortName: string; kind: string };

export function Admin() {
  const auth = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    appointment: "",
    role: "field_officer",
    agencyId: auth.user?.agencyId || "",
    password: "",
  });

  async function load() {
    const [userData, agencyData] = await Promise.all([
      api<{ users: UserRow[] }>("/api/users"),
      api<{ agencies: Agency[] }>("/api/agencies"),
    ]);
    setUsers(userData.users);
    setAgencies(agencyData.agencies);
  }

  useEffect(() => {
    load().catch((reason) => setError(reason.message));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...form, email: "", displayName: "", appointment: "", password: "" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account was not created.");
    }
  }

  async function toggle(user: UserRow) {
    await api(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ active: !user.active }) });
    await load();
  }

  const roles = auth.user?.role === "superadmin" ? Object.keys(ROLE_LABEL) : Object.keys(ROLE_LABEL).filter((role) => role !== "superadmin");

  return (
    <div className="page">
      <p className="eyebrow">Accounts</p>
      <h1>People and agencies</h1>
      <p className="hint">There is no self-registration. An admin creates every account. Deactivating an account ends its sessions.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="admin-grid">
        <form className="stack card" onSubmit={create}>
          <h2>New account</h2>
          <label>
            Name
            <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
          </label>
          <label>
            Appointment
            <input value={form.appointment} onChange={(event) => setForm({ ...form, appointment: event.target.value })} required />
          </label>
          <label>
            Email
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </label>
          {auth.user?.role === "superadmin" && (
            <label>
              Agency
              <select value={form.agencyId} onChange={(event) => setForm({ ...form, agencyId: event.target.value })}>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Temporary password
            <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          <button type="submit" className="primary">
            Create account
          </button>
        </form>
        <div>
          <h2>Agencies</h2>
          <ul className="plain">
            {agencies.map((agency) => (
              <li key={agency.id}>
                <strong>{agency.shortName}</strong> {agency.name}
              </li>
            ))}
          </ul>
          <h2>Accounts</h2>
          <ul className="plain">
            {users.map((user) => (
              <li key={user.id}>
                <div>
                  <strong>{user.displayName}</strong>
                  <small>
                    {user.agencyShort} · {ROLE_LABEL[user.role]} · {user.email}
                    {user.evaluation ? " · evaluation" : ""}
                    {!user.active ? " · inactive" : ""}
                  </small>
                </div>
                {user.id !== auth.user?.id && (
                  <button type="button" className="text-button" onClick={() => void toggle(user).catch((reason) => setError(reason.message))}>
                    {user.active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
