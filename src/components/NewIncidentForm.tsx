import { useEffect, useState, type FormEvent } from 'react';
import { INCIDENT_TYPE_LABELS, type IncidentType, type SecurityLevel } from '../domain/types';
import { QLD } from '../geo/qld';
import { parseLatLngPair } from '../incidents/createTypes';
import { peekJobNumber, usePreserveStore } from '../store/preserveStore';

const DEFAULT_RESOURCES = `TCS, TCS-2
Dog Squad, DOG-1
General Duties, VKR-221
General Duties, VKR-118
General Duties, VKR-305
Supervisor, SUP-4`;

const DEFAULT_PO_WAYPOINTS = `${QLD.southBank.lat}, ${QLD.southBank.lng}
${QLD.brisbaneCbd.lat}, ${QLD.brisbaneCbd.lng}
${QLD.parliamentHouse.lat}, ${QLD.parliamentHouse.lng}
${QLD.fortitudeValley.lat}, ${QLD.fortitudeValley.lng}`;

function defaultLocation(type: IncidentType) {
  switch (type) {
    case 'cordon':
      return QLD.fortitudeValley;
    case 'land_sar':
      return QLD.westEnd;
    case 'marine_sar':
      return QLD.moretonBay;
    case 'public_order':
      return QLD.brisbaneCbd;
    case 'road_block':
      return QLD.kangarooPoint;
  }
}

