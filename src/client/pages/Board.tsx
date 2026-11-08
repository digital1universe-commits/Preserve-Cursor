import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type IncidentSummary, type SessionUser } from "../api";
import { useAuth } from "../auth";
import { CLASS_LABEL, formatWhen, KIND_LABEL, STATUS_LABEL } from "../format";
import { kvGet, kvSet } from "../offline";

const EMPTY = {
  title: "",
  kind: "cordon",
  classification: "training",
  summary: "",
  locationLabel: "",
  lat: "",
  lng: "",
  memberIds: [] as string[],
};

export function Board() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [directory, setDirectory] = useState<{ id: string; displayName: string; appointment: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      if (auth.online) {
        const data = await api<{ incidents: IncidentSummary[] }>("/api/incidents");
        setIncidents(data.incidents);
        await kvSet("incidents", data.incidents);
      } else {
        setIncidents((await kvGet<IncidentSummary[]>("incidents")) ?? []);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The incident list could not be opened.");
    }
  }

  useEffect(() => {
    void load();
    if (!auth.online || !auth.user) return;
    api<{ users: { id: string; displayName: string; appointment: string; agencyId: string }[] }>("/api/directory")
      .then((data) => setDirectory(data.users.filter((user) => user.agencyId === auth.user?.agencyId)))
      .catch(() => setDirectory([]));
    // The directory is only for people who can manage accounts. Commanders create incidents without it if the call is refused.
  }, [auth.online, auth.user]);

  const canCreate = auth.user && !["field_officer", "observer"].includes(auth.user.role);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string }>("/api/incidents", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          lat: Number(form.lat || auth.user?.homeLat),
          lng: Number(form.lng || auth.user?.homeLng),
        }),
      });
      navigate(`/incidents/${created.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The incident was not opened.");
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Incident board</p>
          <h1>Current work</h1>
        </div>
        {canCreate && auth.online && (
          <button type="button" className="primary" onClick={() => setOpen(true)}>
            New incident
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {!auth.online && <p className="hint">Showing incidents already stored on this device.</p>}
      <div className="incident-list">
        {incidents.map((incident) => (
          <button key={incident.id} type="button" className="incident-row" onClick={() => navigate(`/incidents/${incident.id}`)}>
            <span className={`class-pip ${incident.classification}`} />
            <span>
              <strong>{incident.title}</strong>
              <small>
                {incident.reference} · {incident.agencyShort} · {KIND_LABEL[incident.kind]}
              </small>
            </span>
            <span className="meta">
              <em className={`status ${incident.status}`}>{STATUS_LABEL[incident.status]}</em>
              <small>{CLASS_LABEL[incident.classification]}</small>
            </span>
            <span className="meta when">{formatWhen(incident.updatedAt)}</span>
          </button>
        ))}
        {!incidents.length && <p className="empty">No incidents are visible to this account.</p>}
      </div>
      {open && auth.user && (
        <div className="modal-root" role="presentation" onMouseDown={() => setOpen(false)}>
          <form
            className="modal"
            role="dialog"
            aria-labelledby="new-incident"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={create}
          >
            <p className="eyebrow">New incident</p>
            <h2 id="new-incident">Open a record</h2>
            <p className="hint">Keep a person’s name out of the title. Put the operational detail in the summary. Both are encrypted in the record.</p>
            <label>
              Title
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </label>
            <label>
              Kind
              <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                {optionsFor(auth.user).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Classification
              <select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value })}>
                {Object.entries(CLASS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Summary
              <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} rows={4} />
            </label>
            <label>
              Location label
              <input value={form.locationLabel} onChange={(event) => setForm({ ...form, locationLabel: event.target.value })} />
            </label>
            <div className="split">
              <label>
                Latitude
                <input value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} placeholder={String(auth.user.homeLat)} />
              </label>
              <label>
                Longitude
                <input value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} placeholder={String(auth.user.homeLng)} />
              </label>
            </div>
            {directory.length > 0 && (
              <fieldset>
                <legend>Add from {auth.user.agencyShort}</legend>
                {directory
                  .filter((person) => person.id !== auth.user?.id)
                  .map((person) => (
                    <label key={person.id} className="check">
                      <input
                        type="checkbox"
                        checked={form.memberIds.includes(person.id)}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            memberIds: event.target.checked
                              ? [...form.memberIds, person.id]
                              : form.memberIds.filter((id) => id !== person.id),
                          })
                        }
                      />
                      <span>
                        {person.displayName}
                        <small>{person.appointment}</small>
                      </span>
                    </label>
                  ))}
              </fieldset>
            )}
            <div className="row-actions">
              <button type="button" className="text-button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Opening" : "Open incident"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function optionsFor(user: SessionUser) {
  if (user.role === "search_coordinator") return ["land_sar", "marine_sar"];
  return ["cordon", "containment", "land_sar", "marine_sar"];
}
