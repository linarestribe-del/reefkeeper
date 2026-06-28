// Reef Keeper v3.5.0 Reef Brain
// A shared intelligence layer that turns local tank data into one consistent snapshot
// for Home, Ask AI, Days-Off Planner, reports, and future smart reminders.
(function(){
  'use strict';

  const VERSION = '3.5.0';
  const ONE_DAY = 86400000;

  function parseJson(key, fallback){
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch(e) { return fallback; }
  }

  function asArray(value){ return Array.isArray(value) ? value : []; }
  function number(value){ const n = parseFloat(value); return Number.isFinite(n) ? n : null; }
  function dateMs(value){ const t = new Date(value || 0).getTime(); return Number.isFinite(t) ? t : 0; }
  function sortNewest(items){ return [...asArray(items)].sort((a,b) => dateMs(b.isoDate || b.createdAt || b.completedAt || b.date) - dateMs(a.isoDate || a.createdAt || a.completedAt || a.date)); }

  function daysAgo(iso){
    const t = dateMs(iso);
    if (!t) return null;
    return Math.max(0, Math.floor((Date.now() - t) / ONE_DAY));
  }

  function daysLabel(iso){
    const days = daysAgo(iso);
    if (days === null) return 'No log';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    return `${days} days`;
  }

  function compact(text, max = 180){
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
  }

  function getLogs(){
    let defaults = [];
    try { if (typeof window.getDefaultLogs === 'function') defaults = window.getDefaultLogs() || []; } catch(e) {}
    return sortNewest([...asArray(defaults), ...asArray(parseJson('reef_logs', []))]);
  }

  function getActions(){ return sortNewest(parseJson('reef_actions', [])); }
  function getCompleted(){ return sortNewest(parseJson('reef_completed_history', [])); }
  function getReminders(){ return sortNewest(parseJson('reef_ai_reminders', [])).filter(r => r && !r.completed); }
  function getVisualHistory(){ return sortNewest(parseJson('reef_tank_visual_history_v13', [])); }

  function getInventory(){
    try { if (typeof window.getInventoryItems === 'function') return asArray(window.getInventoryItems()); } catch(e) {}
    return asArray(parseJson('reef_inventory_custom_v2', parseJson('reef_inventory', [])));
  }

  function getEquipment(){
    try { if (typeof window.getEquipmentItems === 'function') return asArray(window.getEquipmentItems()); } catch(e) {}
    try {
      const dbItems = window.ReefKeeperStorage?.readDb?.()?.data?.equipment;
      if (Array.isArray(dbItems)) return dbItems;
    } catch(e) {}
    return asArray(parseJson('reef_equipment_inventory_v1', []));
  }

  function getMaintenanceDue(){
    try { return asArray(window.ReefKeeperMaintenance?.getDueTasks?.({ windowDays: 14 })); } catch(e) { return []; }
  }

  function latestLogValues(log){
    return {
      po4: number(log?.po4 ?? 0.65),
      alk: number(log?.alk ?? 10.0),
      no3: number(log?.no3 ?? 22),
      ca: number(log?.ca ?? 478),
      mg: number(log?.mg),
      sal: number(log?.sal),
      ph: number(log?.ph)
    };
  }

  function scoreFromValues(values, inputs){
    let score = 100;
    const penalties = [];
    const add = (points, title, detail) => { score -= points; penalties.push({ points, title, detail }); };

    if (values.po4 !== null) {
      if (values.po4 > 0.5) add(14, 'Phosphate high', `${values.po4} ppm`);
      else if (values.po4 > 0.25) add(9, 'Phosphate elevated', `${values.po4} ppm`);
      else if (values.po4 > 0.12) add(4, 'Phosphate above preferred range', `${values.po4} ppm`);
    }
    if (values.alk !== null) {
      if (values.alk > 10.5) add(8, 'Alkalinity high', `${values.alk} dKH`);
      else if (values.alk > 9.7) add(4, 'Alkalinity above personal target', `${values.alk} dKH`);
      else if (values.alk < 7.5) add(8, 'Alkalinity low', `${values.alk} dKH`);
    }
    if (values.no3 !== null) {
      if (values.no3 > 25) add(7, 'Nitrate high', `${values.no3} ppm`);
      else if (values.no3 > 15) add(4, 'Nitrate above preferred range', `${values.no3} ppm`);
      else if (values.no3 < 1) add(4, 'Nitrate very low', `${values.no3} ppm`);
    }
    if (values.ca !== null) {
      if (values.ca > 470) add(4, 'Calcium high', `${values.ca} ppm`);
      else if (values.ca < 380) add(5, 'Calcium low', `${values.ca} ppm`);
    }
    if (values.sal !== null && (values.sal > 1.027 || values.sal < 1.024)) add(4, 'Salinity outside target', `${values.sal}`);
    if (values.mg === null) add(2, 'Magnesium not logged', 'Add Mg to improve scoring confidence');

    const latestAge = daysAgo(inputs.latestLog?.isoDate || inputs.latestLog?.date);
    if (latestAge !== null && latestAge > 7) add(6, 'Parameter log is old', `${latestAge} days`);
    if (inputs.dueTasks.length > 3) add(4, 'Maintenance queue building', `${inputs.dueTasks.length} due items`);
    if (!inputs.latestPhoto) add(4, 'Full-tank photo missing', 'Start Reef Timeline');

    return { score: Math.max(60, Math.min(100, Math.round(score))), penalties };
  }

  function statusFromScore(score){
    if (score >= 92) return { label:'Excellent', emoji:'🟢', level:'good' };
    if (score >= 84) return { label:'Stable', emoji:'🟡', level:'watch' };
    if (score >= 74) return { label:'Watch', emoji:'🟡', level:'watch' };
    return { label:'Needs Attention', emoji:'🔴', level:'attention' };
  }

  function buildWatching(values, scoring, inputs){
    const items = scoring.penalties.map(p => ({ title:p.title, detail:p.detail, severity:p.points >= 8 ? 'high' : 'watch' }));
    const latestPhotoAge = daysLabel(inputs.latestPhoto?.createdAt || inputs.latestPhoto?.isoDate || inputs.latestPhoto?.date);
    if (inputs.latestPhoto) items.push({ title:'Latest reef photo', detail:latestPhotoAge, severity:'info' });
    if (inputs.dueTasks.length) items.push({ title:'Maintenance coming due', detail:`${inputs.dueTasks.length} item${inputs.dueTasks.length === 1 ? '' : 's'}`, severity:'watch' });
    return items.slice(0, 8);
  }

  function buildToday(inputs){
    const lines = [];
    inputs.dueTasks.slice(0, 3).forEach(t => lines.push({ title:t.title || 'Maintenance due', detail:t.detail || t.when || 'Due soon', source:'maintenance' }));
    inputs.reminders.slice(0, 3).forEach(r => lines.push({ title:`${r.emoji || '⏰'} ${r.title || 'Reminder'}`, detail:r.when || r.repeat || 'Active', source:'reminder' }));
    if (!lines.length) {
      lines.push({ title:'Nothing overdue', detail:'Use Quick Actions to log today\'s work', source:'summary' });
      lines.push({ title:'Review Alk / PO₄ trend', detail:'Good default check-in', source:'summary' });
    }
    return lines.slice(0, 5);
  }

  function buildInventorySummary(inventory, equipment){
    const active = inventory.filter(i => !/lost|resolved|historical|removed/i.test(String(i.status || '')));
    const fish = active.filter(i => String(i.type || '').toLowerCase() === 'fish').length;
    const coral = active.filter(i => /coral|anemone/i.test(String(i.type || ''))).length;
    return { fish, coral, equipment: equipment.length, activeLivestock: active.length };
  }

  function buildAiContextLines(snapshot){
    const lines = [];
    lines.push(`Reef Brain score: ${snapshot.score}/100 (${snapshot.status.label}).`);
    lines.push(`Last parameter log: ${snapshot.lastTest.label}.`);
    snapshot.today.slice(0, 5).forEach(item => lines.push(`Today: ${item.title}${item.detail ? ` — ${item.detail}` : ''}.`));
    snapshot.watching.slice(0, 6).forEach(item => lines.push(`Watching: ${item.title}${item.detail ? ` — ${item.detail}` : ''}.`));
    lines.push(`Inventory summary: ${snapshot.inventory.fish} fish, ${snapshot.inventory.coral} coral/anemone, ${snapshot.inventory.equipment} gear items.`);
    return lines.map(x => compact(x, 240));
  }

  function getSnapshot(){
    const logs = getLogs();
    const latestLog = logs[0] || null;
    const actions = getActions();
    const completed = getCompleted();
    const reminders = getReminders();
    const visualHistory = getVisualHistory();
    const latestPhoto = visualHistory[0] || null;
    const dueTasks = getMaintenanceDue();
    const inventoryItems = getInventory();
    const equipmentItems = getEquipment();
    const values = latestLogValues(latestLog || {});
    const scoring = scoreFromValues(values, { latestLog, dueTasks, latestPhoto });
    const status = statusFromScore(scoring.score);
    const inventory = buildInventorySummary(inventoryItems, equipmentItems);
    const lastTest = { label: daysLabel(latestLog?.isoDate || latestLog?.date), days: daysAgo(latestLog?.isoDate || latestLog?.date), log: latestLog };
    const snapshot = {
      version: VERSION,
      createdAt: new Date().toISOString(),
      score: scoring.score,
      status,
      values,
      penalties: scoring.penalties,
      lastTest,
      today: buildToday({ dueTasks, reminders }),
      watching: buildWatching(values, scoring, { dueTasks, latestPhoto }),
      inventory,
      counts: { logs: logs.length, actions: actions.length, completed: completed.length, reminders: reminders.length, visualHistory: visualHistory.length },
      latestPhoto,
      dueTasks: dueTasks.slice(0, 10),
      recentActions: actions.slice(0, 8),
      recentCompleted: completed.slice(0, 8)
    };
    snapshot.aiContextLines = buildAiContextLines(snapshot);
    return snapshot;
  }

  function getPlainTextSummary(){
    const s = getSnapshot();
    return ['REEF BRAIN SNAPSHOT:', ...s.aiContextLines].join('\n');
  }

  function wrapPlanContext(){
    const old = window.getCurrentPlanPromptContext;
    if (typeof old !== 'function' || old.__reefBrainWrapped) return;
    const wrapped = function(){
      const ctx = old.apply(this, arguments) || {};
      ctx.reefBrain = getSnapshot();
      ctx.reefBrainLines = ctx.reefBrain.aiContextLines;
      return ctx;
    };
    wrapped.__reefBrainWrapped = true;
    window.getCurrentPlanPromptContext = wrapped;
  }

  function wrapAskOpenAI(){
    const old = window.askOpenAI;
    if (typeof old !== 'function' || old.__reefBrainWrapped) return;
    const wrapped = function(userMsg, history, modelMode, attachment){
      const message = `${userMsg}\n\n${getPlainTextSummary()}`;
      return old.call(this, message, history, modelMode, attachment);
    };
    wrapped.__reefBrainWrapped = true;
    window.askOpenAI = wrapped;
  }

  function install(){
    wrapPlanContext();
    wrapAskOpenAI();
  }

  window.ReefKeeperBrain = {
    version: VERSION,
    getSnapshot,
    getPlainTextSummary,
    refresh: getSnapshot,
    daysLabel,
    install
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 50));
  else setTimeout(install, 50);
})();
