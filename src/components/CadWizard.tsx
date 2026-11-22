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
Supervisor, SUP-4
SERT, SERT-3`;

const DEFAULT_PO = `${QLD.southBank.lat}, ${QLD.southBank.lng}
${QLD.brisbaneCbd.lat}, ${QLD.brisbaneCbd.lng}
${QLD.parliamentHouse.lat}, ${QLD.parliamentHouse.lng}
${QLD.fortitudeValley.lat}, ${QLD.fortitudeValley.lng}`;

function defaultLoc(type: IncidentType) {
  switch (type) {
    case 'cordon': return QLD.fortitudeValley;
    case 'land_sar': return QLD.westEnd;
    case 'marine_sar': return QLD.moretonBay;
    case 'public_order': return QLD.brisbaneCbd;
    case 'road_block': return QLD.kangarooPoint;
  }
}

const STEPS = ['Job meta', 'Type details', 'Review'] as const;

export function CadWizard() {
  const draftType = usePreserveStore((s) => s.draftType);
  const closeNewIncidentForm = usePreserveStore((s) => s.closeNewIncidentForm);
  const createIncident = usePreserveStore((s) => s.createIncident);
  const joinIncident = usePreserveStore((s) => s.joinIncident);

  const [step, setStep] = useState(0);
  const [jobNumber, setJobNumber] = useState('');
  const [title, setTitle] = useState('');
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('protected');
  const [summary, setSummary] = useState('');
  const [locationText, setLocationText] = useState('');
  const [accessNotes, setAccessNotes] = useState('Comms + scene commander + assigned units');

  const [cordonKind, setCordonKind] = useState<'break_and_enter' | 'siege' | 'generic'>('siege');
  const [resourcesText, setResourcesText] = useState(DEFAULT_RESOURCES);

  const [mpName, setMpName] = useState('');
  const [mpAge, setMpAge] = useState(40);
  const [mentalState, setMentalState] = useState('');
  const [areaKnowledge, setAreaKnowledge] = useState<'none' | 'limited' | 'familiar' | 'expert'>('limited');
  const [mobility, setMobility] = useState<'immobile' | 'limited' | 'normal' | 'high'>('normal');
  const [transportMode, setTransportMode] = useState<'foot' | 'bicycle' | 'vehicle' | 'unknown'>('foot');
  const [hoursAgo, setHoursAgo] = useState(2);
  const [description, setDescription] = useState('');
  const [poi, setPoi] = useState('');

  const [vesselName, setVesselName] = useState('');
  const [rego, setRego] = useState('');
  const [vesselType, setVesselType] = useState('recreational powerboat');
  const [vesselSizeM, setVesselSizeM] = useState(5.5);
  const [pob, setPob] = useState(2);
  const [equipment, setEquipment] = useState('lifejackets, EPIRB, flares');
  const [missingHours, setMissingHours] = useState(2);
  const [windDir, setWindDir] = useState(120);
  const [windKt, setWindKt] = useState(12);
  const [currentDir, setCurrentDir] = useState(90);
  const [currentKt, setCurrentKt] = useState(1.2);
  const [poiMarine, setPoiMarine] = useState('Moreton Bay');

  const [waypointsText, setWaypointsText] = useState(DEFAULT_PO);
  const [eventName, setEventName] = useState('');

  const [vehicleDetails, setVehicleDetails] = useState('');
  const [offenderInfo, setOffenderInfo] = useState('');
  const [stolenMinutesAgo, setStolenMinutesAgo] = useState(20);
  const [availableResources, setAvailableResources] = useState(6);
  const [juvenileSuspect, setJuvenileSuspect] = useState(false);

  useEffect(() => {
    if (!draftType) return;
    const loc = defaultLoc(draftType);
    setStep(0);
    setJobNumber(peekJobNumber());
    setTitle('');
    setSecurityLevel('protected');
    setSummary('');
    setLocationText(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
    setAccessNotes('Comms + scene commander + assigned units');
    if (draftType === 'land_sar') {
      setMpName('Harold Mitchell');
      setMpAge(78);
      setMentalState('dementia / confused');
      setDescription('Elderly male, blue cardigan, grey trousers, no shoes.');
      setPoi('West End residential care');
      setMobility('limited');
      setHoursAgo(3);
    }
    if (draftType === 'marine_sar') {
      setVesselName('Coastal Runner');
      setRego('QH-4821');
      setPoiMarine('Moreton Bay — last AIS ping');
    }
    if (draftType === 'public_order') {
      setEventName('CBD march');
      setWaypointsText(DEFAULT_PO);
    }
    if (draftType === 'road_block') {
      setVehicleDetails('Silver Toyota Camry, QLD 123ABC');
      setOffenderInfo('Male, mid-20s, last seen alone');
    }
    if (draftType === 'cordon') {
      setCordonKind('siege');
      setResourcesText(DEFAULT_RESOURCES);
    }
  }, [draftType]);

  if (!draftType) return null;
  const locFallback = defaultLoc(draftType);

  const reviewText = [
    `TYPE: ${INCIDENT_TYPE_LABELS[draftType]}`,
    `CAD: ${jobNumber}`,
    `TITLE: ${title || `New ${INCIDENT_TYPE_LABELS[draftType]}`}`,
    `SECURITY: ${securityLevel}`,
    `ACCESS: ${accessNotes}`,
    `LOCATION: ${locationText || `${locFallback.lat}, ${locFallback.lng}`}`,
    `SUMMARY: ${summary || '(none)'}`,
    draftType === 'cordon' ? `CORDON KIND: ${cordonKind}\nRESOURCES:\n${resourcesText}` : '',
    draftType === 'land_sar' ? `MP: ${mpName}, age ${mpAge}\nPOI: ${poi}\nMENTAL: ${mentalState}\nMOBILITY: ${mobility} / ${transportMode} / knowledge ${areaKnowledge}\nLAST SIGHTED: ${hoursAgo}h ago\nDESC: ${description}` : '',
    draftType === 'marine_sar' ? `VESSEL: ${vesselName} (${rego}) ${vesselType} ${vesselSizeM}m POB ${pob}\nPOI: ${poiMarine}\nEQUIP: ${equipment}\nMISSING: ${missingHours}h · wind ${windKt}kt@${windDir} · current ${currentKt}kt@${currentDir}` : '',
    draftType === 'public_order' ? `EVENT: ${eventName}\nWAYPOINTS:\n${waypointsText}` : '',
    draftType === 'road_block' ? `VEHICLE: ${vehicleDetails}\nOFFENDER: ${offenderInfo}\nSTOLEN: ${stolenMinutesAgo}m ago · resources ${availableResources}${juvenileSuspect ? ' · juvenile' : ''}` : '',
  ].filter(Boolean).join('\n\n');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    const location = parseLatLngPair(locationText || `${locFallback.lat}, ${locFallback.lng}`, locFallback);
    const created = createIncident({
      type: draftType,
      jobNumber,
      title: title || `New ${INCIDENT_TYPE_LABELS[draftType]}`,
      securityLevel,
      summary: summary || `${accessNotes}`,
      location,
      cordon: draftType === 'cordon' ? { kind: cordonKind, resourcesText } : undefined,
      landSar: draftType === 'land_sar' ? {
        lastKnown: location, name: mpName, age: mpAge, mentalState, areaKnowledge, mobility, transportMode,
        timeLastSightedIso: new Date(Date.now() - hoursAgo * 3600_000).toISOString(), description: `${poi ? `POI: ${poi}. ` : ''}${description}`,
      } : undefined,
      marineSar: draftType === 'marine_sar' ? {
        lastKnown: location, vesselName, rego, vesselType, vesselSizeM, pob,
        emergencyEquipment: equipment.split(',').map((s) => s.trim()).filter(Boolean),
        missingSinceIso: new Date(Date.now() - missingHours * 3600_000).toISOString(),
        windDirDeg: windDir, windSpeedKt: windKt, currentDirDeg: currentDir, currentSpeedKt: currentKt,
      } : undefined,
      publicOrder: draftType === 'public_order' ? { waypointsText } : undefined,
      roadBlock: draftType === 'road_block' ? { vehicleDetails, offenderInfo, stolenMinutesAgo, availableResources, juvenileSuspect } : undefined,
    });
    joinIncident(created.id);
  };

  return (
    <div className="wizard-backdrop" data-testid="new-incident-form">
      <form className="wizard" onSubmit={submit}>
        <div className="wizard-top">
          <div>
            <div className="eyebrow" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.14em', color: 'var(--cyan)', textTransform: 'uppercase' }}>
              CAD entry · always creates a new job
            </div>
            <h2>New {INCIDENT_TYPE_LABELS[draftType]}</h2>
          </div>
          <button type="button" className="btn ghost compact" onClick={closeNewIncidentForm}>Close</button>
        </div>

        <div className="steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`step-pill ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>{i + 1}. {label}</div>
          ))}
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <div className="form-grid">
              <div className="field"><label htmlFor="jobNumber">CAD / job number</label>
                <input id="jobNumber" data-testid="form-job-number" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} required /></div>
              <div className="field"><label htmlFor="securityLevel">Security / access level</label>
                <select id="securityLevel" data-testid="form-security-level" value={securityLevel} onChange={(e) => setSecurityLevel(e.target.value as SecurityLevel)}>
                  <option value="unclassified">unclassified</option>
                  <option value="protected">protected</option>
                  <option value="restricted">restricted</option>
                  <option value="secret">secret</option>
                </select></div>
              <div className="field span-2"><label htmlFor="title">Incident title</label>
                <input id="title" data-testid="form-title" value={title} placeholder={`New ${INCIDENT_TYPE_LABELS[draftType]}`} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="field span-2"><label htmlFor="location">Location / LKP (lat, lng)</label>
                <input id="location" data-testid="form-location" value={locationText} onChange={(e) => setLocationText(e.target.value)} /></div>
              <div className="field span-2"><label htmlFor="accessNotes">Who can access / view / edit</label>
                <input id="accessNotes" data-testid="form-access" value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} /></div>
              <div className="field span-2"><label htmlFor="summary">Occurrence summary</label>
                <textarea id="summary" data-testid="form-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
            </div>
          )}

          {step === 1 && draftType === 'cordon' && (
            <div className="form-grid">
              <div className="field"><label>Incident methodology</label>
                <select data-testid="form-cordon-kind" value={cordonKind} onChange={(e) => setCordonKind(e.target.value as typeof cordonKind)}>
                  <option value="break_and_enter">Break and enter</option>
                  <option value="siege">Siege</option>
                  <option value="generic">Generic</option>
                </select></div>
              <div className="field span-2"><label>Available resources (type, callsign — one per line)</label>
                <textarea data-testid="form-cordon-resources" rows={8} value={resourcesText} onChange={(e) => setResourcesText(e.target.value)} /></div>
            </div>
          )}

          {step === 1 && draftType === 'land_sar' && (
            <div className="form-grid">
              <div className="field"><label>Missing person name</label><input data-testid="form-mp-name" value={mpName} onChange={(e) => setMpName(e.target.value)} required /></div>
              <div className="field"><label>Age</label><input type="number" data-testid="form-mp-age" value={mpAge} onChange={(e) => setMpAge(Number(e.target.value))} /></div>
              <div className="field span-2"><label>Last known POI / address</label><input value={poi} onChange={(e) => setPoi(e.target.value)} /></div>
              <div className="field span-2"><label>Mental state</label><input value={mentalState} onChange={(e) => setMentalState(e.target.value)} /></div>
              <div className="field"><label>Area knowledge</label>
                <select value={areaKnowledge} onChange={(e) => setAreaKnowledge(e.target.value as typeof areaKnowledge)}>
                  <option value="none">none</option><option value="limited">limited</option><option value="familiar">familiar</option><option value="expert">expert</option>
                </select></div>
              <div className="field"><label>Mobility</label>
                <select value={mobility} onChange={(e) => setMobility(e.target.value as typeof mobility)}>
                  <option value="immobile">immobile</option><option value="limited">limited</option><option value="normal">normal</option><option value="high">high</option>
                </select></div>
              <div className="field"><label>Transport mode</label>
                <select value={transportMode} onChange={(e) => setTransportMode(e.target.value as typeof transportMode)}>
                  <option value="foot">foot</option><option value="bicycle">bicycle</option><option value="vehicle">vehicle</option><option value="unknown">unknown</option>
                </select></div>
              <div className="field"><label>Hours since last sighted</label><input type="number" step="0.1" value={hoursAgo} onChange={(e) => setHoursAgo(Number(e.target.value))} /></div>
              <div className="field span-2"><label>Full description</label><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
          )}

          {step === 1 && draftType === 'marine_sar' && (
            <div className="form-grid">
              <div className="field"><label>Vessel name</label><input data-testid="form-vessel-name" value={vesselName} onChange={(e) => setVesselName(e.target.value)} required /></div>
              <div className="field"><label>Rego</label><input value={rego} onChange={(e) => setRego(e.target.value)} /></div>
              <div className="field"><label>Vessel type</label><input value={vesselType} onChange={(e) => setVesselType(e.target.value)} /></div>
              <div className="field"><label>Size (m)</label><input type="number" step="0.1" value={vesselSizeM} onChange={(e) => setVesselSizeM(Number(e.target.value))} /></div>
              <div className="field"><label>POB</label><input type="number" value={pob} onChange={(e) => setPob(Number(e.target.value))} /></div>
              <div className="field"><label>Hours missing</label><input type="number" step="0.1" value={missingHours} onChange={(e) => setMissingHours(Number(e.target.value))} /></div>
              <div className="field span-2"><label>Last known POI (reef / beach / bay)</label><input value={poiMarine} onChange={(e) => setPoiMarine(e.target.value)} /></div>
              <div className="field span-2"><label>Emergency equipment</label><input value={equipment} onChange={(e) => setEquipment(e.target.value)} /></div>
              <div className="field"><label>Wind dir°</label><input type="number" value={windDir} onChange={(e) => setWindDir(Number(e.target.value))} /></div>
              <div className="field"><label>Wind kt</label><input type="number" value={windKt} onChange={(e) => setWindKt(Number(e.target.value))} /></div>
              <div className="field"><label>Current dir°</label><input type="number" value={currentDir} onChange={(e) => setCurrentDir(Number(e.target.value))} /></div>
              <div className="field"><label>Current kt</label><input type="number" step="0.1" value={currentKt} onChange={(e) => setCurrentKt(Number(e.target.value))} /></div>
            </div>
          )}

          {step === 1 && draftType === 'public_order' && (
            <div className="form-grid">
              <div className="field span-2"><label>Event / protest name</label><input value={eventName} onChange={(e) => setEventName(e.target.value)} /></div>
              <div className="field span-2"><label>Route waypoints (lat, lng — one per line). Snaps to streets & bridges.</label>
                <textarea data-testid="form-po-waypoints" rows={6} value={waypointsText} onChange={(e) => setWaypointsText(e.target.value)} /></div>
            </div>
          )}

          {step === 1 && draftType === 'road_block' && (
            <div className="form-grid">
              <div className="field span-2"><label>Vehicle details</label><input data-testid="form-vehicle" value={vehicleDetails} onChange={(e) => setVehicleDetails(e.target.value)} required /></div>
              <div className="field span-2"><label>Offender info</label><input value={offenderInfo} onChange={(e) => setOffenderInfo(e.target.value)} /></div>
              <div className="field"><label>Minutes since stolen</label><input type="number" value={stolenMinutesAgo} onChange={(e) => setStolenMinutesAgo(Number(e.target.value))} /></div>
              <div className="field"><label>Spike resources available</label><input type="number" value={availableResources} onChange={(e) => setAvailableResources(Number(e.target.value))} /></div>
              <div className="field span-2"><label><input type="checkbox" checked={juvenileSuspect} onChange={(e) => setJuvenileSuspect(e.target.checked)} /> Juvenile suspect psychology</label></div>
            </div>
          )}

          {step === 2 && <div className="review-box" data-testid="form-review">{reviewText}</div>}
        </div>

        <div className="wizard-foot">
          <button type="button" className="btn ghost" onClick={() => (step === 0 ? closeNewIncidentForm() : setStep(step - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <button type="submit" className="btn primary" data-testid={step === 2 ? 'form-submit-create' : 'form-next'}>
            {step === 2 ? 'Create new job' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
