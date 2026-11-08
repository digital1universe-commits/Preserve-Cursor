import { useEffect, useState } from "react";
import { api } from "../api";

type Posture = {
  externalModelConfigured: boolean;
  caseDataLeavesHost: boolean;
  egressAllowlist: string[];
  encryption: string;
  passwordHashing: string;
  sessionHours: number;
  selfRegistration: boolean;
  audit: boolean;
  evaluationInstall: boolean;
  mapNote: string;
  tileUrl: string;
};

export function Security() {
  const [posture, setPosture] = useState<Posture | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Posture>("/api/security/posture")
      .then(setPosture)
      .catch((reason) => setError(reason.message));
  }, []);

  return (
    <div className="page narrow">
      <p className="eyebrow">Security posture</p>
      <h1>What stays inside</h1>
      <p>
        PRESERVE plans cordons, road seals, and search areas with models that run in this installation. A case is not written into a prompt, and there is no external AI account to send it to.
      </p>
      {error && <p className="form-error">{error}</p>}
      {posture && (
        <ul className="posture">
          <li>
            <strong>External model</strong>
            {posture.externalModelConfigured ? "Configured" : "None configured"}
          </li>
          <li>
            <strong>Case data leaving the host</strong>
            {posture.caseDataLeavesHost ? "Yes" : "No path for it"}
          </li>
          <li>
            <strong>Records</strong>
            {posture.encryption} at rest. Passwords are {posture.passwordHashing}.
          </li>
          <li>
            <strong>Sessions</strong>
            {posture.sessionHours} hours, httpOnly cookie. Self-registration is {posture.selfRegistration ? "open" : "closed"}.
          </li>
          <li>
            <strong>Audit</strong>
            {posture.audit ? "On. Views, plans, sharing, and sign-ins are recorded." : "Off"}
          </li>
          <li>
            <strong>Outbound allowlist</strong>
            {posture.egressAllowlist.join(", ")}. Requests can carry coordinates only, for roads, wind, current, and elevation.
          </li>
          <li>
            <strong>Map tiles</strong>
            {posture.mapNote} Current template: {posture.tileUrl}
          </li>
          <li>
            <strong>On the device</strong>
            The phone or laptop can run a plan already in memory when the link is down. Plans wait here and sync back to the incident record. Install the app from the browser to keep the shell offline.
          </li>
          <li>
            <strong>Evaluation build</strong>
            {posture.evaluationInstall
              ? "Published evaluation accounts are still active. Remove them before operational use."
              : "No evaluation accounts are active."}
          </li>
        </ul>
      )}
      <h2>What the models will not do</h2>
      <p>They do not describe an approach, a field of fire, or how to deploy a closure. A firearm report only pushes the cordon back and says to use cover. The commander remains responsible for every post and every search asset.</p>
    </div>
  );
}
