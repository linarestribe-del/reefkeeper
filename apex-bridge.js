// Reef Keeper v4.1.0 Native Apex Driver
// Normalizes native Apex LAN /rest/status payloads plus manual bridge payloads into
// the shared Reef Keeper telemetry snapshot consumed by Reef Brain, Home, and Timeline.
(function(){
  'use strict';

  const VERSION = '4.1.1';
  const SNAPSHOT_KEY = 'reef_apex_bridge_snapshot_v1';
  const HISTORY_KEY = 'reef_apex_bridge_history_v1';
  const MAX_HISTORY = 180;
  const CLOUD_SETTINGS_KEY = 'reef_cloud_telemetry_settings_v1';

  function nowIso(){ return new Date().toISOString(); }
  function readJson(key, fallback){
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  }
  function writeJson(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  }
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function number(value){ const n = parseFloat(value); return Number.isFinite(n) ? n : null; }
  function compact(text, max = 160){ const clean = String(text || '').replace(/\s+/g,' ').trim(); return clean.length > max ? clean.slice(0, max - 1) + '…' : clean; }
  function dateMs(value){ const t = new Date(value || 0).getTime(); return Number.isFinite(t) ? t : 0; }
  function ageLabel(iso){
    const t = dateMs(iso);
    if (!t) return 'No data';
    const minutes = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  function apexEpochToIso(value){
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return nowIso();
    // Apex REST status uses epoch seconds.
    const ms = n > 9999999999 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
  }
  function normalizeStatusCode(value){
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  }
  function statusToHuman(code){
    const s = normalizeStatusCode(code).toUpperCase();
    if (s === 'AON') return 'AUTO/ON';
    if (s === 'AOF') return 'AUTO/OFF';
    if (s === 'ON') return 'ON';
    if (s === 'OFF') return 'OFF';
    return s || 'unknown';
  }
  function isOnLike(code){
    const s = normalizeStatusCode(code).toUpperCase();
    return s === 'ON' || s === 'AON';
  }
  function isOffLike(code){
    const s = normalizeStatusCode(code).toUpperCase();
    return s === 'OFF' || s === 'AOF';
  }

  function normalizeOutlet(value){
    if (!value || typeof value !== 'object') return null;
    const name = String(value.name || value.output || value.id || value.title || value.did || '').trim();
    if (!name) return null;
    const rawStatus = value.status ?? value.state ?? value.value ?? value.mode ?? 'unknown';
    const statusCode = normalizeStatusCode(rawStatus);
    return {
      name,
      state: statusToHuman(rawStatus),
      statusCode,
      isOn: isOnLike(rawStatus),
      isOff: isOffLike(rawStatus),
      type: String(value.type || '').trim(),
      did: value.did || value.id || value.ID || '',
      ok: Array.isArray(value.status) ? String(value.status[2] || '').toUpperCase() === 'OK' : true,
      raw: value
    };
  }

  function inputArrayToProbeMap(inputs){
    const out = {};
    (Array.isArray(inputs) ? inputs : []).forEach(item => {
      if (!item || typeof item !== 'object') return;
      const type = String(item.type || '').toLowerCase();
      const name = String(item.name || '').toLowerCase();
      const did = String(item.did || '').toLowerCase();
      const val = number(item.value);
      if (val === null) return;
      if (type === 'temp' || name === 'tmp' || name.includes('temp') || did.includes('temp')) out.temp = val;
      if (type === 'ph' || name === 'ph' || did.includes('ph')) out.ph = val;
      if (type === 'orp' || name === 'orp' || did.includes('orp')) out.orp = val;
      if (type === 'cond' || type === 'salinity' || name.includes('sal') || name.includes('cond')) out.salinity = val;
    });
    return out;
  }

  function buildApexAlarmList(raw){
    const alarms = [];
    const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];
    outputs.forEach(o => {
      if (!o || String(o.type || '').toLowerCase() !== 'alert') return;
      if (isOnLike(o.status)) alarms.push(`${o.name || 'Alert'} is ${statusToHuman(o.status)}`);
    });
    const leakInputs = Array.isArray(raw.inputs) ? raw.inputs.filter(i => /leak/i.test(String(i.name || ''))) : [];
    leakInputs.forEach(i => { if (Number(i.value) !== 0) alarms.push(`${i.name} detected water`); });
    return alarms.slice(0, 30);
  }

  function normalizeNativeApexStatus(raw){
    const system = raw.system || {};
    const nstat = raw.nstat || {};
    const probeMap = inputArrayToProbeMap(raw.inputs || []);
    const outlets = (Array.isArray(raw.outputs) ? raw.outputs : []).map(normalizeOutlet).filter(Boolean);
    const leakSensors = (Array.isArray(raw.inputs) ? raw.inputs : [])
      .filter(i => /leak/i.test(String(i.name || '')) || String(i.type || '').toLowerCase() === 'digital')
      .map(i => ({ name:String(i.name || i.did || 'Input'), value:Number(i.value), did:i.did || '', type:i.type || 'digital' }))
      .filter(i => /leak/i.test(i.name));
    return {
      schemaVersion: 2,
      driver:'apex-local-rest',
      source:'Apex LAN /rest/status',
      capturedAt: apexEpochToIso(system.date),
      receivedAt: nowIso(),
      probes: {
        temp: number(probeMap.temp),
        ph: number(probeMap.ph),
        orp: number(probeMap.orp),
        salinity: number(probeMap.salinity)
      },
      outlets: outlets.slice(0, 120),
      alarms: buildApexAlarmList(raw),
      system: {
        hostname: system.hostname || nstat.hostname || 'apex',
        software: system.software || '',
        hardware: system.hardware || '',
        serial: system.serial || '',
        type: system.type || '',
        ipaddr: nstat.ipaddr || '',
        fusionEnable: Boolean(nstat.fusionEnable),
        wifiQuality: nstat.quality ?? null,
        wifiStrength: nstat.strength ?? null,
        modules: Array.isArray(raw.modules) ? raw.modules.map(m => ({ abaddr:m.abaddr, hwtype:m.hwtype, swstat:m.swstat, present:m.present })).slice(0, 40) : []
      },
      leakSensors,
      raw
    };
  }

  function normalizeGenericBridgePayload(input){
    const probes = input.probes || input.inputs || input.status?.probes || {};
    const outputs = input.outlets || input.outputs || input.status?.outlets || {};
    const probeObj = Array.isArray(probes)
      ? probes.reduce((acc, p) => { const k = String(p.name || p.label || p.type || '').toLowerCase(); if (k) acc[k] = p.value ?? p.reading; return acc; }, {})
      : probes;
    const outletList = Array.isArray(outputs)
      ? outputs.map(normalizeOutlet).filter(Boolean)
      : Object.entries(outputs || {}).map(([name, val]) => normalizeOutlet(typeof val === 'object' ? { name, ...val } : { name, state: val })).filter(Boolean);

    const temp = number(probeObj.temp ?? probeObj.temperature ?? probeObj.tmp);
    const ph = number(probeObj.ph ?? probeObj.pH);
    const orp = number(probeObj.orp ?? probeObj.ORP);
    const salinity = number(probeObj.salinity ?? probeObj.sal ?? probeObj.conductivity);

    return {
      schemaVersion: 2,
      driver: String(input.driver || input.source || input.bridge || 'manual-bridge').slice(0, 80),
      source: String(input.source || input.bridge || 'manual bridge payload').slice(0, 80),
      capturedAt: input.capturedAt || input.timestamp || input.createdAt || nowIso(),
      receivedAt: nowIso(),
      probes: { temp, ph, orp, salinity },
      outlets: outletList.slice(0, 120),
      alarms: Array.isArray(input.alarms) ? input.alarms.map(a => compact(typeof a === 'string' ? a : (a.name || a.message || JSON.stringify(a)), 140)).filter(Boolean).slice(0, 30) : [],
      raw: input
    };
  }

  function normalizeSnapshot(raw){
    const input = raw && typeof raw === 'object' ? raw : {};
    if (input.system && (Array.isArray(input.inputs) || Array.isArray(input.outputs))) return normalizeNativeApexStatus(input);
    if (input.raw && input.raw.system && (Array.isArray(input.raw.inputs) || Array.isArray(input.raw.outputs))) return normalizeNativeApexStatus(input.raw);
    return normalizeGenericBridgePayload(input);
  }


  function cloudDefaults(){ return { enabled:false, endpoint:'/api/telemetry', readToken:'', updatedAt:null }; }
  function getCloudSettings(){ return { ...cloudDefaults(), ...readJson(CLOUD_SETTINGS_KEY, {}) }; }
  function saveCloudSettings(settings){
    const next = { ...cloudDefaults(), ...(settings || {}) };
    next.endpoint = String(next.endpoint || '/api/telemetry').trim() || '/api/telemetry';
    next.readToken = String(next.readToken || '').trim();
    next.enabled = Boolean(next.enabled);
    next.updatedAt = nowIso();
    writeJson(CLOUD_SETTINGS_KEY, next);
    return next;
  }
  function getCloudFormSettings(){
    return {
      enabled: document.getElementById('apex-cloud-enabled')?.checked || false,
      endpoint: document.getElementById('apex-cloud-endpoint')?.value || '/api/telemetry',
      readToken: document.getElementById('apex-cloud-read-token')?.value || ''
    };
  }
  function saveCloudFromForm(){
    const saved = saveCloudSettings(getCloudFormSettings());
    try { showToast('✅ Cloud telemetry settings saved'); } catch(e) {}
    renderBridgePanel();
    return saved;
  }
  async function fetchCloudTelemetry(options = {}){
    const settings = options.settings || getCloudSettings();
    const endpoint = String(settings.endpoint || '/api/telemetry').trim() || '/api/telemetry';
    const headers = { 'Accept':'application/json' };
    if (settings.readToken) headers.Authorization = `Bearer ${settings.readToken}`;
    try {
      const res = await fetch(endpoint, { method:'GET', headers, cache:'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Cloud telemetry returned HTTP ${res.status}`);
      const payload = data.snapshot || data.telemetry || data.payload || data;
      if (!payload || !payload.probes && !payload.inputs && !payload.system && !payload.outlets) throw new Error('No telemetry payload found in cloud response.');
      const saved = saveSnapshot(payload);
      try { showToast('✅ Cloud telemetry imported'); } catch(e) {}
      return saved;
    } catch(error) {
      try { showToast('⚠️ Cloud telemetry unavailable'); } catch(e) {}
      console.warn('Cloud telemetry fetch failed', error);
      return null;
    }
  }

  function getSnapshot(){ return readJson(SNAPSHOT_KEY, null); }
  function getHistory(){ return readJson(HISTORY_KEY, []); }
  function saveSnapshot(snapshot){
    const normalized = normalizeSnapshot(snapshot);
    writeJson(SNAPSHOT_KEY, normalized);
    const history = getHistory();
    history.unshift(normalized);
    writeJson(HISTORY_KEY, history.slice(0, MAX_HISTORY));
    try { window.ReefKeeperBrain?.invalidate?.(); window.ReefKeeperBrain?.refresh?.(); } catch(e) {}
    try { window.renderHomeIntelligence?.(); } catch(e) {}
    try { window.renderHomeTelemetry?.(); } catch(e) {}
    try { window.ReefKeeperTimeline?.refresh?.(); } catch(e) {}
    try { renderBridgePanel(); } catch(e) {}
    return normalized;
  }
  function clearSnapshot(){
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch(e) {}
    try { window.ReefKeeperBrain?.invalidate?.(); window.renderHomeIntelligence?.(); window.renderHomeTelemetry?.(); } catch(e) {}
    renderBridgePanel();
  }
  function latestSummary(){
    const s = getSnapshot();
    if (!s) return { label:'No Apex data', detail:'Fetch native Apex status or import a bridge payload.', age:'No data', probeCount:0, outletCount:0 };
    const parts = [];
    if (s.probes?.temp !== null && s.probes?.temp !== undefined) parts.push(`Temp ${s.probes.temp}°F`);
    if (s.probes?.ph !== null && s.probes?.ph !== undefined) parts.push(`pH ${s.probes.ph}`);
    if (s.probes?.orp !== null && s.probes?.orp !== undefined) parts.push(`ORP ${s.probes.orp}`);
    if (s.probes?.salinity !== null && s.probes?.salinity !== undefined) parts.push(`Sal ${s.probes.salinity}`);
    if (s.alarms?.length) parts.push(`${s.alarms.length} alarm${s.alarms.length === 1 ? '' : 's'}`);
    const probeCount = Object.values(s.probes || {}).filter(v => v !== null && v !== undefined).length;
    const outletCount = Array.isArray(s.outlets) ? s.outlets.length : 0;
    return { label:s.driver === 'apex-local-rest' ? 'Native Apex data received' : 'Bridge data received', detail:parts.join(' · ') || 'Payload saved.', age:ageLabel(s.capturedAt || s.receivedAt), probeCount, outletCount };
  }

  function samplePayload(){
    return {
      source:'sample-local-bridge',
      capturedAt: nowIso(),
      probes:{ temp:78.2, ph:8.31, orp:412, salinity:35.0 },
      outlets:[
        { name:'Return1', state:'AUTO/ON' },
        { name:'Return2', state:'AUTO/ON' },
        { name:'Skimmer', state:'AUTO/ON' },
        { name:'Heat1', state:'AUTO/OFF' }
      ],
      alarms:[]
    };
  }

  function apexStatusSample(){
    return {
      system:{ hostname:'apex', software:'5.12L_CA25', serial:'AC6L:8054', type:'AC6L', date:Math.floor(Date.now()/1000) },
      nstat:{ hostname:'apex', ipaddr:'192.168.4.50', fusionEnable:true, quality:93, strength:100 },
      outputs:[
        { status:['AON','','OK',''], name:'Return1', type:'outlet', ID:5, did:'2_1' },
        { status:['AON','','OK',''], name:'Return2', type:'outlet', ID:6, did:'2_2' },
        { status:['AON','','OK',''], name:'Skimmer', type:'outlet', ID:8, did:'2_4' },
        { status:['AOF','','OK',''], name:'Heat1', type:'outlet', ID:26, did:'5_4' }
      ],
      inputs:[
        { did:'base_Temp', type:'Temp', name:'Tmp', value:76.1 },
        { did:'base_pH', type:'pH', name:'pH', value:8.47 },
        { did:'4_2', type:'ORP', name:'ORP', value:326 },
        { did:'1_I1', name:'Leak1', type:'digital', value:0 }
      ],
      modules:[],
      feed:{ name:0, active:0 }
    };
  }


  function renderCloudConnectorCard(){
    const settings = getCloudSettings();
    return `<div class="apex-cloud-card">
      <div class="apex-bridge-head"><div><strong>Connector Push</strong><span>Use this when you want Reef Keeper to read Apex telemetry away from home.</span></div><em>${settings.enabled ? 'Enabled' : 'Optional'}</em></div>
      <label class="apex-switch-row"><span><strong>Use cloud telemetry endpoint</strong><small>Connector pushes data from home; Reef Keeper fetches it from this endpoint.</small></span><input id="apex-cloud-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}></label>
      <label class="apex-field full"><span>Cloud telemetry endpoint</span><input id="apex-cloud-endpoint" type="text" value="${escapeHtml(settings.endpoint)}" placeholder="/api/telemetry"></label>
      <label class="apex-field full"><span>Read token (optional)</span><input id="apex-cloud-read-token" type="password" value="${escapeHtml(settings.readToken)}" placeholder="Only needed if configured in Vercel"></label>
      <div class="apex-actions bridge-actions">
        <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApexBridge.saveCloudFromForm()">Save Cloud Settings</button>
        <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApexBridge.fetchCloudTelemetry()">Fetch Latest Cloud Telemetry</button>
      </div>
    </div>`;
  }

  function renderBridgePanel(){
    const root = document.getElementById('apex-bridge-panel');
    if (!root) return;
    const summary = latestSummary();
    const snap = getSnapshot();
    const probes = snap?.probes || {};
    const outletPreview = Array.isArray(snap?.outlets) ? snap.outlets.slice(0, 6) : [];
    const probeHtml = snap ? `
      <div class="apex-bridge-probes">
        <span><strong>${escapeHtml(probes.temp ?? '—')}</strong><small>Temp</small></span>
        <span><strong>${escapeHtml(probes.ph ?? '—')}</strong><small>pH</small></span>
        <span><strong>${escapeHtml(probes.orp ?? '—')}</strong><small>ORP</small></span>
        <span><strong>${escapeHtml(probes.salinity ?? '—')}</strong><small>Salinity</small></span>
      </div>
      <div class="apex-native-summary">
        <span>${escapeHtml(summary.probeCount)} probes</span><span>${escapeHtml(summary.outletCount)} outlets</span>${snap.system?.ipaddr ? `<span>${escapeHtml(snap.system.ipaddr)}</span>` : ''}
      </div>
      ${outletPreview.length ? `<div class="apex-outlet-preview">${outletPreview.map(o => `<span><b>${escapeHtml(o.name)}</b> ${escapeHtml(o.state)}</span>`).join('')}</div>` : ''}` : '';
    root.innerHTML = `
      <div class="apex-bridge-card">
        <div class="apex-bridge-head"><div><strong>Native Apex / Telemetry Test</strong><span>${escapeHtml(summary.detail)}</span></div><em>${escapeHtml(summary.age)}</em></div>
        ${probeHtml}
        <label class="apex-field full"><span>Paste Apex /rest/status JSON or bridge payload</span><textarea id="apex-bridge-payload" rows="7" placeholder='Paste the /rest/status response from your Apex or a bridge payload here.'></textarea></label>
        <div class="apex-actions bridge-actions">
          <button class="long-term-btn" type="button" onclick="ReefKeeperApexBridge.importFromTextarea()">Import Telemetry</button>
          <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApex?.fetchNativeStatus?.()">Fetch Local Apex</button>
          <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApexBridge.fetchCloudTelemetry()">Fetch Cloud</button>
          <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApexBridge.loadApexSample()">Load Apex Sample</button>
          <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApexBridge.clearSnapshot()">Clear</button>
        </div>
        ${renderCloudConnectorCard()}
        <div class="apex-note">v4.1.1 adds connector push support. A local connector can read Apex /rest/status at home and push normalized telemetry to Reef Keeper Cloud so the app can fetch it anywhere.</div>
      </div>`;
  }

  function injectPanel(){
    const settingsPanel = document.getElementById('apex-settings-panel');
    if (!settingsPanel || document.getElementById('apex-bridge-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'apex-bridge-panel';
    panel.className = 'apex-bridge-panel';
    settingsPanel.appendChild(panel);
    renderBridgePanel();
  }

  function importFromTextarea(){
    const input = document.getElementById('apex-bridge-payload');
    const text = String(input?.value || '').trim();
    if (!text) { try { showToast('Add Apex JSON first'); } catch(e) {} return null; }
    try {
      const parsed = JSON.parse(text);
      const saved = saveSnapshot(parsed);
      renderBridgePanel();
      try { showToast(saved.driver === 'apex-local-rest' ? '✅ Native Apex status imported' : '✅ Telemetry payload imported'); } catch(e) {}
      return saved;
    } catch(error) {
      try { showToast('⚠️ JSON is not valid'); } catch(e) {}
      return null;
    }
  }

  function loadSample(){
    const input = document.getElementById('apex-bridge-payload');
    if (input) input.value = JSON.stringify(samplePayload(), null, 2);
  }
  function loadApexSample(){
    const input = document.getElementById('apex-bridge-payload');
    if (input) input.value = JSON.stringify(apexStatusSample(), null, 2);
  }

  function getContextLines(){
    const s = getSnapshot();
    if (!s) return ['Apex telemetry: no live telemetry imported yet.'];
    const p = s.probes || {};
    const lines = [`Apex telemetry latest: ${ageLabel(s.capturedAt || s.receivedAt)} from ${s.source}.`];
    if (s.system?.hostname) lines.push(`Apex system: ${s.system.hostname}${s.system.ipaddr ? ` at ${s.system.ipaddr}` : ''}${s.system.software ? `, software ${s.system.software}` : ''}.`);
    if (p.temp !== null && p.temp !== undefined) lines.push(`Apex temp: ${p.temp}°F.`);
    if (p.ph !== null && p.ph !== undefined) lines.push(`Apex pH: ${p.ph}.`);
    if (p.orp !== null && p.orp !== undefined) lines.push(`Apex ORP: ${p.orp}.`);
    if (p.salinity !== null && p.salinity !== undefined) lines.push(`Apex salinity/conductivity: ${p.salinity}.`);
    if (Array.isArray(s.outlets) && s.outlets.length) lines.push(`Apex outlets: ${s.outlets.slice(0, 12).map(o => `${o.name} ${o.state}`).join('; ')}.`);
    if (s.alarms?.length) lines.push(`Apex alarms: ${s.alarms.join('; ')}.`);
    return lines;
  }

  function install(){
    const oldRender = window.ReefKeeperApex?.renderApexSettings;
    if (typeof oldRender === 'function' && !oldRender.__apexBridgeWrapped) {
      const wrapped = function(){
        const result = oldRender.apply(this, arguments);
        setTimeout(injectPanel, 20);
        return result;
      };
      wrapped.__apexBridgeWrapped = true;
      window.ReefKeeperApex.renderApexSettings = wrapped;
    }
    setTimeout(injectPanel, 80);
    setTimeout(() => { const c = getCloudSettings(); if (c.enabled) fetchCloudTelemetry({ settings:c }); }, 600);
  }

  window.ReefKeeperApexBridge = { version:VERSION, normalizeSnapshot, normalizeNativeApexStatus, saveSnapshot, getSnapshot, getHistory, clearSnapshot, latestSummary, renderBridgePanel, importFromTextarea, loadSample, loadApexSample, getContextLines, getCloudSettings, saveCloudSettings, saveCloudFromForm, fetchCloudTelemetry, install };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 80));
  else setTimeout(install, 80);
})();
