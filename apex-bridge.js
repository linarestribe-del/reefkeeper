// Reef Keeper v4.0.2 Apex Live Data Bridge
// Read-only bridge scaffold: accepts normalized Apex telemetry from a local bridge/manual paste,
// stores the latest snapshot locally, and makes it available to Reef Brain.
(function(){
  'use strict';

  const VERSION = '4.0.2';
  const SNAPSHOT_KEY = 'reef_apex_bridge_snapshot_v1';
  const HISTORY_KEY = 'reef_apex_bridge_history_v1';
  const MAX_HISTORY = 120;

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

  function normalizeOutlet(value){
    if (!value || typeof value !== 'object') return null;
    const name = String(value.name || value.output || value.id || value.title || '').trim();
    if (!name) return null;
    return {
      name,
      state: String(value.state || value.status || value.value || value.mode || 'unknown').trim(),
      raw: value
    };
  }

  function normalizeSnapshot(raw){
    const input = raw && typeof raw === 'object' ? raw : {};
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
      schemaVersion: 1,
      source: String(input.source || input.bridge || 'manual bridge payload').slice(0, 80),
      capturedAt: input.capturedAt || input.timestamp || input.createdAt || nowIso(),
      receivedAt: nowIso(),
      probes: { temp, ph, orp, salinity },
      outlets: outletList.slice(0, 80),
      alarms: Array.isArray(input.alarms) ? input.alarms.map(a => compact(typeof a === 'string' ? a : (a.name || a.message || JSON.stringify(a)), 140)).filter(Boolean).slice(0, 20) : [],
      raw: input
    };
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
    try { window.ReefKeeperTimeline?.refresh?.(); } catch(e) {}
    return normalized;
  }
  function clearSnapshot(){
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch(e) {}
    try { window.ReefKeeperBrain?.invalidate?.(); window.renderHomeIntelligence?.(); } catch(e) {}
    renderBridgePanel();
  }
  function latestSummary(){
    const s = getSnapshot();
    if (!s) return { label:'No bridge data', detail:'Import a bridge payload to start live-data testing.', age:'No data' };
    const parts = [];
    if (s.probes?.temp !== null && s.probes?.temp !== undefined) parts.push(`Temp ${s.probes.temp}°F`);
    if (s.probes?.ph !== null && s.probes?.ph !== undefined) parts.push(`pH ${s.probes.ph}`);
    if (s.probes?.orp !== null && s.probes?.orp !== undefined) parts.push(`ORP ${s.probes.orp}`);
    if (s.probes?.salinity !== null && s.probes?.salinity !== undefined) parts.push(`Sal ${s.probes.salinity}`);
    if (s.alarms?.length) parts.push(`${s.alarms.length} alarm${s.alarms.length === 1 ? '' : 's'}`);
    return { label:'Bridge data received', detail:parts.join(' · ') || 'Payload saved.', age:ageLabel(s.capturedAt || s.receivedAt) };
  }

  function samplePayload(){
    return {
      source:'sample-local-bridge',
      capturedAt: nowIso(),
      probes:{ temp:78.2, ph:8.31, orp:412, salinity:35.0 },
      outlets:[
        { name:'Return_Pump', state:'ON' },
        { name:'Heater_1', state:'AUTO/OFF' },
        { name:'Skimmer', state:'ON' }
      ],
      alarms:[]
    };
  }

  function renderBridgePanel(){
    const root = document.getElementById('apex-bridge-panel');
    if (!root) return;
    const summary = latestSummary();
    const snap = getSnapshot();
    const probes = snap?.probes || {};
    const probeHtml = snap ? `
      <div class="apex-bridge-probes">
        <span><strong>${escapeHtml(probes.temp ?? '—')}</strong><small>Temp</small></span>
        <span><strong>${escapeHtml(probes.ph ?? '—')}</strong><small>pH</small></span>
        <span><strong>${escapeHtml(probes.orp ?? '—')}</strong><small>ORP</small></span>
        <span><strong>${escapeHtml(probes.salinity ?? '—')}</strong><small>Salinity</small></span>
      </div>` : '';
    root.innerHTML = `
      <div class="apex-bridge-card">
        <div class="apex-bridge-head"><div><strong>Live Data Bridge</strong><span>${escapeHtml(summary.detail)}</span></div><em>${escapeHtml(summary.age)}</em></div>
        ${probeHtml}
        <label class="apex-field full"><span>Bridge JSON payload</span><textarea id="apex-bridge-payload" rows="7" placeholder='{"probes":{"temp":78.2,"ph":8.31,"orp":412},"outlets":[{"name":"Return","state":"ON"}]}'></textarea></label>
        <div class="apex-actions bridge-actions">
          <button class="long-term-btn" type="button" onclick="ReefKeeperApexBridge.importFromTextarea()">Import Bridge Payload</button>
          <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApexBridge.loadSample()">Load Sample</button>
          <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApexBridge.clearSnapshot()">Clear</button>
        </div>
        <div class="apex-note">v4.0.2 stores read-only Apex telemetry locally and feeds it to Reef Brain. This is the bridge schema/testing step; automated background sync will require a local bridge service later.</div>
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
    if (!text) { try { showToast('Add bridge JSON first'); } catch(e) {} return null; }
    try {
      const parsed = JSON.parse(text);
      const saved = saveSnapshot(parsed);
      renderBridgePanel();
      try { showToast('✅ Apex bridge payload imported'); } catch(e) {}
      return saved;
    } catch(error) {
      try { showToast('⚠️ Bridge JSON is not valid'); } catch(e) {}
      return null;
    }
  }

  function loadSample(){
    const input = document.getElementById('apex-bridge-payload');
    if (input) input.value = JSON.stringify(samplePayload(), null, 2);
  }

  function getContextLines(){
    const s = getSnapshot();
    if (!s) return ['Apex bridge: no live telemetry imported yet.'];
    const p = s.probes || {};
    const lines = [`Apex bridge latest: ${ageLabel(s.capturedAt || s.receivedAt)} from ${s.source}.`];
    if (p.temp !== null && p.temp !== undefined) lines.push(`Apex temp: ${p.temp}°F.`);
    if (p.ph !== null && p.ph !== undefined) lines.push(`Apex pH: ${p.ph}.`);
    if (p.orp !== null && p.orp !== undefined) lines.push(`Apex ORP: ${p.orp}.`);
    if (p.salinity !== null && p.salinity !== undefined) lines.push(`Apex salinity/conductivity: ${p.salinity}.`);
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
  }

  window.ReefKeeperApexBridge = { version:VERSION, normalizeSnapshot, saveSnapshot, getSnapshot, getHistory, clearSnapshot, latestSummary, renderBridgePanel, importFromTextarea, loadSample, getContextLines, install };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 80));
  else setTimeout(install, 80);
})();
