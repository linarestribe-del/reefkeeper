// Reef Keeper v4.0.1 Apex Integration Cleanup
// Phase 1b: support Fusion-aware setup and local bridge planning without implying Fusion can be tested from the browser.
(function(){
  'use strict';

  const VERSION = '4.0.1';
  const SETTINGS_KEY = 'reef_apex_settings_v1';
  const STATUS_KEY = 'reef_apex_last_status_v1';

  function nowIso(){ return new Date().toISOString(); }
  function readJson(key, fallback){
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  }
  function writeJson(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  }
  function cleanUrl(value){ return String(value || '').trim().replace(/\/+$/,''); }
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function settingsDefault(){
    return {
      enabled:false,
      mode:'fusion',
      fusionEmail:'',
      baseUrl:'',
      username:'',
      token:'',
      useToken:false,
      allowInsecure:true,
      updatedAt:null
    };
  }
  function normalizeMode(value){ return ['fusion','local'].includes(value) ? value : 'fusion'; }
  function getSettings(){ return { ...settingsDefault(), ...readJson(SETTINGS_KEY, {}) }; }
  function saveSettings(settings){
    const next = { ...settingsDefault(), ...(settings || {}) };
    next.mode = normalizeMode(next.mode);
    next.baseUrl = cleanUrl(next.baseUrl);
    next.fusionEmail = String(next.fusionEmail || '').trim();
    next.username = String(next.username || '').trim();
    next.token = String(next.token || '');
    next.enabled = Boolean(next.enabled);
    next.useToken = Boolean(next.useToken);
    next.allowInsecure = Boolean(next.allowInsecure);
    next.updatedAt = nowIso();
    writeJson(SETTINGS_KEY, next);
    return next;
  }
  function getLastStatus(){ return readJson(STATUS_KEY, null); }
  function saveLastStatus(status){ writeJson(STATUS_KEY, status); return status; }
  function statusLabel(status){
    if (!status) return { text:'Not configured', cls:'apex-status-idle' };
    if (status.ok) return { text:status.label || 'Ready', cls:'apex-status-good' };
    if (status.mode === 'fusion') return { text:status.label || 'Fusion noted', cls:'apex-status-idle' };
    return { text:status.label || 'Not connected', cls:'apex-status-bad' };
  }
  function endpointFor(settings){
    const base = cleanUrl(settings.baseUrl);
    if (!base) return '';
    return `${base}/cgi-bin/status.json`;
  }
  function getFormSettings(){
    return {
      enabled: document.getElementById('apex-enabled')?.checked || false,
      mode: document.querySelector('input[name="apex-mode"]:checked')?.value || 'fusion',
      fusionEmail: document.getElementById('apex-fusion-email')?.value || '',
      baseUrl: document.getElementById('apex-base-url')?.value || '',
      username: document.getElementById('apex-username')?.value || '',
      token: document.getElementById('apex-token')?.value || '',
      useToken: document.getElementById('apex-use-token')?.checked || false,
      allowInsecure: document.getElementById('apex-allow-insecure')?.checked || false
    };
  }
  function setModeVisibility(mode){
    const selected = normalizeMode(mode);
    document.querySelectorAll('[data-apex-mode-panel]').forEach(panel => {
      panel.classList.toggle('hidden', panel.getAttribute('data-apex-mode-panel') !== selected);
    });
    document.querySelectorAll('.apex-mode-card').forEach(card => {
      card.classList.toggle('active', card.dataset.apexMode === selected);
    });
  }
  function setStatusMessage(status){
    const box = document.getElementById('apex-status-box');
    if (!box) return;
    const label = statusLabel(status);
    box.className = `apex-status-box ${label.cls}`;
    const tested = status?.testedAt ? new Date(status.testedAt).toLocaleString() : 'Never';
    const detail = status?.message || 'Choose Fusion or Local Bridge mode, save the profile, then continue with the matching setup path.';
    const tips = Array.isArray(status?.tips) && status.tips.length
      ? `<ul class="apex-status-tips">${status.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
      : '';
    box.innerHTML = `<div class="apex-status-head"><strong>${escapeHtml(label.text)}</strong><span>${escapeHtml(tested)}</span></div><div class="apex-status-detail">${escapeHtml(detail)}</div>${tips}`;
  }
  function renderApexSettings(){
    const root = document.getElementById('apex-settings-panel');
    if (!root) return;
    const settings = getSettings();
    const status = getLastStatus();
    const mode = normalizeMode(settings.mode);
    root.innerHTML = `
      <div class="apex-mode-grid" role="radiogroup" aria-label="Apex integration mode">
        <label class="apex-mode-card" data-apex-mode="fusion"><input type="radio" name="apex-mode" value="fusion" ${mode === 'fusion' ? 'checked' : ''} onchange="ReefKeeperApex.changeMode(this.value)"><span>☁️</span><strong>Apex Fusion user</strong><small>Use Fusion for controller access. Reef Keeper will store planning context now; live sync will require a bridge unless Neptune offers an official API.</small></label>
        <label class="apex-mode-card" data-apex-mode="local"><input type="radio" name="apex-mode" value="local" ${mode === 'local' ? 'checked' : ''} onchange="ReefKeeperApex.changeMode(this.value)"><span>🏠</span><strong>Local / Bridge</strong><small>For a future Home Assistant, Mac, Raspberry Pi, or local Apex bridge that can send read-only telemetry to Reef Keeper.</small></label>
      </div>
      <label class="apex-switch-row"><span><strong>Enable Apex profile</strong><small>Keep Apex integration visible in Reef Brain context.</small></span><input id="apex-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}></label>

      <div data-apex-mode-panel="fusion">
        <div class="apex-info-card">
          <strong>Fusion mode</strong>
          <p>Reef Keeper will not ask for or test your Apex Fusion password. v4.0.1 records that you use Fusion and prepares the app for a read-only local bridge later.</p>
        </div>
        <div class="apex-form-grid single">
          <label class="apex-field"><span>Fusion account label / email (optional)</span><input id="apex-fusion-email" type="text" autocomplete="email" placeholder="Used only as a label on this device" value="${escapeHtml(settings.fusionEmail)}"></label>
        </div>
      </div>

      <div data-apex-mode-panel="local">
        <div class="apex-info-card caution">
          <strong>Local browser testing is limited</strong>
          <p>Vercel pages are HTTPS. Many browsers block direct calls to local HTTP Apex addresses because of CORS, mixed-content, or local-network rules. A failed browser test does not always mean the Apex address is wrong.</p>
        </div>
        <div class="apex-form-grid single">
          <label class="apex-field"><span>Local Apex URL / bridge URL</span><input id="apex-base-url" type="text" placeholder="http://apex.local or http://192.168.1.50" value="${escapeHtml(settings.baseUrl)}"></label>
          <label class="apex-field"><span>Username</span><input id="apex-username" type="text" autocomplete="username" value="${escapeHtml(settings.username)}"></label>
          <label class="apex-field"><span>Password / token</span><input id="apex-token" type="password" autocomplete="current-password" value="${escapeHtml(settings.token)}"></label>
        </div>
        <div class="apex-toggle-list">
          <label class="apex-switch-row"><span><strong>Use token-style auth when supported</strong><small>For bridges that use bearer tokens instead of basic auth.</small></span><input id="apex-use-token" type="checkbox" ${settings.useToken ? 'checked' : ''}></label>
          <label class="apex-switch-row"><span><strong>Allow local HTTP Apex address</strong><small>Needed by many local Apex controllers.</small></span><input id="apex-allow-insecure" type="checkbox" ${settings.allowInsecure ? 'checked' : ''}></label>
        </div>
      </div>

      <div id="apex-status-box" class="apex-status-box"></div>
      <div class="apex-actions">
        <button class="long-term-btn" type="button" onclick="ReefKeeperApex.saveFromForm()">Save Apex Profile</button>
        <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApex.testConnection()">Check Setup</button>
      </div>
      <div class="apex-note">v4.0.1 is read-only setup cleanup. Fusion mode is a safe profile and planning setup. Live Apex telemetry will come through a local bridge or official cloud API path, not direct browser Fusion credentials.</div>`;
    setModeVisibility(mode);
    setStatusMessage(status);
  }
  function changeMode(mode){ setModeVisibility(mode); }
  function saveFromForm(options = {}){
    const next = saveSettings(getFormSettings());
    const status = next.mode === 'fusion'
      ? saveLastStatus({ ok:true, mode:'fusion', label:'Fusion profile saved', testedAt:nowIso(), message:'Fusion mode saved. Live syncing will require a local bridge or official cloud API path; no Fusion password is stored.', tips:['Keep using Apex Fusion normally.','Next step: local bridge/read-only sync design.'] })
      : getLastStatus();
    renderApexSettings();
    if (status) setStatusMessage(status);
    try { if (!options.silent) showToast('✅ Apex profile saved'); } catch(e) {}
    return next;
  }
  async function testConnection(){
    const settings = saveSettings(getFormSettings());
    if (settings.mode === 'fusion') {
      const status = saveLastStatus({ ok:true, mode:'fusion', label:'Fusion profile saved', testedAt:nowIso(), message:'Fusion mode does not use a browser connection test. Reef Keeper saved this profile and is ready for the bridge/live-sync step.', tips:['No Fusion password is required here.','Do not expect http://apex.local to work from Vercel unless a local bridge allows it.'] });
      setStatusMessage(status);
      try { showToast('✅ Fusion profile saved'); } catch(e) {}
      return status;
    }
    const url = endpointFor(settings);
    if (!url) {
      const status = saveLastStatus({ ok:false, mode:'local', testedAt:nowIso(), message:'Enter your local Apex or bridge URL first.' });
      setStatusMessage(status); return status;
    }
    const btns = document.querySelectorAll('.apex-actions button');
    btns.forEach(b => b.disabled = true);
    setStatusMessage({ ok:false, mode:'local', testedAt:nowIso(), message:'Testing local Apex/bridge connection…' });
    try {
      const headers = { 'Accept':'application/json' };
      if (settings.username && settings.token && !settings.useToken) headers.Authorization = 'Basic ' + btoa(`${settings.username}:${settings.token}`);
      else if (settings.token && settings.useToken) headers.Authorization = `Bearer ${settings.token}`;
      const res = await fetch(url, { method:'GET', headers, cache:'no-store', mode:'cors' });
      if (!res.ok) throw new Error(`Endpoint returned HTTP ${res.status}`);
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch(e) {}
      const status = saveLastStatus({ ok:true, mode:'local', label:'Local endpoint reached', testedAt:nowIso(), url, message:'Local Apex/bridge status endpoint responded successfully.', sample: parsed ? Object.keys(parsed).slice(0,8) : [] });
      setStatusMessage(status);
      try { showToast('✅ Apex endpoint reached'); } catch(e) {}
      try { window.ReefKeeperBrain?.refresh?.(); } catch(e) {}
      return status;
    } catch(error) {
      const message = /Failed to fetch|NetworkError|Load failed/i.test(String(error?.message || ''))
        ? 'Browser could not reach the local Apex/bridge endpoint. This is often caused by CORS, HTTPS-to-HTTP restrictions, or local-network browser security.'
        : (error?.message || 'Local Apex/bridge connection test failed.');
      const status = saveLastStatus({ ok:false, mode:'local', testedAt:nowIso(), url, message, tips:['Confirm the phone is on the same Wi‑Fi.','Try the address directly in Safari/Chrome.','A local bridge is the recommended long-term path.'] });
      setStatusMessage(status);
      try { showToast('⚠️ Local test failed'); } catch(e) {}
      return status;
    } finally {
      btns.forEach(b => b.disabled = false);
    }
  }
  function getSnapshot(){ return { version:VERSION, settings:getSettings(), status:getLastStatus(), endpoint:endpointFor(getSettings()) }; }
  function openSettings(){
    try { showWorkspace('settings'); } catch(e) {}
    setTimeout(() => {
      renderApexSettings();
      const target = document.getElementById('apex-settings-card');
      try { target?.scrollIntoView({ block:'center', behavior:'smooth' }); } catch(e) {}
    }, 120);
  }
  window.ReefKeeperApex = { version:VERSION, getSettings, saveSettings, renderApexSettings, saveFromForm, testConnection, getLastStatus, getSnapshot, openSettings, changeMode };
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderApexSettings, 50));
})();