export function NewIncidentForm() {
  const draftType = usePreserveStore((s) => s.draftType);
  const closeNewIncidentForm = usePreserveStore((s) => s.closeNewIncidentForm);
  const createIncident = usePreserveStore((s) => s.createIncident);
  const joinIncident = usePreserveStore((s) => s.joinIncident);

  const [jobNumber, setJobNumber] = useState('');
  const [title, setTitle] = useState('');
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('protected');
  const [summary, setSummary] = useState('');
  const [locationText, setLocationText] = useState('');

  // Cordon
  const [cordonKind, setCordonKind] = useState<'break_and_enter' | 'siege' | 'generic'>('break_and_enter');
  const [resourcesText, setResourcesText] = useState(DEFAULT_RESOURCES);

  // Land SAR
  const [mpName, setMpName] = useState('Harold Mitchell');
  const [mpAge, setMpAge] = useState(78);
  const [mentalState, setMentalState] = useState('dementia / confused');
  const [areaKnowledge, setAreaKnowledge] = useState<'none' | 'limited' | 'familiar' | 'expert'>('limited');
  const [mobility, setMobility] = useState<'immobile' | 'limited' | 'normal' | 'high'>('limited');
  const [transportMode, setTransportMode] = useState<'foot' | 'bicycle' | 'vehicle' | 'unknown'>('foot');
  const [hoursAgo, setHoursAgo] = useState(3);
  const [description, setDescription] = useState('Elderly male, blue cardigan, grey trousers, no shoes.');

  // Marine
  const [vesselName, setVesselName] = useState('Coastal Runner');
  const [rego, setRego] = useState('QH-4821');
  const [vesselType, setVesselType] = useState('recreational powerboat');
  const [vesselSizeM, setVesselSizeM] = useState(5.5);
  const [pob, setPob] = useState(2);
  const [equipment, setEquipment] = useState('lifejackets, EPIRB');
  const [missingHours, setMissingHours] = useState(2.5);
  const [windDir, setWindDir] = useState(120);
  const [windKt, setWindKt] = useState(12);
  const [currentDir, setCurrentDir] = useState(90);
  const [currentKt, setCurrentKt] = useState(1.2);

  // Public order
  const [waypointsText, setWaypointsText] = useState(DEFAULT_PO_WAYPOINTS);

  // Road block
  const [vehicleDetails, setVehicleDetails] = useState('Silver Toyota Camry, QLD 123ABC');
  const [offenderInfo, setOffenderInfo] = useState('Male, mid-20s, last seen alone');
  const [stolenMinutesAgo, setStolenMinutesAgo] = useState(25);
  const [availableResources, setAvailableResources] = useState(6);
  const [juvenileSuspect, setJuvenileSuspect] = useState(false);

  useEffect(() => {
    if (!draftType) return;
    const loc = defaultLocation(draftType);
    setJobNumber(peekJobNumber());
    setTitle('');
    setSecurityLevel('protected');
    setSummary('');
    setLocationText(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
  }, [draftType]);

  if (!draftType) return null;

  const locFallback = defaultLocation(draftType);
  const locDisplay =
    locationText || `${locFallback.lat.toFixed(5)}, ${locFallback.lng.toFixed(5)}`;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const location = parseLatLngPair(locDisplay, locFallback);
    const created = createIncident({
      type: draftType,
      jobNumber,
      title: title || `New ${INCIDENT_TYPE_LABELS[draftType]}`,
      securityLevel,
      summary: summary || undefined,
      location,
      cordon:
        draftType === 'cordon'
          ? { kind: cordonKind, resourcesText }
          : undefined,
      landSar:
        draftType === 'land_sar'
          ? {
              lastKnown: location,
              name: mpName,
              age: mpAge,
              mentalState,
              areaKnowledge,
              mobility,
              transportMode,
              timeLastSightedIso: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
              description,
            }
          : undefined,
      marineSar:
        draftType === 'marine_sar'
          ? {
              lastKnown: location,
              vesselName,
              rego,
              vesselType,
              vesselSizeM,
              pob,
              emergencyEquipment: equipment.split(',').map((s) => s.trim()).filter(Boolean),
              missingSinceIso: new Date(Date.now() - missingHours * 3600_000).toISOString(),
              windDirDeg: windDir,
              windSpeedKt: windKt,
              currentDirDeg: currentDir,
              currentSpeedKt: currentKt,
            }
          : undefined,
      publicOrder: draftType === 'public_order' ? { waypointsText } : undefined,
      roadBlock:
        draftType === 'road_block'
          ? {
              vehicleDetails,
              offenderInfo,
              stolenMinutesAgo,
              availableResources,
              juvenileSuspect,
            }
          : undefined,
    });
    joinIncident(created.id);
  };

  return (
    <div className="modal-backdrop" data-testid="new-incident-form">
      <form className="modal-card" onSubmit={onSubmit}>
        <div className="modal-header">
          <h2>New {INCIDENT_TYPE_LABELS[draftType]}</h2>
          <button type="button" className="btn ghost" onClick={closeNewIncidentForm}>
            Cancel
          </button>
        </div>
        <p className="muted">
          Always creates a <strong>new</strong> CAD job — never opens an existing incident.
        </p>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="jobNumber">CAD / job number</label>
            <input
              id="jobNumber"
              data-testid="form-job-number"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="securityLevel">Security level</label>
            <select
              id="securityLevel"
              data-testid="form-security-level"
              value={securityLevel}
              onChange={(e) => setSecurityLevel(e.target.value as SecurityLevel)}
            >
              <option value="unclassified">unclassified</option>
              <option value="protected">protected</option>
              <option value="restricted">restricted</option>
              <option value="secret">secret</option>
            </select>
          </div>
          <div className="field field-span">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              data-testid="form-title"
              value={title}
              placeholder={`New ${INCIDENT_TYPE_LABELS[draftType]}`}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field field-span">
            <label htmlFor="location">Location (lat, lng)</label>
            <input
              id="location"
              data-testid="form-location"
              value={locationText}
              placeholder={locDisplay}
              onChange={(e) => setLocationText(e.target.value)}
            />
          </div>
          <div className="field field-span">
            <label htmlFor="summary">Summary</label>
            <textarea
              id="summary"
              data-testid="form-summary"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
        </div>

        {draftType === 'cordon' && (
          <div className="form-section">
            <div className="section-label">Cordon details</div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="cordonKind">Incident kind</label>
                <select
                  id="cordonKind"
                  data-testid="form-cordon-kind"
                  value={cordonKind}
                  onChange={(e) => setCordonKind(e.target.value as typeof cordonKind)}
                >
                  <option value="break_and_enter">Break and enter</option>
                  <option value="siege">Siege</option>
                  <option value="generic">Generic</option>
                </select>
              </div>
              <div className="field field-span">
                <label htmlFor="resources">Available resources (type, callsign — one per line)</label>
                <textarea
                  id="resources"
                  data-testid="form-cordon-resources"
                  rows={6}
                  value={resourcesText}
                  onChange={(e) => setResourcesText(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {draftType === 'land_sar' && (
          <div className="form-section">
            <div className="section-label">Missing person / Land SAR</div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="mpName">Name</label>
                <input id="mpName" data-testid="form-mp-name" value={mpName} onChange={(e) => setMpName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="mpAge">Age</label>
                <input
                  id="mpAge"
                  type="number"
                  data-testid="form-mp-age"
                  value={mpAge}
                  onChange={(e) => setMpAge(Number(e.target.value))}
                />
              </div>
              <div className="field field-span">
                <label htmlFor="mentalState">Mental state</label>
                <input id="mentalState" value={mentalState} onChange={(e) => setMentalState(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="areaKnowledge">Area knowledge</label>
                <select id="areaKnowledge" value={areaKnowledge} onChange={(e) => setAreaKnowledge(e.target.value as typeof areaKnowledge)}>
                  <option value="none">none</option>
                  <option value="limited">limited</option>
                  <option value="familiar">familiar</option>
                  <option value="expert">expert</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="mobility">Mobility</label>
                <select id="mobility" value={mobility} onChange={(e) => setMobility(e.target.value as typeof mobility)}>
                  <option value="immobile">immobile</option>
                  <option value="limited">limited</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="transportMode">Transport</label>
                <select id="transportMode" value={transportMode} onChange={(e) => setTransportMode(e.target.value as typeof transportMode)}>
                  <option value="foot">foot</option>
                  <option value="bicycle">bicycle</option>
                  <option value="vehicle">vehicle</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="hoursAgo">Hours since last sighted</label>
                <input id="hoursAgo" type="number" step="0.1" value={hoursAgo} onChange={(e) => setHoursAgo(Number(e.target.value))} />
              </div>
              <div className="field field-span">
                <label htmlFor="description">Description</label>
                <textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {draftType === 'marine_sar' && (
          <div className="form-section">
            <div className="section-label">Vessel / Marine SAR</div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="vesselName">Vessel name</label>
                <input id="vesselName" data-testid="form-vessel-name" value={vesselName} onChange={(e) => setVesselName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rego">Rego</label>
                <input id="rego" value={rego} onChange={(e) => setRego(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="vesselType">Vessel type</label>
                <input id="vesselType" value={vesselType} onChange={(e) => setVesselType(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="vesselSizeM">Size (m)</label>
                <input id="vesselSizeM" type="number" step="0.1" value={vesselSizeM} onChange={(e) => setVesselSizeM(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="pob">POB</label>
                <input id="pob" type="number" value={pob} onChange={(e) => setPob(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="missingHours">Hours missing</label>
                <input id="missingHours" type="number" step="0.1" value={missingHours} onChange={(e) => setMissingHours(Number(e.target.value))} />
              </div>
              <div className="field field-span">
                <label htmlFor="equipment">Emergency equipment (comma-separated)</label>
                <input id="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="windDir">Wind dir°</label>
                <input id="windDir" type="number" value={windDir} onChange={(e) => setWindDir(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="windKt">Wind kt</label>
                <input id="windKt" type="number" value={windKt} onChange={(e) => setWindKt(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="currentDir">Current dir°</label>
                <input id="currentDir" type="number" value={currentDir} onChange={(e) => setCurrentDir(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="currentKt">Current kt</label>
                <input id="currentKt" type="number" step="0.1" value={currentKt} onChange={(e) => setCurrentKt(Number(e.target.value))} />
              </div>
            </div>
          </div>
        )}

        {draftType === 'public_order' && (
          <div className="form-section">
            <div className="section-label">Protest / public order route</div>
            <div className="field">
              <label htmlFor="waypoints">Waypoints (lat, lng — one per line). Snaps to Brisbane streets & bridges.</label>
              <textarea
                id="waypoints"
                data-testid="form-po-waypoints"
                rows={5}
                value={waypointsText}
                onChange={(e) => setWaypointsText(e.target.value)}
              />
            </div>
          </div>
        )}

        {draftType === 'road_block' && (
          <div className="form-section">
            <div className="section-label">Stolen vehicle / road block</div>
            <div className="form-grid">
              <div className="field field-span">
                <label htmlFor="vehicleDetails">Vehicle details</label>
                <input id="vehicleDetails" data-testid="form-vehicle" value={vehicleDetails} onChange={(e) => setVehicleDetails(e.target.value)} />
              </div>
              <div className="field field-span">
                <label htmlFor="offenderInfo">Offender info</label>
                <input id="offenderInfo" value={offenderInfo} onChange={(e) => setOffenderInfo(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="stolenMinutesAgo">Minutes since stolen</label>
                <input id="stolenMinutesAgo" type="number" value={stolenMinutesAgo} onChange={(e) => setStolenMinutesAgo(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="availableResources">Spike resources</label>
                <input id="availableResources" type="number" value={availableResources} onChange={(e) => setAvailableResources(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={juvenileSuspect}
                    onChange={(e) => setJuvenileSuspect(e.target.checked)}
                  />{' '}
                  Juvenile suspect
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={closeNewIncidentForm}>
            Cancel
          </button>
          <button type="submit" className="btn primary" data-testid="form-submit-create">
            Create new job
          </button>
        </div>
      </form>
    </div>
  );
}
