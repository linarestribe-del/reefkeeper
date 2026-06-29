// Reef Keeper v4.3.2 Live Probes Mobile Layout Fix
// Builds a controller-style dashboard from normalized Apex telemetry.
(function(){
  'use strict';
  const VERSION = '4.3.2';
  const PREV_KEY = 'reef_apex_live_dashboard_previous_v1';
  const EVENTS_KEY = 'reef_apex_controller_events_v1';
  const MAX_EVENTS = 180;

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
  function ageLabel(iso){
    const t = new Date(iso || 0).getTime();
    if (!Number.isFinite(t) || !t) return 'No live update yet';
    const m = Math.max(0, Math.floor((Date.now()-t)/60000));
    if (m < 1) return 'Updated just now';
    if (m < 60) return `Updated ${m} min ago`;
    const h = Math.floor(m/60);
    if (h < 24) return `Updated ${h} hr ago`;
    const d = Math.floor(h/24);
    return `Updated ${d} day${d===1?'':'s'} ago`;
  }
  function snap(){
    try { return window.ReefKeeperApexBridge?.getSnapshot?.() || JSON.parse(localStorage.getItem('reef_apex_bridge_snapshot_v1') || 'null'); }
    catch(e){ return null; }
  }
  function classifyOutlet(o){
    const name = String(o?.name || '').toLowerCase();
    const type = String(o?.type || '').toLowerCase();
    const hay = `${name} ${type}`;
    if (/heat|heater|temp/.test(hay)) return { group:'Heating', icon:'🔥', role:'heater', idleOk:true };
    if (/fan|chill|cool/.test(hay)) return { group:'Cooling', icon:'🌬️', role:'cooling', idleOk:true };
    if (/return/.test(hay)) return { group:'Return', icon:'🔁', role:'return', expectedOn:true };
    if (/skimmer/.test(hay)) return { group:'Filtration', icon:'🫧', role:'skimmer', expectedOn:true };
    if (/uv/.test(hay)) return { group:'Filtration', icon:'🦠', role:'uv', expectedOn:true };
    if (/filter|roller|fleece/.test(hay)) return { group:'Filtration', icon:'🧻', role:'filter', expectedOn:true };
    if (/gfo|carbon|reactor/.test(hay)) return { group:'Reactors', icon:'⚗️', role:'reactor', expectedOn:true };
    if (/ato|top.?off/.test(hay)) return { group:'ATO', icon:'💧', role:'ato', expectedOn:true };
    if (/kalk|dose|nopox|pump/.test(hay)) return { group:'Dosing', icon:'💉', role:'dosing', idleOk:true };
    if (/mp40|dmp|wave|flow|powerhead/.test(hay)) return { group:'Flow', icon:'🌊', role:'flow', expectedOn:true };
    if (/radion|light|lamp|led|standlight/.test(hay)) return { group:'Lighting', icon:'💡', role:'lighting' };
    if (/leak|alarm|warn|error/.test(hay)) return { group:'Safety', icon:'🚨', role:'safety', idleOk:true };
    if (/24v|link/.test(hay)) return { group:'Accessory', icon:'🔌', role:'accessory', idleOk:true };
    return { group:'Other', icon:'⚙️', role:'other' };
  }
  function stateText(o){
    return String(o?.statusCode || o?.state || '').toUpperCase().replace(/\s+/g, '');
  }
  function outletIsOn(o){
    const s = stateText(o);
    return Boolean(o?.isOn) || s === 'ON' || s === 'AON' || s === 'AUTO/ON' || s === 'AUTO_ON' || s.includes('/ON');
  }
  function outletIsOff(o){
    const s = stateText(o);
    return Boolean(o?.isOff) || s === 'OFF' || s === 'AOF' || s === 'AUTO/OFF' || s === 'AUTO_OFF' || s.includes('/OFF');
  }
  function isOutletHealthy(o, meta){
    if (!o) return false;
    const on = outletIsOn(o);
    const off = outletIsOff(o);
    // Apex AUTO/ON and ON are normal for equipment that should be running.
    if (meta.expectedOn) return on;
    // Heaters, fans, dosing pumps, safety virtuals, and accessories are allowed to be idle/off.
    if (meta.idleOk) return true;
    if (meta.role === 'safety') return !on;
    return true;
  }
  function probeStatus(label, value){
    const v = num(value);
    if (v === null) return { cls:'missing', text:'Missing' };
    if (label === 'temp') {
      if (v < 75 || v > 80) return { cls:'watch', text:'Watch' };
      return { cls:'good', text:'Stable' };
    }
    if (label === 'ph') {
      if (v < 7.8 || v > 8.6) return { cls:'watch', text:'Watch' };
      return { cls:'good', text:'Normal' };
    }
    if (label === 'orp') {
      if (v < 250 || v > 475) return { cls:'watch', text:'Watch' };
      return { cls:'good', text:'Normal' };
    }
    return { cls:'good', text:'Imported' };
  }
  function healthScore(s){
    if (!s) return { score:0, label:'No telemetry', cls:'missing', emoji:'⚪', reasons:['No live telemetry loaded.'] };
    let score = 100;
    const reasons = [];
    const p = s.probes || {};
    const t = num(p.temp), ph = num(p.ph), orp = num(p.orp);
    if (t === null) { score -= 8; reasons.push('Temperature probe missing'); }
    else if (t < 75 || t > 80) { score -= 18; reasons.push(`Temperature ${t}°F outside normal range`); }
    if (ph === null) { score -= 5; reasons.push('pH probe missing'); }
    else if (ph < 7.8 || ph > 8.6) { score -= 12; reasons.push(`pH ${ph} needs review`); }
    if (orp !== null && (orp < 250 || orp > 475)) { score -= 6; reasons.push(`ORP ${orp} mV is unusual`); }
    const outlets = Array.isArray(s.outlets) ? s.outlets : [];
    const criticalOff = outlets.filter(o => {
      const m = classifyOutlet(o);
      return m.expectedOn && !outletIsOn(o);
    });
    if (criticalOff.length) { score -= Math.min(35, criticalOff.length * 8); reasons.push(`${criticalOff.length} expected-on outlet${criticalOff.length===1?' is':'s are'} off`); }
    const alarms = Array.isArray(s.alarms) ? s.alarms : [];
    if (alarms.length) { score -= Math.min(40, alarms.length * 15); reasons.push(`${alarms.length} Apex alarm${alarms.length===1?'':'s'} active`); }
    const ageMs = Date.now() - new Date(s.receivedAt || s.capturedAt || 0).getTime();
    if (Number.isFinite(ageMs) && ageMs > 10*60000) { score -= 10; reasons.push('Telemetry is older than 10 minutes'); }
    score = Math.max(0, Math.round(score));
    if (!reasons.length) reasons.push('Critical probes and expected-on equipment look normal.');
    if (score >= 90) return { score, label:'Excellent', cls:'good', emoji:'🟢', reasons };
    if (score >= 75) return { score, label:'Stable', cls:'ok', emoji:'🟡', reasons };
    return { score, label:'Needs Attention', cls:'watch', emoji:'🔴', reasons };
  }
  function groupOutlets(outlets){
    const groups = {};
    (Array.isArray(outlets)?outlets:[]).forEach(o => {
      const meta = classifyOutlet(o);
      groups[meta.group] = groups[meta.group] || [];
      groups[meta.group].push({ outlet:o, meta, healthy:isOutletHealthy(o, meta) });
    });
    const order = ['Return','Filtration','Flow','Heating','Cooling','ATO','Reactors','Dosing','Lighting','Safety','Accessory','Other'];
    return order.filter(g => groups[g]?.length).map(g => [g, groups[g]]);
  }
  function saveControllerEvents(s){
    if (!s || !Array.isArray(s.outlets)) return;
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(PREV_KEY) || 'null'); } catch(e) {}
    const currentMap = Object.fromEntries(s.outlets.map(o => [o.did || o.name, { name:o.name, state:o.state, isOn:o.isOn, statusCode:o.statusCode }]));
    if (prev && prev.map) {
      const events = [];
      for (const [id, cur] of Object.entries(currentMap)) {
        const old = prev.map[id];
        if (old && old.statusCode !== cur.statusCode) {
          events.push({ id:`apex-${Date.now()}-${id}`, type:'equipment', emoji:'⚙️', title:`${cur.name} changed to ${cur.state}`, detail:`Previous state: ${old.state || old.statusCode || 'unknown'}`, createdAt:s.receivedAt || new Date().toISOString(), source:'Apex telemetry' });
        }
      }
      const oldTemp = num(prev.probes?.temp), newTemp = num(s.probes?.temp);
      if (oldTemp !== null && newTemp !== null && Math.abs(newTemp-oldTemp) >= 1.0) {
        events.push({ id:`apex-temp-${Date.now()}`, type:'params', emoji:'🌡️', title:`Temperature changed ${oldTemp}°F → ${newTemp}°F`, detail:'Detected from live Apex telemetry.', createdAt:s.receivedAt || new Date().toISOString(), source:'Apex telemetry' });
      }
      if (events.length) {
        try {
          const existing = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
          localStorage.setItem(EVENTS_KEY, JSON.stringify([...events, ...existing].slice(0, MAX_EVENTS)));
        } catch(e) {}
      }
    }
    try { localStorage.setItem(PREV_KEY, JSON.stringify({ map:currentMap, probes:s.probes || {}, at:s.receivedAt || s.capturedAt || new Date().toISOString() })); } catch(e) {}
  }
  function injectStyles(){
    if (document.getElementById('rk-live-dashboard-style')) return;
    const style = document.createElement('style');
    style.id = 'rk-live-dashboard-style';
    style.textContent = `
      .rk-live-dashboard-card .home-telemetry-grid{display:block !important;}
      .rk-live-wrap{display:block;width:100%;max-width:100%;}
      .rk-live-top{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;width:100%;}
      .rk-live-health{border-radius:18px;padding:14px;background:rgba(255,255,255,.78);box-shadow:0 10px 30px rgba(12,64,90,.08);border:1px solid rgba(10,130,160,.15);width:100%;box-sizing:border-box;overflow:hidden}.theme-dark .rk-live-health{background:rgba(12,24,34,.72);border-color:rgba(120,220,255,.14)}
      .rk-live-health-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.rk-live-health-title{font-weight:900;font-size:1rem;line-height:1.16}.rk-live-health-score{font-weight:900;font-size:1.45rem;line-height:1;text-align:right;white-space:nowrap}.rk-live-health.good .rk-live-health-score{color:#067a46}.rk-live-health.ok .rk-live-health-score{color:#9a6a00}.rk-live-health.watch .rk-live-health-score{color:#b3261e}.rk-live-health small{display:block;opacity:.72}.rk-live-reason{margin-top:8px;font-size:.88rem;line-height:1.35;opacity:.85}.rk-live-system{margin-top:8px;font-size:.76rem;opacity:.7;display:flex;gap:8px;flex-wrap:wrap}
      .rk-probe-grid{display:grid;grid-template-columns:repeat(2,minmax(132px,1fr));gap:10px;width:100%;box-sizing:border-box;align-items:stretch}.rk-probe{border-radius:16px;padding:12px;background:rgba(255,255,255,.72);border:1px solid rgba(10,130,160,.12);min-width:0;box-sizing:border-box;overflow:hidden}.theme-dark .rk-probe{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08)}.rk-probe span{display:block;font-size:.82rem;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rk-probe strong{display:block;font-size:1.42rem;margin:4px 0 3px;line-height:1.05;white-space:nowrap;letter-spacing:-.03em}.rk-probe em{display:block;font-style:normal;font-size:.78rem;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rk-probe.good strong{color:#067a46}.rk-probe.watch strong{color:#b3261e}.rk-probe.missing strong{opacity:.5}
      .rk-equipment-live{display:grid;grid-template-columns:1fr;gap:10px;width:100%;box-sizing:border-box}.rk-eq-group{border-radius:18px;background:rgba(255,255,255,.70);border:1px solid rgba(10,130,160,.12);padding:10px;box-sizing:border-box;overflow:hidden}.theme-dark .rk-eq-group{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.08)}.rk-eq-head{display:flex;justify-content:space-between;align-items:center;font-weight:900;margin-bottom:8px;gap:8px}.rk-eq-head span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rk-eq-count{font-size:.75rem;opacity:.65;white-space:nowrap}.rk-eq-list{display:grid;gap:6px}.rk-eq-item{display:flex;justify-content:space-between;align-items:center;border-radius:12px;padding:8px;background:rgba(0,120,150,.06);gap:8px}.theme-dark .rk-eq-item{background:rgba(255,255,255,.04)}.rk-eq-name{font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rk-eq-state{font-size:.75rem;font-weight:900;white-space:nowrap}.rk-eq-item.good .rk-eq-state{color:#067a46}.rk-eq-item.auto .rk-eq-state{color:#d07500}.rk-eq-item.idle .rk-eq-state{opacity:.72;color:#4f5b62}.rk-eq-item.watch .rk-eq-state{color:#b3261e}.rk-live-section-title{font-size:.82rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;opacity:.68;margin:14px 0 8px}
      @media(min-width:920px){.rk-live-top{grid-template-columns:minmax(280px,.9fr) minmax(0,1.35fr);align-items:stretch}.rk-probe-grid{grid-template-columns:repeat(4,minmax(120px,1fr))}.rk-equipment-live{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media(max-width:520px){.rk-live-top{display:block}.rk-live-top>div+div{margin-top:14px}.rk-probe-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rk-live-health{padding:12px}.rk-live-health-title{font-size:.98rem}.rk-live-health-score{font-size:1.35rem}.rk-probe{padding:11px 10px}.rk-probe span{font-size:.78rem}.rk-probe strong{font-size:1.26rem}.rk-probe em{font-size:.74rem}.rk-eq-group{padding:9px}.rk-eq-state{font-size:.72rem}}@media(max-width:360px){.rk-probe-grid{grid-template-columns:1fr}.rk-probe strong{font-size:1.32rem}}
    `;
    document.head.appendChild(style);
  }
  function render(){
    injectStyles();
    const grid = document.getElementById('home-telemetry-grid');
    const subtitle = document.getElementById('home-telemetry-subtitle');
    const card = document.getElementById('home-telemetry-card');
    if (!grid) return;
    const s = snap();
    if (!s) return;
    saveControllerEvents(s);
    const h = healthScore(s);
    const p = s.probes || {};
    const groups = groupOutlets(s.outlets || []);
    const alarms = Array.isArray(s.alarms) ? s.alarms : [];
    if (card) { card.classList.remove('empty'); card.classList.add('rk-live-dashboard-card'); }
    if (subtitle) subtitle.textContent = `${ageLabel(s.receivedAt || s.capturedAt)} · ${h.label} · ${alarms.length ? alarms.length + ' alarm(s)' : 'No alarms'}`;
    const probeTiles = [
      ['temp','Temperature',p.temp,'°F'],['ph','pH',p.ph,''],['orp','ORP',p.orp,'mV'],['salinity','Salinity',p.salinity,'']
    ].map(([key,label,val,unit]) => { const st=probeStatus(key,val); return `<div class="rk-probe ${st.cls}"><span>${label}</span><strong>${val ?? '—'}${val==null?'':unit}</strong><em>${st.text}</em></div>`; }).join('');
    const groupHtml = groups.map(([name, items]) => {
      const good = items.filter(x => x.healthy).length;
      return `<div class="rk-eq-group"><div class="rk-eq-head"><span>${items[0]?.meta?.icon || '⚙️'} ${esc(name)}</span><span class="rk-eq-count">${good}/${items.length} normal</span></div><div class="rk-eq-list">${items.slice(0,8).map(({outlet:o, meta, healthy}) => {
        const state = o.state || o.statusCode || 'unknown';
        const cls = healthy ? (outletIsOn(o) ? (String(state).toUpperCase().includes('AUTO') ? 'auto' : 'good') : 'idle') : 'watch';
        return `<div class="rk-eq-item ${cls}"><span class="rk-eq-name">${esc(o.name)}</span><span class="rk-eq-state">${esc(state)}</span></div>`;
      }).join('')}</div></div>`;
    }).join('');
    grid.innerHTML = `<div class="rk-live-wrap"><div class="rk-live-top"><div class="rk-live-health ${h.cls}"><div class="rk-live-health-top"><div><div class="rk-live-health-title">${h.emoji} Tank Health</div><small>${esc(h.label)} · ${esc(ageLabel(s.receivedAt || s.capturedAt))}</small></div><div class="rk-live-health-score">${h.score}<small>/100</small></div></div><div class="rk-live-reason">${esc(h.reasons[0])}</div><div class="rk-live-system"><span>${esc(s.system?.hostname || 'Apex')}</span>${s.system?.ipaddr ? `<span>${esc(s.system.ipaddr)}</span>` : ''}${s.system?.wifiQuality!=null ? `<span>Wi‑Fi ${esc(s.system.wifiQuality)}%</span>` : ''}</div></div><div><div class="rk-live-section-title">Live probes</div><div class="rk-probe-grid">${probeTiles}</div></div></div><div class="rk-live-section-title">Live equipment</div><div class="rk-equipment-live">${groupHtml || '<div class="home-telemetry-empty">No outlet states in snapshot.</div>'}</div></div>`;
  }
  function install(){
    const old = window.renderHomeTelemetry;
    if (typeof old === 'function' && !old.__rkLiveDashboardWrapped) {
      const wrapped = function(){
        const result = old.apply(this, arguments);
        setTimeout(render, 30);
        return result;
      };
      wrapped.__rkLiveDashboardWrapped = true;
      window.renderHomeTelemetry = wrapped;
    }
    setTimeout(render, 800);
    setInterval(render, 30000);
  }
  window.ReefKeeperLiveDashboard = { version:VERSION, render, classifyOutlet, healthScore, groupOutlets };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
