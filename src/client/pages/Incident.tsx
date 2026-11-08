import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CATEGORY_OPTIONS, suggestCategory, type SubjectCategory } from "../../engine/land.js";
import { VESSEL_OPTIONS, type VesselKind } from "../../engine/marine.js";
import type { LatLng } from "../../engine/geo.js";
import { ApiError, api, type IncidentDetail, type PlanRecord } from "../api";
import { useAuth } from "../auth";
import { CLASS_LABEL, coord, formatKm, formatNm, formatWhen, KIND_LABEL, STATUS_LABEL } from "../format";
import { runOnDevice, type DeviceContext } from "../local";
import { OperationMap, type MapMarker } from "../map";
import { kvGet, kvSet, outboxAdd } from "../offline";

const MODULES = ["cordon", "containment", "land_sar", "marine_sar", "record"] as const;
const TRAINING_AREA: LatLng[] = [
  { lat: -36.8272, lng: 174.7925 },
  { lat: -36.8272, lng: 174.8015 },
  { lat: -36.8335, lng: 174.8015 },
  { lat: -36.8335, lng: 174.7925 },
];

type CordonForm = {
  subject: LatLng;
  structure: string;
  exits: string;
  risk: string;
  innerRadiusM: string;
  outerRadiusM: string;
};
type LandForm = {
  category: SubjectCategory;
  ageYears: string;
  mentalState: string;
  areaKnowledge: string;
  mobility: string;
  terrain: string;
  conditions: string;
  hoursMissing: string;
  lkp: LatLng;
  downslopeBearing: string;
  intendedBearing: string;
  features: { roads: boolean; water: boolean; coastline: boolean; trails: boolean };
};
type MarineForm = {
  lkp: LatLng;
  hoursMissing: string;
  vessel: VesselKind;
  lengthM: string;
  positionErrorNm: string;
  windSpeedKn: string;
  windFromDeg: string;
  currentSpeedKn: string;
  currentTowardDeg: string;
};

