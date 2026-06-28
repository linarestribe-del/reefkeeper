// Reef Keeper v4.0.0 Apex Connect
// Phase 1: store a local Apex connection profile and run a read-only connection test.
(function(){
  'use strict';

  const VERSION = '4.0.0';
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
    return { enabled:false, baseUrl:'', username:'', token:'', useToken:false, allowInsecure:true, updatedAt:null };
  }
  function getSettings(){ return { ...settingsDefault(), ...readJson(SETTINGS_KEY, {}) }; }
  function saveSettings(settings){
    const next = { ...settingsDefault(), ...(settings || {}) };
    next.baseUrl = cleanUrl(next.baseUrl);
    next.username = String(next.username || '').trim();
    next.token = String(next.token || '');
    next.enabled = Boolean(next.enabled && next.baseUrl);
    next.useToken = Boolean(next.useToken);
    next.allowInsecure = Boolean(next.allowInsecure);
    next.updatedAt = nowIso();
    writeJson(SETTINGS_KEY, next);
    return next;
  }
  function getLastStatus(){ return readJson(STATUS_KEY, null); }
  function saveLastStatus(status){ writeJson(STATUS_KEY, status); return status; }
  function statusLabel(status){
    if (!status) return { text:'Not tested', cls:'apex-status-idle' };
    if (status.ok) return { text:'Connected', cls:'apex-status-good' };
    return { text:'Not connected', cls:'apex-status-bad' };
  }
  function endpointFor(settings){
    const base = cleanUrl(settings.baseUrl);
    if (!base) return '';
    return `${base}/cgi-bin/status.json`;
  }
  function getFormSettings(){
    return {
      enabled: document.getElementById('apex-enabled')?.checked || false,
      baseUrl: document.getElementById('apex-base-url')?.value || '',
      username: document.getElementById('apex-username')?.value || '',
      token: document.getElementById('apex-token')?.value || '',
      useToken: document.getElementById('apex-use-token')?.checked || false,
      allowInsecure: document.getElementById('apex-allow-insecure')?.checked || false
    };
  }
  function setStatusMessage(status){
    const box = document.getElementById('apex-status-box');
    if (!box) return;
    const label = statusLabel(status);
    box.className = `apex-status-box ${label.cls}`;
    const tested = status?.testedAt ? new Date(status.testedAt).toLocaleString() : 'Never';
    const detail = status?.message || 'Add your Apex connection details, save, then test the connection.';
    box.innerHTML = `<div class="apex-status-head"><strong>${escapeHtml(label.text)}</strong><span>${escapeHtml(tested)}</span></div><div class="apex-status-detail">${escapeHtml(detail)}</div>`;
  }
  function renderApexSettings(){
    const root = document.getElementById('apex-settings-panel');
    if (!root) return;
    const settings = getSettings();
    const status = getLastStatus();
    root.innerHTML = `
      <div class="apex-form-grid">
        <label class="apex-field full"><span>Apex URL / hostname</span><input id="apex-base-url" type="text" placeholder="http://apex.local or http://192.168.1.50" value="${escapeHtml(settings.baseUrl)}"></label>
        <label class="apex-field"><span>Username</span><input id="apex-username" type="text" autocomplete="username" value="${escapeHtml(settings.username)}"></label>
        <label class="apex-field"><span>Password / token</span><input id="apex-token" type="password" autocomplete="current-password" value="${escapeHtml(settings.token)}"></label>
      </div>
      <div class="apex-toggle-list">
        <label class="apex-toggle"><input id="apex-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span>Enable Apex profile</span></label>
        <label class="apex-toggle"><input id="apex-use-token" type="checkbox" ${settings.useToken ? 'checked' : ''}><span>Use token-style auth when supported</span></label>
        <label class="apex-toggle"><input id="apex-allow-insecure" type="checkbox" ${settings.allowInsecure ? 'checked' : ''}><span>Allow local HTTP Apex address</span></label>
      </div>
      <div id="apex-status-box" class="apex-status-box"></div>
      <div class="apex-actions">
        <button class="long-term-btn" type="button" onclick="ReefKeeperApex.saveFromForm()">Save Apex Settings</button>
        <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApex.testConnection()">Test Connection</button>
      </div>
      <div class="apex-note">v4.0.0 is read-only connection setup. Reef Keeper stores this profile only in this browser. Some Apex units may block browser testing because of local-network/CORS rules; a failed browser test does not always mean the Apex address is wrong.</div>`;
    setStatusMessage(status);
  }
  function saveFromForm(options = {}){
    const next = saveSettings(getFormSettings());
    renderApexSettings();
    try { if (!options.silent) showToast('✅ Apex settings saved'); } catch(e) {}
    return next;
  }
  async function testConnection(){
    const settings = saveFromForm({ silent:true });
    const url = endpointFor(settings);
    if (!url) {
      const status = saveLastStatus({ ok:false, testedAt:nowIso(), message:'Enter your Apex URL first.' });
      setStatusMessage(status); return status;
    }
    const btns = document.querySelectorAll('.apex-actions button');
    btns.forEach(b => b.disabled = true);
    setStatusMessage({ ok:false, testedAt:nowIso(), message:'Testing Apex connection…' });
    try {
      const headers = { 'Accept':'application/json' };
      if (settings.username && settings.token && !settings.useToken) {
        headers.Authorization = 'Basic ' + btoa(`${settings.username}:${settings.token}`);
      } else if (settings.token && settings.useToken) {
        headers.Authorization = `Bearer ${settings.token}`;
      }
      const res = await fetch(url, { method:'GET', headers, cache:'no-store', mode:'cors' });
      if (!res.ok) throw new Error(`Apex returned HTTP ${res.status}`);
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch(e) {}
      const status = saveLastStatus({ ok:true, testedAt:nowIso(), url, message:'Apex status endpoint responded successfully.', sample: parsed ? Object.keys(parsed).slice(0,8) : [] });
      setStatusMessage(status);
      try { showToast('✅ Apex connected'); } catch(e) {}
      try { window.ReefKeeperBrain?.refresh?.(); } catch(e) {}
      return status;
    } catch(error) {
      const message = /Failed to fetch|NetworkError|Load failed/i.test(String(error?.message || ''))
        ? 'Could not reach Apex from this browser. Check URL, same Wi‑Fi, HTTP/HTTPS, and possible CORS/local-network restrictions.'
        : (error?.message || 'Apex connection test failed.');
      const status = saveLastStatus({ ok:false, testedAt:nowIso(), url, message });
      setStatusMessage(status);
      try { showToast('⚠️ Apex test failed'); } catch(e) {}
      return status;
    } finally {
      btns.forEach(b => b.disabled = false);
    }
  }
  function getSnapshot(){
    return { version:VERSION, settings:getSettings(), status:getLastStatus(), endpoint:endpointFor(getSettings()) };
  }
  function openSettings(){
    try { showWorkspace('settings'); } catch(e) {}
    setTimeout(() => {
      renderApexSettings();
      const target = document.getElementById('apex-settings-card');
      try { target?.scrollIntoView({ block:'center', behavior:'smooth' }); } catch(e) {}
    }, 120);
  }
  window.ReefKeeperApex = { version:VERSION, getSettings, saveSettings, renderApexSettings, saveFromForm, testConnection, getLastStatus, getSnapshot, openSettings };
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderApexSettings, 50));
})();
