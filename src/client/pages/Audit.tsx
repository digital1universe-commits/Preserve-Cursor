import { useEffect, useState } from "react";
import { api } from "../api";
import { formatWhen } from "../format";

type Entry = { id: number; at: string; action: string; summary: string };

export function Audit() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ entries: Entry[] }>("/api/audit")
      .then((data) => setEntries(data.entries))
      .catch((reason) => setError(reason.message));
  }, []);

  return (
    <div className="page">
      <p className="eyebrow">Audit</p>
      <h1>Who did what</h1>
      <p className="hint">The log records the action, not the case narrative. Sign-ins, views, plans, and sharing are kept.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="incident-list">
        {entries.map((entry) => (
          <div key={entry.id} className="incident-row static">
            <span>
              <strong>{entry.summary}</strong>
              <small>{entry.action}</small>
            </span>
            <span className="meta when">{formatWhen(entry.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