export function IncidentPage() {
  const { id = "" } = useParams();
  const auth = useAuth();
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState("");
  const [module, setModule] = useState<string>("cordon");
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [tiles, setTiles] = useState(true);
  const [tileUrl, setTileUrl] = useState("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  const [frame, setFrame] = useState(0);
  const [polygon, setPolygon] = useState<LatLng[]>([]);
  const [polygonClosed, setPolygonClosed] = useState(false);
  const [cordon, setCordon] = useState<CordonForm | null>(null);
  const [land, setLand] = useState<LandForm | null>(null);
  const [marine, setMarine] = useState<MarineForm | null>(null);
  const [context, setContext] = useState<DeviceContext>({});

  useEffect(() => {
    let stop = false;
    async function load() {
      setError("");
      try {
        const data = auth.online
          ? await api<IncidentDetail>(`/api/incidents/${id}`)
          : await kvGet<IncidentDetail>(`incident:${id}`);
        if (!data) throw new Error("This incident is not stored on this device. Open it once while the link is up.");
        if (stop) return;
        setDetail(data);
        if (auth.online) await kvSet(`incident:${id}`, data);
        setModule(data.incident.kind);
        const point = { lat: data.incident.lat, lng: data.incident.lng };
        setCordon({ subject: point, structure: "detached", exits: "4", risk: "unknown", innerRadiusM: "", outerRadiusM: "" });
        setLand({
          category: "general_adult",
          ageYears: "",
          mentalState: "unknown",
          areaKnowledge: "none",
          mobility: "average",
          terrain: "suburban",
          conditions: "clear",
          hoursMissing: "3",
          lkp: point,
          downslopeBearing: "",
          intendedBearing: "",
          features: { roads: true, water: false, coastline: false, trails: false },
        });
        setMarine({
          lkp: point,
          hoursMissing: "4",
          vessel: "cabin_cruiser",
          lengthM: "12",
          positionErrorNm: "0.25",
          windSpeedKn: "",
          windFromDeg: "",
          currentSpeedKn: "",
          currentTowardDeg: "",
        });
        const cached = await kvGet<DeviceContext>(`context:${id}`);
        if (cached) setContext(cached);
        const latest = data.plans.find((item) => item.module === data.incident.kind);
        if (latest) setPlan(latest);
        setFrame((value) => value + 1);
      } catch (reason) {
        if (!stop) setError(reason instanceof Error ? reason.message : "The incident could not be opened.");
      }
    }
    void load();
    if (auth.online) {
      api<{ tileUrl: string }>("/api/config")
        .then((config) => setTileUrl(config.tileUrl))
        .catch(() => undefined);
    }
    return () => {
      stop = true;
    };
  }, [id, auth.online]);

  const center = useMemo(() => {
    if (module === "containment" && polygon[0]) return polygon[0];
    if (module === "land_sar" && land) return land.lkp;
    if (module === "marine_sar" && marine) return marine.lkp;
    if (cordon) return cordon.subject;
    if (detail) return { lat: detail.incident.lat, lng: detail.incident.lng };
    return { lat: -36.83, lng: 174.8 };
  }, [module, polygon, land, marine, cordon, detail]);

  const graphics = useMemo(() => graphicsFor(module, plan, cordon, land, marine, polygon, polygonClosed), [
    module,
    plan,
    cordon,
    land,
    marine,
    polygon,
    polygonClosed,
  ]);

  function onMapClick(point: LatLng) {
    if (!detail?.can.plan[module]) return;
    if (module === "containment") {
      if (polygonClosed) return;
      setPolygon((current) => [...current, point]);
      return;
    }
    if (module === "cordon" && cordon) setCordon({ ...cordon, subject: point });
    if (module === "land_sar" && land) setLand({ ...land, lkp: point });
    if (module === "marine_sar" && marine) setMarine({ ...marine, lkp: point });
  }

  async function build() {
    if (!detail) return;
    setBusy(true);
    setError("");
    const input = inputFor(module, cordon, land, marine, polygon);
    const environment = marineEnvironment(marine);
    try {
      if (!input) throw new Error("Complete the plan inputs first.");
      if (auth.online) {
        const response = await api<{ plan: PlanRecord; context: DeviceContext }>(`/api/incidents/${id}/plans`, {
          method: "POST",
          body: JSON.stringify({ module, input, environment }),
        });
        setPlan(response.plan);
        setDetail({ ...detail, plans: [response.plan, ...detail.plans] });
        const next = { ...context, ...stripEmpty(response.context) };
        setContext(next);
        await kvSet(`context:${id}`, next);
        if (module === "marine_sar" && response.context.environment && marine) {
          const sample = response.context.environment;
          setMarine({
            ...marine,
            windSpeedKn: String(Math.round(sample.windSpeedKn * 10) / 10),
            windFromDeg: String(Math.round(sample.windFromDeg)),
            currentSpeedKn: String(Math.round((sample.currentSpeedKn ?? 0) * 100) / 100),
            currentTowardDeg: String(Math.round(sample.currentTowardDeg ?? 0)),
          });
        }
      } else {
        const output = runOnDevice(module, input, {
          ...context,
          environment: environment ?? context.environment,
        }) as Record<string, unknown>;
        const localPlan: PlanRecord = {
          id: `local-${Date.now()}`,
          module,
          version: 0,
          createdAt: new Date().toISOString(),
          createdByName: "This device",
          input,
          output,
          local: true,
        };
        setPlan(localPlan);
        await outboxAdd({
          id: localPlan.id,
          incidentId: id,
          module,
          input,
          environment: environment ?? context.environment,
          createdAt: localPlan.createdAt,
        });
        await auth.refreshOutbox();
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 0) {
        try {
          const output = runOnDevice(module, input!, { ...context, environment: environment ?? context.environment }) as Record<
            string,
            unknown
          >;
          setPlan({
            id: `local-${Date.now()}`,
            module,
            version: 0,
            createdAt: new Date().toISOString(),
            createdByName: "This device",
            input: input!,
            output,
            local: true,
          });
          setError("The link dropped. The plan was run on this device.");
        } catch (localError) {
          setError(localError instanceof Error ? localError.message : "The plan could not be run.");
        }
      } else {
        setError(reason instanceof Error ? reason.message : "The plan could not be run.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!detail || !cordon || !land || !marine) {
    return (
      <div className="page">
        <p>{error || "Opening the incident"}</p>
        <Link to="/">Back to incidents</Link>
      </div>
    );
  }

  const allowed = detail.can.plan[module];
  return (
    <div className="workspace">
      <div className="map-wrap">
        <div className="map-toolbar">
          <div>
            <p className="eyebrow">{detail.incident.reference}</p>
            <h1>{detail.incident.title}</h1>
          </div>
          <div className="map-toolbar-actions">
            <span className={`classmark ${detail.incident.classification}`}>{CLASS_LABEL[detail.incident.classification]}</span>
            <button type="button" className={tiles ? "text-button" : "text-button on"} onClick={() => setTiles((value) => !value)}>
              {tiles ? "Grid only" : "Show map"}
            </button>
          </div>
        </div>
        <OperationMap
          center={center}
          zoom={module === "marine_sar" ? 11 : module === "land_sar" ? 13 : 15}
          frame={frame}
          tiles={tiles && auth.link}
          tileUrl={tileUrl}
          attribution="© OpenStreetMap"
          markers={graphics.markers}
          circles={graphics.circles}
          polygons={graphics.polygons}
          lines={graphics.lines}
          heat={graphics.heat}
          onClick={onMapClick}
        />
        <p className="map-note">
          {tiles
            ? "Tiles show the ground only. Switch to grid if the area being viewed must not be requested."
            : "Grid only. No new map tiles are being requested."}
        </p>
      </div>
      <aside className="panel">
        <div className="tabs" role="tablist">
          {MODULES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={module === item}
              className={module === item ? "on" : ""}
              onClick={() => {
                setModule(item);
                const latest = detail.plans.find((entry) => entry.module === item);
                setPlan(latest ?? null);
                setFrame((value) => value + 1);
              }}
            >
              {item === "record" ? "Record" : KIND_LABEL[item]}
            </button>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        {module === "record" ? (
          <RecordPane detail={detail} onChange={setDetail} />
        ) : (
          <div className="plan-pane">
            <p className="model-line">On-device model · case text stays in this installation</p>
            {module === "cordon" && (
              <CordonFields
                form={cordon}
                setForm={setCordon}
                disabled={!allowed}
                onTraining={() => {
                  setCordon({ ...cordon, subject: { lat: -36.8297, lng: 174.7964 }, structure: "commercial", exits: "3", risk: "unknown" });
                  setFrame((value) => value + 1);
                }}
              />
            )}
            {module === "containment" && (
              <div className="stack">
                <p className="hint">
                  Click the corners of the area to seal. {polygon.length} corner{polygon.length === 1 ? "" : "s"}
                  {polygonClosed ? ", closed." : "."}
                </p>
                <div className="row-actions">
                  <button type="button" className="text-button" onClick={() => setPolygon((current) => current.slice(0, -1))} disabled={!polygon.length}>
                    Undo
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPolygon([]);
                      setPolygonClosed(false);
                    }}
                  >
                    Clear
                  </button>
                  <button type="button" className="text-button" onClick={() => setPolygonClosed(true)} disabled={polygon.length < 3}>
                    Close area
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPolygon(TRAINING_AREA);
                      setPolygonClosed(true);
                      setFrame((value) => value + 1);
                    }}
                  >
                    Training area
                  </button>
                </div>
              </div>
            )}
            {module === "land_sar" && <LandFields form={land} setForm={setLand} disabled={!allowed} />}
            {module === "marine_sar" && <MarineFields form={marine} setForm={setMarine} disabled={!allowed} />}
            {allowed && module !== "record" && (
              <button type="button" className="primary" disabled={busy || (module === "containment" && polygon.length < 3)} onClick={() => void build()}>
                {busy ? "Running the model…" : auth.online ? "Build plan" : "Build on this device"}
              </button>
            )}
            {!allowed && <p className="hint">Your role can read this module. It cannot run a new plan.</p>}
            {plan && plan.module === module && <Briefing plan={plan} />}
          </div>
        )}
      </aside>
    </div>
  );
}

function CordonFields({
  form,
  setForm,
  disabled,
  onTraining,
}: {
  form: CordonForm;
  setForm: (form: CordonForm) => void;
  disabled: boolean;
  onTraining: () => void;
}) {
  return (
    <div className="stack">
      <p className="hint">Click the map to move the subject. Posts are containment and observation, not an approach.</p>
      <div className="split">
        <label>
          Structure
          <select disabled={disabled} value={form.structure} onChange={(event) => setForm({ ...form, structure: event.target.value })}>
            <option value="detached">Detached building</option>
            <option value="commercial">Commercial</option>
            <option value="multi_storey">Multi-storey</option>
            <option value="open_ground">Open ground</option>
          </select>
        </label>
        <label>
          Exits
          <input disabled={disabled} value={form.exits} onChange={(event) => setForm({ ...form, exits: event.target.value })} />
        </label>
      </div>
      <label>
        Reported risk
        <select disabled={disabled} value={form.risk} onChange={(event) => setForm({ ...form, risk: event.target.value })}>
          <option value="unknown">Unknown</option>
          <option value="unarmed">Unarmed</option>
          <option value="edged">Edged weapon</option>
          <option value="firearm">Firearm</option>
        </select>
      </label>
      <div className="split">
        <label>
          Inner m
          <input disabled={disabled} value={form.innerRadiusM} placeholder="Model" onChange={(event) => setForm({ ...form, innerRadiusM: event.target.value })} />
        </label>
        <label>
          Outer m
          <input disabled={disabled} value={form.outerRadiusM} placeholder="Model" onChange={(event) => setForm({ ...form, outerRadiusM: event.target.value })} />
        </label>
      </div>
      <button type="button" className="text-button" onClick={onTraining}>
        Training subject
      </button>
    </div>
  );
}

function LandFields({ form, setForm, disabled }: { form: LandForm; setForm: (form: LandForm) => void; disabled: boolean }) {
  return (
    <div className="stack">
      <p className="hint">Click the map for the last known point. The ring uses time, mobility, terrain, and least-effort behaviour.</p>
      <label>
        Category
        <select disabled={disabled} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SubjectCategory })}>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="split">
        <label>
          Age
          <input disabled={disabled} value={form.ageYears} onChange={(event) => setForm({ ...form, ageYears: event.target.value })} />
        </label>
        <label>
          Hours missing
          <input disabled={disabled} value={form.hoursMissing} onChange={(event) => setForm({ ...form, hoursMissing: event.target.value })} />
        </label>
      </div>
      <button
        type="button"
        className="text-button"
        disabled={disabled}
        onClick={() =>
          setForm({
            ...form,
            category: suggestCategory(form.ageYears ? Number(form.ageYears) : undefined, form.mentalState as "unknown"),
          })
        }
      >
        Suggest category from age and state
      </button>
      <div className="split">
        <label>
          Mental state
          <select disabled={disabled} value={form.mentalState} onChange={(event) => setForm({ ...form, mentalState: event.target.value })}>
            {["unknown", "calm", "confused", "panicked", "despondent", "intoxicated", "evasive"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Knows the area
          <select disabled={disabled} value={form.areaKnowledge} onChange={(event) => setForm({ ...form, areaKnowledge: event.target.value })}>
            <option value="none">No</option>
            <option value="some">Some</option>
            <option value="local">Local</option>
          </select>
        </label>
      </div>
      <div className="split">
        <label>
          Mobility
          <select disabled={disabled} value={form.mobility} onChange={(event) => setForm({ ...form, mobility: event.target.value })}>
            {["impaired", "limited", "average", "fit"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Terrain
          <select disabled={disabled} value={form.terrain} onChange={(event) => setForm({ ...form, terrain: event.target.value })}>
            {["urban", "suburban", "rural", "steep", "dense", "coastal", "alpine"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Conditions
        <select disabled={disabled} value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })}>
          {["clear", "rain", "night", "storm", "heat", "cold", "snow"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div className="split">
        <label>
          Downslope °
          <input disabled={disabled} value={form.downslopeBearing} placeholder="From elevation" onChange={(event) => setForm({ ...form, downslopeBearing: event.target.value })} />
        </label>
        <label>
          Intended °
          <input disabled={disabled} value={form.intendedBearing} placeholder="Optional" onChange={(event) => setForm({ ...form, intendedBearing: event.target.value })} />
        </label>
      </div>
      <div className="checks">
        {(["roads", "trails", "water", "coastline"] as const).map((feature) => (
          <label key={feature} className="check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={form.features[feature]}
              onChange={(event) => setForm({ ...form, features: { ...form.features, [feature]: event.target.checked } })}
            />
            <span>{feature}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function MarineFields({ form, setForm, disabled }: { form: MarineForm; setForm: (form: MarineForm) => void; disabled: boolean }) {
  return (
    <div className="stack">
      <p className="hint">Click the map for the last known position. Leave wind blank on the link and the installation will sample it. Only the coordinates are requested.</p>
      <label>
        Vessel
        <select disabled={disabled} value={form.vessel} onChange={(event) => setForm({ ...form, vessel: event.target.value as VesselKind })}>
          {VESSEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="split">
        <label>
          Length m
          <input disabled={disabled} value={form.lengthM} onChange={(event) => setForm({ ...form, lengthM: event.target.value })} />
        </label>
        <label>
          Hours adrift
          <input disabled={disabled} value={form.hoursMissing} onChange={(event) => setForm({ ...form, hoursMissing: event.target.value })} />
        </label>
      </div>
      <label>
        Position error nm
        <input disabled={disabled} value={form.positionErrorNm} onChange={(event) => setForm({ ...form, positionErrorNm: event.target.value })} />
      </label>
      <div className="split">
        <label>
          Wind kn
          <input disabled={disabled} value={form.windSpeedKn} placeholder="Sample" onChange={(event) => setForm({ ...form, windSpeedKn: event.target.value })} />
        </label>
        <label>
          From °
          <input disabled={disabled} value={form.windFromDeg} placeholder="Sample" onChange={(event) => setForm({ ...form, windFromDeg: event.target.value })} />
        </label>
      </div>
      <div className="split">
        <label>
          Current kn
          <input disabled={disabled} value={form.currentSpeedKn} placeholder="Sample" onChange={(event) => setForm({ ...form, currentSpeedKn: event.target.value })} />
        </label>
        <label>
          Toward °
          <input disabled={disabled} value={form.currentTowardDeg} placeholder="Sample" onChange={(event) => setForm({ ...form, currentTowardDeg: event.target.value })} />
        </label>
      </div>
      <button
        type="button"
        className="text-button"
        onClick={() => setForm({ ...form, lkp: { lat: -36.75, lng: 174.9 }, vessel: "cabin_cruiser", lengthM: "12", hoursMissing: "6" })}
      >
        Training position
      </button>
    </div>
  );
}

function Briefing({ plan }: { plan: PlanRecord }) {
  const output = plan.output as {
    narrative?: string[];
    actions?: string[];
    posts?: { id: string; label: string; rationale: string }[];
    closures?: { id: string; roadName: string; seals: number; rationale: string }[];
    wedges?: { id: string; priority: number; fromBearing: number; toBearing: number }[];
    radius50M?: number;
    radius95M?: number;
    datum?: { lat: number; lng: number };
    areaNm2?: number;
    pattern?: string;
    sweepNm?: number;
    modifiers?: { label: string; effect: string }[];
    riskNote?: string;
    closureCount?: number;
    exitCorridors?: number;
    minimumGuaranteed?: boolean;
  };
  return (
    <article className="briefing">
      <p className="eyebrow">{plan.local ? "On this device" : `Version ${plan.version}`} · {formatWhen(plan.createdAt)}</p>
      <h2>Briefing</h2>
      <p className="disclaimer">Planning aid. It does not authorise a tactic, and it does not replace the incident commander.</p>
      {output.riskNote && <p>{output.riskNote}</p>}
      {output.closureCount != null && (
        <p className="stat">
          <strong>{output.closureCount}</strong> closure sites for <strong>{output.exitCorridors}</strong> exit corridors
          {output.minimumGuaranteed ? ", seal proved on the loaded roads." : "."}
        </p>
      )}
      {output.radius95M != null && (
        <p className="stat">
          50% ring {formatKm(output.radius50M || 0)} · 95% ring {formatKm(output.radius95M)}
        </p>
      )}
      {output.areaNm2 != null && output.datum && (
        <p className="stat">
          Datum {coord(output.datum.lat, output.datum.lng)} · {formatNm(Math.sqrt(output.areaNm2))} scale · {output.areaNm2.toFixed(1)} nm²
        </p>
      )}
      <ul>
        {(output.narrative ?? []).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {output.posts && (
        <ol>
          {output.posts.map((post) => (
            <li key={post.id}>
              <strong>{post.label}</strong> {post.rationale}
            </li>
          ))}
        </ol>
      )}
      {output.closures && (
        <ol>
          {output.closures.map((site) => (
            <li key={site.id}>
              <strong>
                {site.id} {site.roadName}
              </strong>{" "}
              {site.rationale}
            </li>
          ))}
        </ol>
      )}
      {output.wedges && (
        <ol>
          {output.wedges.slice(0, 4).map((wedge) => (
            <li key={wedge.id}>
              Priority {wedge.priority}: {wedge.fromBearing}°–{wedge.toBearing}°
            </li>
          ))}
        </ol>
      )}
      {output.modifiers && (
        <ul className="modifiers">
          {output.modifiers.map((item) => (
            <li key={item.label}>
              <strong>{item.label}.</strong> {item.effect}
            </li>
          ))}
        </ul>
      )}
      {output.actions && (
        <>
          <h3>First tasks</h3>
          <ol>
            {output.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </>
      )}
      <p className="hint">
        {plan.createdByName}
        {output.pattern ? ` · pattern ${output.pattern.replaceAll("_", " ")}` : ""}
        {output.sweepNm ? ` · sweep start ${output.sweepNm.toFixed(2)} nm` : ""}
      </p>
      <button type="button" className="text-button" onClick={() => window.print()}>
        Print briefing
      </button>
    </article>
  );
}

function RecordPane({ detail, onChange }: { detail: IncidentDetail; onChange: (detail: IncidentDetail) => void }) {
  const auth = useAuth();
  const [status, setStatus] = useState(detail.incident.status);
  const [summary, setSummary] = useState(detail.incident.summary || "");
  const [message, setMessage] = useState("");
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([]);
  const [grantAgency, setGrantAgency] = useState("");
  const [grantLevel, setGrantLevel] = useState("view");
  const [memberId, setMemberId] = useState("");

  useEffect(() => {
    if (!detail.can.update || !auth.online) return;
    api<{ agencies: { id: string; name: string }[] }>("/api/agencies")
      .then((data) => setAgencies(data.agencies.filter((agency) => agency.id !== detail.incident.agencyId)))
      .catch(() => undefined);
  }, [detail.can.update, detail.incident.agencyId, auth.online]);

  async function save() {
    const next = await api<IncidentDetail>(`/api/incidents/${detail.incident.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, summary }),
    });
    onChange(next);
    setMessage("Record updated.");
  }

  async function addMember() {
    if (!memberId) return;
    await api(`/api/incidents/${detail.incident.id}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: memberId }),
    });
    onChange(await api<IncidentDetail>(`/api/incidents/${detail.incident.id}`));
  }

  async function share() {
    if (!grantAgency) return;
    await api(`/api/incidents/${detail.incident.id}/grants`, {
      method: "POST",
      body: JSON.stringify({ agencyId: grantAgency, permission: grantLevel }),
    });
    onChange(await api<IncidentDetail>(`/api/incidents/${detail.incident.id}`));
  }

  return (
    <div className="stack">
      <p>
        {detail.incident.agencyName} · {KIND_LABEL[detail.incident.kind]} · {coord(detail.incident.lat, detail.incident.lng)}
      </p>
      <p>{detail.incident.locationLabel}</p>
      {detail.can.update && auth.online ? (
        <>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Summary
            <textarea value={summary} rows={5} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <button type="button" className="primary" onClick={() => void save().catch((reason) => setMessage(reason.message))}>
            Save record
          </button>
        </>
      ) : (
        <p>{detail.incident.summary}</p>
      )}
      <h3>On this incident</h3>
      <ul>
        {detail.members.map((member) => (
          <li key={member.userId}>
            {member.displayName} · {member.appointment} · {member.duty}
          </li>
        ))}
      </ul>
      {detail.can.update && auth.online && (
        <div className="row-actions">
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            <option value="">Add a person</option>
            {detail.directory.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </select>
          <button type="button" className="text-button" onClick={() => void addMember().catch((reason) => setMessage(reason.message))}>
            Add
          </button>
        </div>
      )}
      <h3>Shared with</h3>
      <ul>
        {detail.grants.map((grant) => (
          <li key={grant.id}>
            {grant.agencyName} · {grant.permission}
          </li>
        ))}
        {!detail.grants.length && <li>Not shared.</li>}
      </ul>
      {detail.can.update && auth.online && (
        <div className="row-actions">
          <select value={grantAgency} onChange={(event) => setGrantAgency(event.target.value)}>
            <option value="">Agency</option>
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </select>
          <select value={grantLevel} onChange={(event) => setGrantLevel(event.target.value)}>
            <option value="view">View</option>
            <option value="plan">Plan</option>
          </select>
          <button type="button" className="text-button" onClick={() => void share().catch((reason) => setMessage(reason.message))}>
            Share
          </button>
        </div>
      )}
      <h3>Plan history</h3>
      <ul>
        {detail.plans.map((item) => (
          <li key={item.id}>
            {KIND_LABEL[item.module] || item.module} v{item.version} · {formatWhen(item.createdAt)} · {item.createdByName}
          </li>
        ))}
        {!detail.plans.length && <li>No plans yet.</li>}
      </ul>
      {message && <p className="hint">{message}</p>}
    </div>
  );
}

function inputFor(
  module: string,
  cordon: CordonForm | null,
  land: LandForm | null,
  marine: MarineForm | null,
  polygon: LatLng[],
): Record<string, unknown> | null {
  if (module === "cordon" && cordon) {
    return {
      subject: cordon.subject,
      structure: cordon.structure,
      exits: Number(cordon.exits),
      risk: cordon.risk,
      innerRadiusM: cordon.innerRadiusM ? Number(cordon.innerRadiusM) : undefined,
      outerRadiusM: cordon.outerRadiusM ? Number(cordon.outerRadiusM) : undefined,
    };
  }
  if (module === "containment") return polygon.length >= 3 ? { polygon } : null;
  if (module === "land_sar" && land) {
    return {
      ...land,
      ageYears: land.ageYears ? Number(land.ageYears) : undefined,
      hoursMissing: Number(land.hoursMissing),
      downslopeBearing: land.downslopeBearing ? Number(land.downslopeBearing) : undefined,
      intendedBearing: land.intendedBearing ? Number(land.intendedBearing) : undefined,
    };
  }
  if (module === "marine_sar" && marine) {
    return {
      lkp: marine.lkp,
      hoursMissing: Number(marine.hoursMissing),
      vessel: marine.vessel,
      lengthM: marine.lengthM ? Number(marine.lengthM) : undefined,
      positionErrorNm: marine.positionErrorNm ? Number(marine.positionErrorNm) : undefined,
    };
  }
  return null;
}

function marineEnvironment(form: MarineForm | null) {
  if (!form || form.windSpeedKn === "" || form.windFromDeg === "") return undefined;
  return {
    windSpeedKn: Number(form.windSpeedKn),
    windFromDeg: Number(form.windFromDeg),
    currentSpeedKn: form.currentSpeedKn === "" ? 0 : Number(form.currentSpeedKn),
    currentTowardDeg: form.currentTowardDeg === "" ? 0 : Number(form.currentTowardDeg),
    source: "manual" as const,
  };
}

function stripEmpty(context: DeviceContext): DeviceContext {
  return {
    ways: context.ways?.length ? context.ways : undefined,
    elevation: context.elevation?.length ? context.elevation : undefined,
    environment: context.environment,
  };
}

function graphicsFor(
  module: string,
  plan: PlanRecord | null,
  cordon: CordonForm | null,
  land: LandForm | null,
  marine: MarineForm | null,
  polygon: LatLng[],
  polygonClosed: boolean,
) {
  const markers: MapMarker[] = [];
  const circles: { id: string; center: LatLng; radiusM: number; tone: string }[] = [];
  const polygons: { id: string; points: LatLng[]; tone: string; fill: boolean }[] = [];
  const lines: { id: string; points: LatLng[]; tone: string }[] = [];
  let heat: { lat: number; lng: number; w: number }[] | undefined;
  const output = plan && plan.module === module ? plan.output : null;

  if (module === "cordon" && cordon) {
    markers.push({ id: "subject", ...cordon.subject, label: "SUBJ", tone: "subject", detail: "Subject" });
  }
  if (module === "land_sar" && land) markers.push({ id: "lkp", ...land.lkp, label: "LKP", tone: "subject", detail: "Last known point" });
  if (module === "marine_sar" && marine) markers.push({ id: "lkp", ...marine.lkp, label: "LKP", tone: "subject", detail: "Last known position" });
  if (module === "containment" && polygon.length) {
    polygons.push({ id: "area", points: polygon, tone: "area", fill: polygonClosed });
  }

  const cordonOut = output as { posts?: { id: string; kind: string; label: string; position: LatLng; rationale: string }[]; innerRing?: LatLng[]; outerRing?: LatLng[] } | null;
  if (cordonOut?.innerRing) polygons.push({ id: "inner", points: cordonOut.innerRing, tone: "inner", fill: false });
  if (cordonOut?.outerRing) polygons.push({ id: "outer", points: cordonOut.outerRing, tone: "outer", fill: false });
  for (const post of cordonOut?.posts ?? []) {
    markers.push({ id: post.id, ...post.position, label: post.id, tone: post.kind, detail: post.rationale });
  }

  const seal = output as { closures?: { id: string; position: LatLng; roadName: string; rationale: string }[]; exits?: { position: LatLng; roadName: string }[] } | null;
  for (const exit of seal?.exits ?? []) {
    markers.push({ id: `exit-${exit.position.lat}`, ...exit.position, label: "EX", tone: "outer", detail: exit.roadName });
  }
  for (const site of seal?.closures ?? []) {
    markers.push({ id: site.id, ...site.position, label: site.id, tone: "closure", detail: site.rationale });
  }

  const search = output as { radius50M?: number; radius75M?: number; radius95M?: number; cells?: { lat: number; lng: number; w: number }[] } | null;
  if (land && search?.radius95M) {
    circles.push({ id: "r50", center: land.lkp, radiusM: search.radius50M || 0, tone: "hot" });
    circles.push({ id: "r95", center: land.lkp, radiusM: search.radius95M, tone: "search" });
    heat = search.cells;
  }

  const sea = output as { datum?: LatLng; ellipse?: LatLng[]; fan?: LatLng[][] } | null;
  if (sea?.datum) markers.push({ id: "datum", ...sea.datum, label: "DATUM", tone: "datum", detail: "Search datum" });
  if (sea?.ellipse) polygons.push({ id: "ellipse", points: sea.ellipse, tone: "water", fill: true });
  sea?.fan?.forEach((line, index) => lines.push({ id: `fan-${index}`, points: line, tone: index === 1 ? "drift" : "water" }));

  return { markers, circles, polygons, lines, heat };
}
