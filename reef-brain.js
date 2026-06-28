// Reef Keeper v4.0.2 Apex Live Data Bridge
// A shared intelligence layer that turns local tank data into one consistent snapshot
// for Home, Ask AI, Days-Off Planner, reports, and future smart reminders.
(function(){
  'use strict';

  const VERSION = '4.0.2';
  const ONE_DAY = 86400000;
  const SNAPSHOT_CACHE_MS = 1500;
  let snapshotCache = null;

  function invalidate(){ snapshotCache = null; }

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

  function getApexBridgeSnapshot(){
    try { return window.ReefKeeperApexBridge?.getSnapshot?.() || parseJson('reef_apex_bridge_snapshot_v1', null); }
    catch(e) { return null; }
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

  const PARAM_CONFIG = {
    po4: { label:'Phosphate', unit:'ppm', high:0.12, target:'0.05–0.10', precision:2, stableDelta:0.03 },
    alk: { label:'Alkalinity', unit:'dKH', high:9.7, low:7.8, target:'8.5–9.5', precision:1, stableDelta:0.2 },
    no3: { label:'Nitrate', unit:'ppm', high:15, target:'5–10', precision:0, stableDelta:3 },
    ca: { label:'Calcium', unit:'ppm', high:470, low:380, target:'400–450', precision:0, stableDelta:20 },
    mg: { label:'Magnesium', unit:'ppm', low:1250, high:1450, target:'1280–1400', precision:0, stableDelta:40 },
    ph: { label:'pH', unit:'', low:7.9, high:8.6, target:'8.1–8.4', precision:2, stableDelta:0.08 },
    sal: { label:'Salinity', unit:'SG', low:1.024, high:1.027, target:'1.025–1.026', precision:3, stableDelta:0.001 }
  };

  function fmtValue(value, key){
    const cfg = PARAM_CONFIG[key] || { precision:2, unit:'' };
    const n = number(value);
    if (n === null) return '—';
    return `${n.toFixed(cfg.precision)}${cfg.unit ? ' ' + cfg.unit : ''}`;
  }

  function getParamPoints(logs, key){
    return asArray(logs)
      .map(log => ({ log, value:number(log?.[key]), at:log?.isoDate || log?.createdAt || log?.date }))
      .filter(p => p.value !== null && dateMs(p.at))
      .sort((a,b) => dateMs(a.at) - dateMs(b.at));
  }

  function buildTrendAnalysis(logs){
    const trends = {};
    Object.keys(PARAM_CONFIG).forEach(key => {
      const points = getParamPoints(logs, key);
      if (!points.length) return;
      const latest = points[points.length - 1];
      const previous = points.length > 1 ? points[points.length - 2] : null;
      const firstRecent = points[Math.max(0, points.length - 4)];
      const delta = previous ? latest.value - previous.value : 0;
      const recentDelta = latest.value - firstRecent.value;
      const cfg = PARAM_CONFIG[key];
      const absDelta = Math.abs(delta);
      const stable = previous ? absDelta <= cfg.stableDelta : true;
      let direction = 'stable';
      if (!stable) direction = delta > 0 ? 'rising' : 'falling';
      let status = 'in range';
      if (cfg.high != null && latest.value > cfg.high) status = 'above target';
      if (cfg.low != null && latest.value < cfg.low) status = 'below target';
      const detail = previous
        ? `${fmtValue(previous.value, key)} → ${fmtValue(latest.value, key)} (${direction})`
        : `${fmtValue(latest.value, key)} single reading`;
      trends[key] = {
        key,
        label: cfg.label,
        unit: cfg.unit,
        latest: latest.value,
        previous: previous?.value ?? null,
        delta,
        recentDelta,
        direction,
        stable,
        status,
        target: cfg.target,
        points: points.length,
        latestAt: latest.at,
        detail
      };
    });
    return trends;
  }

  function buildTrendInsights(trends){
    const insights = [];
    const add = (title, detail, severity='info', key='') => insights.push({ title, detail:compact(detail, 180), severity, key });
    Object.values(trends || {}).forEach(t => {
      if (t.points < 2) return;
      if (t.status !== 'in range') add(`${t.label} ${t.status}`, `${t.detail}. Target ${t.target}.`, t.status === 'above target' || t.status === 'below target' ? 'watch' : 'info', t.key);
      else if (t.stable) add(`${t.label} stable`, `${t.detail}. Target ${t.target}.`, 'good', t.key);
      else add(`${t.label} ${t.direction}`, `${t.detail}. Target ${t.target}.`, 'info', t.key);
    });
    return insights.slice(0, 8);
  }

  function buildScoreExplanation(scoring, trends, inputs){
    const penalties = asArray(scoring.penalties);
    const positives = [];
    Object.values(trends || {}).forEach(t => {
      if (t.points >= 2 && t.status === 'in range' && t.stable) positives.push(`${t.label} is stable`);
      if (t.key === 'po4' && t.points >= 2 && t.direction === 'falling') positives.push('Phosphate is trending down');
    });
    if (inputs?.dueTasks?.length === 0) positives.push('No major maintenance queue');
    if (inputs?.latestPhoto) positives.push('Reef Timeline has a recent visual record');
    const mainPenalty = penalties[0];
    const summary = mainPenalty
      ? `Score is mainly limited by ${mainPenalty.title.toLowerCase()} (${mainPenalty.detail}).`
      : 'Score is supported by stable logs and no major warnings.';
    return {
      summary,
      positives: [...new Set(positives)].slice(0, 4),
      penalties: penalties.slice(0, 5),
      explainLines: [summary, ...[...new Set(positives)].slice(0, 3).map(p => `Positive: ${p}.`)]
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


  function equipmentActions(){ return sortNewest([...getActions(), ...getCompleted()]); }
  function equipmentNormalize(text){ return String(text || '').toLowerCase().replace(/×/g,'x').replace(/[^a-z0-9]+/g,' ').trim(); }
  function equipmentTerms(item){
    const text = equipmentNormalize([item.name,item.category,item.brand,item.model,item.notes].filter(Boolean).join(' '));
    const terms = new Set(text.split(/\s+/).filter(w => w.length >= 3));
    if (/skimmer|simplicity|240/.test(text)) ['skimmer','simplicity','240'].forEach(t=>terms.add(t));
    if (/mp40|powerhead|flow|dmp20/.test(text)) ['mp40','powerhead','flow','dmp20'].forEach(t=>terms.add(t));
    if (/return|mdp|pump/.test(text)) ['return','pump','mdp'].forEach(t=>terms.add(t));
    if (/heater|hygger/.test(text)) ['heater','hygger','temperature'].forEach(t=>terms.add(t));
    if (/uv|sterilizer|icecap/.test(text)) ['uv','sterilizer','icecap'].forEach(t=>terms.add(t));
    if (/gfo|reactor|carbon|rox/.test(text)) ['gfo','reactor','carbon','rox'].forEach(t=>terms.add(t));
    if (/ato|useek/.test(text)) ['ato','top','off','sensor','useek'].forEach(t=>terms.add(t));
    if (/rodi|tds|resin|filter/.test(text)) ['rodi','tds','resin','filter'].forEach(t=>terms.add(t));
    if (/apex|controller|probe/.test(text)) ['apex','controller','probe'].forEach(t=>terms.add(t));
    if (/light|a8se/.test(text)) ['light','a8se','lens','fan'].forEach(t=>terms.add(t));
    return Array.from(terms);
  }
  function equipmentLastService(item){
    if (item.lastServiceAt) return { iso:item.lastServiceAt, source:'equipment log' };
    const terms = equipmentTerms(item);
    const serviceRx = /service|serviced|clean|cleaned|inspect|inspected|replace|replaced|changed|calibrate|calibrated|media|fleece|bulb|impeller|sensor|probe|tds|heater|skimmer|gfo|carbon|uv|ato|mp40|powerhead|return|rodi/i;
    let best = null;
    for (const action of equipmentActions()) {
      const hay = equipmentNormalize(`${action.title || ''} ${action.category || ''} ${action.notes || ''}`);
      if (!serviceRx.test(hay)) continue;
      const hits = terms.filter(t => t.length >= 3 && hay.includes(t)).length;
      if (!hits) continue;
      const iso = action.isoDate || action.completedAt || action.createdAt || action.date;
      if (!dateMs(iso)) continue;
      const score = hits + (/equipment|service|clean|inspect|replace|changed/.test(hay) ? 1 : 0);
      if (!best || score > best.score || (score === best.score && dateMs(iso) > dateMs(best.iso))) best = { iso, source:'action history', score };
    }
    if (best) return best;
    return { iso:item.installedDate || item.purchaseDate || item.createdAt || '', source:item.installedDate || item.purchaseDate ? 'install date' : 'default date' };
  }
  function equipmentIntel(item){
    const interval = number(item.maintenanceDays || item.intervalDays || 0) || 0;
    const last = equipmentLastService(item);
    const age = daysAgo(last.iso);
    if (!interval) return { name:item.name, category:item.category || 'Equipment', level:'watch', label:'Set interval', detail:'No interval set', lastService:daysLabel(last.iso), recommendation:'Add a maintenance interval.' };
    if (age === null) return { name:item.name, category:item.category || 'Equipment', level:'watch', label:'Needs baseline', detail:'No service date', lastService:'Not logged', recommendation:'Log service to start tracking.' };
    const remaining = interval - age;
    if (remaining < 0) return { name:item.name, category:item.category || 'Equipment', level:'due', label:'Overdue', detail:`${Math.abs(remaining)} days overdue`, lastService:daysLabel(last.iso), recommendation:'Service during the next maintenance session.' };
    if (remaining <= Math.max(3, Math.ceil(interval * 0.18))) return { name:item.name, category:item.category || 'Equipment', level:'soon', label:'Due soon', detail:`Due in ${remaining} day${remaining === 1 ? '' : 's'}`, lastService:daysLabel(last.iso), recommendation:'Plan this for your next days-off block.' };
    return { name:item.name, category:item.category || 'Equipment', level:'good', label:'On track', detail:`Due in ${remaining} day${remaining === 1 ? '' : 's'}`, lastService:daysLabel(last.iso), recommendation:'No service needed right now.' };
  }
  function buildEquipmentIntelligence(equipment){
    const items = asArray(equipment).filter(i => !/retired|removed|inactive/i.test(String(i.status || ''))).map(equipmentIntel);
    const due = items.filter(i => i.level === 'due');
    const soon = items.filter(i => i.level === 'soon');
    const watch = items.filter(i => i.level === 'watch');
    const priority = [...due, ...soon, ...watch, ...items.filter(i => i.level === 'good')].slice(0, 8);
    const summary = due.length ? `${due.length} overdue` : soon.length ? `${soon.length} due soon` : 'All tracked gear on schedule';
    return { summary, dueCount:due.length, soonCount:soon.length, watchCount:watch.length, total:items.length, priority, items };
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
    if (snapshot.dailyAssistant?.headline) lines.push(`Daily Reef Assistant: ${snapshot.dailyAssistant.headline}`);
    (snapshot.dailyAssistant?.bullets || []).slice(0, 5).forEach(item => lines.push(`Daily brief: ${item.text}${item.detail ? ` — ${item.detail}` : ''}.`));
    snapshot.today.slice(0, 5).forEach(item => lines.push(`Today: ${item.title}${item.detail ? ` — ${item.detail}` : ''}.`));
    snapshot.watching.slice(0, 6).forEach(item => lines.push(`Watching: ${item.title}${item.detail ? ` — ${item.detail}` : ''}.`));
    lines.push(`Inventory summary: ${snapshot.inventory.fish} fish, ${snapshot.inventory.coral} coral/anemone, ${snapshot.inventory.equipment} gear items.`);
    if (snapshot.equipmentIntelligence) lines.push(`Equipment intelligence: ${snapshot.equipmentIntelligence.summary}; ${snapshot.equipmentIntelligence.total} tracked gear items.`);
    if (snapshot.apexBridge) {
      const p = snapshot.apexBridge.probes || {};
      lines.push(`Apex bridge: latest telemetry ${daysLabel(snapshot.apexBridge.capturedAt || snapshot.apexBridge.receivedAt)} from ${snapshot.apexBridge.source || 'bridge'}.`);
      if (p.temp !== null && p.temp !== undefined) lines.push(`Apex temp: ${p.temp}°F.`);
      if (p.ph !== null && p.ph !== undefined) lines.push(`Apex pH: ${p.ph}.`);
      if (p.orp !== null && p.orp !== undefined) lines.push(`Apex ORP: ${p.orp}.`);
      if (snapshot.apexBridge.alarms?.length) lines.push(`Apex alarms: ${snapshot.apexBridge.alarms.join('; ')}.`);
    }
    (snapshot.equipmentIntelligence?.priority || []).slice(0, 4).forEach(item => lines.push(`Equipment: ${item.name} — ${item.label}, ${item.detail}; last service ${item.lastService}.`));
    if (snapshot.scoreExplanation?.summary) lines.push(`Score explanation: ${snapshot.scoreExplanation.summary}`);
    (snapshot.trendInsights || []).slice(0, 5).forEach(item => lines.push(`Trend insight: ${item.title} — ${item.detail}.`));
    return lines.map(x => compact(x, 260));
  }


  function buildDailyAssistant(values, scoring, inputs){
    const score = scoring.score;
    const lastTestDays = daysAgo(inputs.latestLog?.isoDate || inputs.latestLog?.date);
    const latestPhotoDays = inputs.latestPhoto ? daysAgo(inputs.latestPhoto.createdAt || inputs.latestPhoto.isoDate || inputs.latestPhoto.date) : null;
    const trends = inputs.trends || {};
    const explanation = inputs.scoreExplanation || { positives:[], penalties:[] };
    const bullets = [];
    const add = (text, detail = '', action = '', priority = 50) => {
      if (!text || bullets.some(b => b.text === text)) return;
      bullets.push({ text: compact(text, 120), detail: compact(detail, 150), action, priority });
    };

    if (lastTestDays === null || lastTestDays > 7) add('Log a fresh water test', lastTestDays === null ? 'No recent parameter log found.' : `Last test was ${lastTestDays} days ago.`, 'water-test', 95);
    else if (lastTestDays >= 3) add('Consider a quick Alk / PO₄ check', `Last test was ${lastTestDays} days ago.`, 'water-test', 70);

    const po4Trend = trends.po4;
    const alkTrend = trends.alk;
    const no3Trend = trends.no3;
    if (po4Trend && po4Trend.status !== 'in range') add('Keep watching phosphate', `${po4Trend.detail}. Lower slowly; avoid aggressive stripping.`, 'params', 86);
    else if (po4Trend && po4Trend.direction === 'falling') add('Phosphate trend is improving', `${po4Trend.detail}. Hold the current export strategy unless coral response changes.`, 'params', 45);
    else if (values.po4 !== null && values.po4 > 0.12) add('Keep watching phosphate', `${values.po4} ppm. Lower slowly; avoid aggressive stripping.`, 'params', 82);

    if (alkTrend && (alkTrend.status !== 'in range' || !alkTrend.stable)) add('Prioritize alkalinity stability', `${alkTrend.detail}. Retest before dosing changes.`, 'params', 90);
    else if (values.alk !== null && (values.alk > 9.7 || values.alk < 7.8)) add('Prioritize alkalinity stability', `${values.alk} dKH. Retest before major dosing changes.`, 'params', 82);

    if (no3Trend && no3Trend.status !== 'in range') add('Nitrate is outside target', `${no3Trend.detail}. Confirm trend before changing multiple things.`, 'params', 68);
    else if (values.no3 !== null && values.no3 > 15) add('Nitrate is still above preferred range', `${values.no3} ppm. Confirm trend before changing multiple things.`, 'params', 62);

    inputs.dueTasks.slice(0, 2).forEach(task => add(task.title || 'Maintenance due', task.detail || task.when || 'Due soon.', 'maintenance', 78));
    (inputs.equipmentIntelligence?.priority || []).filter(item => item.level === 'due' || item.level === 'soon').slice(0, 2).forEach(item => add(`${item.name} ${item.label.toLowerCase()}`, item.detail, 'maintenance', item.level === 'due' ? 88 : 74));
    inputs.reminders.slice(0, 2).forEach(reminder => add(`${reminder.emoji || '⏰'} ${reminder.title || 'Reminder'}`, reminder.when || reminder.repeat || 'Active reminder.', 'maintenance', 65));

    if (!inputs.latestPhoto) add('Take a full-tank photo', 'This starts the Reef Timeline and gives AI Vision a baseline.', 'vision', 58);
    else if (latestPhotoDays !== null && latestPhotoDays >= 14) add('Update the Reef Timeline photo', `Last full-tank photo was ${latestPhotoDays} days ago.`, 'vision', 58);

    if (explanation.positives?.length && bullets.length < 5) add(explanation.positives[0], 'This is helping your reef score.', 'monitoring', 35);
    if (!bullets.length) add('Nothing urgent today', 'Log anything you do so the Reef Brain can keep the plan current.', 'maintenance', 40);

    const sorted = bullets.sort((a,b) => b.priority - a.priority).slice(0, 5);
    const urgentCount = sorted.filter(b => b.priority >= 85).length;
    const estimate = sorted.reduce((total, b) => total + (b.action === 'vision' ? 3 : b.action === 'water-test' || b.action === 'params' ? 8 : b.action === 'maintenance' ? 10 : 2), 0);

    const headline = score >= 92
      ? 'Your reef looks strong today.'
      : score >= 84
        ? 'Your reef looks stable today.'
        : score >= 74
          ? 'Your reef is in watch mode today.'
          : 'Your reef needs attention today.';

    const primaryAction = sorted[0]?.action || (score < 84 ? 'params' : 'maintenance');
    return {
      headline,
      updatedAt: new Date().toISOString(),
      primaryAction,
      estimateMinutes: estimate,
      urgentCount,
      scoreSummary: explanation.summary || '',
      bullets: sorted
    };
  }

  function buildSnapshot(){
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
    const apexBridge = getApexBridgeSnapshot();
    const values = latestLogValues(latestLog || {});
    const trends = buildTrendAnalysis(logs);
    const trendInsights = buildTrendInsights(trends);
    const scoring = scoreFromValues(values, { latestLog, dueTasks, latestPhoto });
    const scoreExplanation = buildScoreExplanation(scoring, trends, { latestLog, dueTasks, latestPhoto });
    const status = statusFromScore(scoring.score);
    const inventory = buildInventorySummary(inventoryItems, equipmentItems);
    const equipmentIntelligence = buildEquipmentIntelligence(equipmentItems);
    const lastTest = { label: daysLabel(latestLog?.isoDate || latestLog?.date), days: daysAgo(latestLog?.isoDate || latestLog?.date), log: latestLog };
    const today = buildToday({ dueTasks, reminders });
    const watching = buildWatching(values, scoring, { dueTasks, latestPhoto });
    const snapshot = {
      version: VERSION,
      createdAt: new Date().toISOString(),
      score: scoring.score,
      status,
      values,
      trends,
      trendInsights,
      scoreExplanation,
      penalties: scoring.penalties,
      lastTest,
      today,
      watching,
      inventory,
      counts: { logs: logs.length, actions: actions.length, completed: completed.length, reminders: reminders.length, visualHistory: visualHistory.length },
      latestPhoto,
      dueTasks: dueTasks.slice(0, 10),
      equipmentIntelligence,
      apexBridge,
      recentActions: actions.slice(0, 8),
      recentCompleted: completed.slice(0, 8)
    };
    snapshot.dailyAssistant = buildDailyAssistant(values, scoring, { latestLog, dueTasks, reminders, latestPhoto, equipmentIntelligence, trends, scoreExplanation });
    snapshot.aiContextLines = buildAiContextLines(snapshot);
    return snapshot;
  }

  function getSnapshot(options = {}){
    const now = Date.now();
    if (!options.force && snapshotCache && now - snapshotCache.at < SNAPSHOT_CACHE_MS) return snapshotCache.value;
    const value = buildSnapshot();
    snapshotCache = { at: now, value };
    return value;
  }

  function getScore(){
    const s = getSnapshot();
    return { score:s.score, label:s.status.label, status:s.status, explanation:s.scoreExplanation };
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
    // Keep legacy score helpers aligned with the single Reef Brain score.
    try { window.getReefBrainScore = getScore; } catch(e) {}
    try {
      window.tankDashboardScore = function(){
        const s = getScore();
        return { score:s.score, level:s.label, source:'reef-brain' };
      };
    } catch(e) {}
  }

  window.ReefKeeperBrain = {
    version: VERSION,
    getSnapshot,
    getPlainTextSummary,
    refresh: () => getSnapshot({ force:true }),
    invalidate,
    getScore,
    daysLabel,
    buildTrendAnalysis,
    buildScoreExplanation,
    install
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 50));
  else setTimeout(install, 50);
})();
