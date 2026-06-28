// Reef Keeper v3.9.0 Timeline Intelligence
// Turns the unified timeline into an interpreted reef journal with trends, milestones, and focus summaries.
(function(){
  'use strict';
  const VERSION = '3.9.0';
  const VISUAL_KEY = 'reef_tank_visual_history_v13';
  const ONE_DAY = 86400000;

  function parseArray(key){
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch(e) { return []; }
  }
  function asArray(v){ return Array.isArray(v) ? v : []; }
  function timeOf(value){ const t = new Date(value || 0).getTime(); return Number.isFinite(t) ? t : 0; }
  function daysBetween(a,b){ const ta = timeOf(a); const tb = timeOf(b); if (!ta || !tb) return null; return Math.max(0, Math.round(Math.abs(tb - ta) / ONE_DAY)); }
  function daysAgo(value){ const t = timeOf(value); if (!t) return null; return Math.max(0, Math.floor((Date.now() - t) / ONE_DAY)); }
  function clean(text, max){
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
  function esc(text){
    try { if (typeof escapeHtml === 'function') return escapeHtml(String(text || '')); } catch(e) {}
    return String(text || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function dateLabel(value){
    try { if (typeof memoryLineDate === 'function') return memoryLineDate({ isoDate:value, date:value }); } catch(e) {}
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }
  function monthLabel(value){
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return 'Unknown month';
    return d.toLocaleDateString('en-US', { month:'long', year:'numeric' });
  }
  function dayKey(value){
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const same = (a,b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (same(d, today)) return 'Today';
    if (same(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  }
  function eventId(prefix, item, index){
    return `${prefix}-${item.id || item.imageKey || item.isoDate || item.createdAt || item.completedAt || item.date || index}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  }
  function num(value){ const n = parseFloat(value); return Number.isFinite(n) ? n : null; }
  function trendWord(delta, unit){
    if (delta === null || !Number.isFinite(delta)) return '';
    if (Math.abs(delta) < 0.001) return 'flat';
    return `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(unit === 'dKH' ? 1 : 2)}${unit ? ' ' + unit : ''}`;
  }

  function latestActions(){
    let actions = [];
    try { if (typeof getActionEntries === 'function') actions = actions.concat(getActionEntries() || []); } catch(e) {}
    actions = actions.concat(parseArray('reef_actions'));
    const seen = new Set();
    return actions.filter(a => {
      if (!a) return false;
      const id = a.id || `${a.title || ''}-${a.isoDate || a.date || ''}-${a.notes || ''}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  function completedEntries(){
    let items = [];
    try { if (typeof getCompletedHistoryEntries === 'function') items = items.concat(getCompletedHistoryEntries() || []); } catch(e) {}
    items = items.concat(parseArray('reef_completed_history'));
    const seen = new Set();
    return items.filter(i => {
      if (!i) return false;
      const id = i.id || `${i.title || ''}-${i.completedAt || i.isoDate || i.date || ''}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  function parameterLogs(){
    let logs = [];
    try { if (typeof getDefaultLogs === 'function') logs = logs.concat(getDefaultLogs() || []); } catch(e) {}
    logs = logs.concat(parseArray('reef_logs'));
    const seen = new Set();
    return logs.filter(l => {
      if (!l) return false;
      const id = l.id || `${l.isoDate || l.date || ''}-${l.po4 || ''}-${l.alk || ''}-${l.no3 || ''}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a,b) => timeOf(b.isoDate || b.createdAt || b.date) - timeOf(a.isoDate || a.createdAt || a.date));
  }
  function inventoryItems(){
    try { if (typeof getInventoryItems === 'function') return asArray(getInventoryItems()); } catch(e) {}
    return parseArray('reef_inventory_custom_v2').concat(parseArray('reef_inventory'));
  }
  function equipmentItems(){
    try { if (typeof getEquipmentItems === 'function') return asArray(getEquipmentItems()); } catch(e) {}
    try { if (window.ReefKeeperEquipmentIntel?.getItems) return asArray(window.ReefKeeperEquipmentIntel.getItems()); } catch(e) {}
    return parseArray('reef_equipment_inventory_v1');
  }
  function logSummary(l){
    try { if (typeof buildLogMemoryLine === 'function') return buildLogMemoryLine(l).replace(/^[^:]+:\s*/, ''); } catch(e) {}
    const parts = [];
    if (l.po4) parts.push(`PO₄ ${l.po4}`);
    if (l.alk) parts.push(`Alk ${l.alk}`);
    if (l.no3) parts.push(`NO₃ ${l.no3}`);
    if (l.ca) parts.push(`Ca ${l.ca}`);
    if (l.mg) parts.push(`Mg ${l.mg}`);
    if (l.ph) parts.push(`pH ${l.ph}`);
    return parts.join(', ') || 'Parameter log saved';
  }
  function paramTrendText(log, previous){
    if (!previous) return '';
    const items = [
      ['PO₄', 'po4', 'ppm'],
      ['Alk', 'alk', 'dKH'],
      ['NO₃', 'no3', 'ppm']
    ];
    const parts = [];
    items.forEach(([label, key, unit]) => {
      const a = num(log[key]); const b = num(previous[key]);
      if (a === null || b === null) return;
      const txt = trendWord(a - b, unit);
      if (txt && txt !== 'flat') parts.push(`${label} ${txt}`);
    });
    return parts.length ? `Trend marker: ${parts.slice(0, 3).join(' · ')}` : 'Trend marker: stable versus previous log.';
  }
  function typeMatches(ev, filter){
    if (!filter || filter === 'all') return true;
    if (filter === 'photo') return ev.type === 'photo';
    if (filter === 'livestock') return ev.type === 'livestock' || ev.subtype === 'fish' || ev.subtype === 'coral';
    return ev.type === filter || ev.subtype === filter;
  }

  function buildTimelineEvents(){
    const events = [];
    const paramLogs = parameterLogs();

    parseArray(VISUAL_KEY).forEach((item, i) => {
      events.push({
        id:eventId('photo', item, i), type:'photo', subtype:item.mode || item.category || 'tank', icon:'📸', label:'Photo',
        title:item.title || 'Reef photo',
        text:item.notes || item.trackingNotes || item.summary || 'Visual reef history entry.',
        intelligence:item.timelineComparison || item.growthAssessment || '',
        date:item.createdAt || item.isoDate || item.date,
        imageKey:item.imageKey, imageDataUrl:item.imageDataUrl || item.dataUrl,
        action:'vision'
      });
    });

    paramLogs.forEach((l, i) => {
      const prev = paramLogs[i + 1];
      events.push({ id:eventId('params', l, i), type:'params', icon:'🧪', label:'Parameters', title:'Water test logged', text:logSummary(l), intelligence:paramTrendText(l, prev), date:l.isoDate || l.createdAt || l.date, action:'log' });
    });

    latestActions().forEach((a, i) => {
      const cat = String(a.category || 'maintenance').toLowerCase();
      const hay = `${cat} ${a.title || ''} ${a.notes || ''}`.toLowerCase();
      const isEquipment = /equipment|skimmer|pump|heater|uv|ato|roller|gfo|carbon|reactor|rodi|apex|light/.test(hay);
      const isWaterChange = /water change|changed water|wc\b/.test(hay);
      events.push({
        id:eventId('action', a, i), type:isEquipment ? 'equipment' : 'maintenance', subtype:isWaterChange ? 'water-change' : cat, icon:isEquipment ? '🔧' : '✅', label:isEquipment ? 'Equipment' : 'Maintenance',
        title:a.title || 'Action logged', text:a.notes || cat || 'Maintenance/action logged.', intelligence:isWaterChange ? findAfterParameterChange(a, paramLogs) : '', date:a.isoDate || a.createdAt || a.date, action:'log'
      });
    });

    completedEntries().forEach((h, i) => {
      events.push({ id:eventId('done', h, i), type:'completed', icon:'☑️', label:'Completed', title:`Completed: ${h.title || 'Task'}`, text:h.notes || h.type || 'Completed task.', date:h.completedAt || h.isoDate || h.createdAt || h.date, action:'reminders' });
    });

    inventoryItems().forEach((item, i) => {
      const type = String(item.type || '').toLowerCase();
      const subtype = type === 'fish' ? 'fish' : (type === 'coral' || type === 'anemone' ? 'coral' : 'livestock');
      const added = item.acquiredDate || item.addedDate || item.createdAt;
      if (added) events.push({ id:eventId('livestock', item, i), type:'livestock', subtype, icon:subtype === 'fish' ? '🐠' : '🪸', label:subtype === 'fish' ? 'Fish' : 'Coral', title:item.name || 'Livestock added', text:[item.type, item.status, item.notes].filter(Boolean).join(' · ') || 'Inventory entry.', date:added, action:subtype === 'fish' ? 'fish' : 'coral' });
      asArray(item.photoAnalyses).forEach((p, j) => {
        events.push({ id:eventId('analysis', p, `${i}-${j}`), type:'photo', subtype, icon:'🔎', label:subtype === 'fish' ? 'Fish Vision' : 'Coral Vision', title:`${item.name || 'Livestock'} analysis`, text:p.trackingNotes || p.growthAssessment || p.healthStatus || 'Photo analysis saved.', intelligence:p.timelineComparison || p.estimatedGrowthPercent || '', date:p.createdAt || p.isoDate || p.date, imageDataUrl:p.imageDataUrl, imageKey:p.imageKey, action:subtype === 'fish' ? 'fish' : 'coral' });
      });
    });

    equipmentItems().forEach((item, i) => {
      const serviced = item.lastServiceAt || item.serviceDate;
      const title = `Serviced ${item.name || 'equipment'}`;
      if (serviced) events.push({ id:eventId('equipment-service', item, i), type:'equipment', icon:'🔧', label:'Equipment', title, text:[item.category, item.brand, item.model].filter(Boolean).join(' · ') || 'Equipment service logged.', intelligence:equipmentServiceInsight(item), date:serviced, action:'equipment' });
      asArray(item.serviceHistory).forEach((s, j) => {
        events.push({ id:eventId('equipment-history', s, `${i}-${j}`), type:'equipment', icon:'🔧', label:'Equipment', title:`${item.name || 'Equipment'} service`, text:s.notes || s.type || 'Service logged.', date:s.isoDate || s.date || s.createdAt, action:'equipment' });
      });
    });

    const seen = new Set();
    return events.filter(ev => {
      if (!ev || !timeOf(ev.date)) return false;
      const key = `${ev.type}|${ev.subtype || ''}|${ev.title}|${ev.date}|${ev.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => timeOf(b.date) - timeOf(a.date));
  }

  function findAfterParameterChange(action, logs){
    const actionTime = timeOf(action.isoDate || action.createdAt || action.date);
    if (!actionTime || !logs.length) return '';
    const after = [...logs].filter(l => timeOf(l.isoDate || l.createdAt || l.date) >= actionTime).sort((a,b) => timeOf(a.isoDate || a.createdAt || a.date) - timeOf(b.isoDate || b.createdAt || b.date))[0];
    const before = [...logs].filter(l => timeOf(l.isoDate || l.createdAt || l.date) < actionTime).sort((a,b) => timeOf(b.isoDate || b.createdAt || b.date) - timeOf(a.isoDate || a.createdAt || a.date))[0];
    if (!after || !before) return '';
    const po4a = num(after.po4); const po4b = num(before.po4);
    const alka = num(after.alk); const alkb = num(before.alk);
    const pieces = [];
    if (po4a !== null && po4b !== null) pieces.push(`PO₄ ${trendWord(po4a - po4b, 'ppm')}`);
    if (alka !== null && alkb !== null) pieces.push(`Alk ${trendWord(alka - alkb, 'dKH')}`);
    return pieces.length ? `After-effect marker: ${pieces.join(' · ')} at next test.` : '';
  }

  function equipmentServiceInsight(item){
    const interval = num(item.serviceIntervalDays || item.intervalDays || item.recommendedIntervalDays);
    const last = item.lastServiceAt || item.serviceDate;
    const age = daysAgo(last);
    if (interval && age !== null) {
      const left = Math.round(interval - age);
      if (left < 0) return `Service intelligence: ${Math.abs(left)} days past ${interval}-day interval.`;
      if (left <= 7) return `Service intelligence: due in about ${left} day${left === 1 ? '' : 's'}.`;
      return `Service intelligence: about ${left} days until typical interval.`;
    }
    if (age !== null) return `Service intelligence: last serviced ${age} days ago.`;
    return '';
  }

  async function imageForEvent(ev){
    if (ev.imageDataUrl) return ev.imageDataUrl;
    if (!ev.imageKey) return '';
    try { if (typeof getInventoryPhotoData === 'function') return await getInventoryPhotoData(ev.imageKey); } catch(e) {}
    return '';
  }

  function actionForEvent(ev){
    if (ev.action === 'log') return `showWorkspace('log')`;
    if (ev.action === 'reminders') return `showWorkspace('reminders')`;
    if (ev.action === 'vision') return `showWorkspace('vision')`;
    if (ev.action === 'equipment') return `openLongTermTool('equipment')`;
    if (ev.action === 'fish') return `openLivestockCatalog('fish')`;
    if (ev.action === 'coral') return `openLivestockCatalog('coral')`;
    return '';
  }

  function eventMatchesSearch(ev, search){
    if (!search) return true;
    return `${ev.title} ${ev.text} ${ev.intelligence || ''} ${ev.label} ${ev.type} ${ev.subtype || ''}`.toLowerCase().includes(search);
  }

  function buildFocusSummary(events){
    const last30 = events.filter(ev => daysAgo(ev.date) !== null && daysAgo(ev.date) <= 30);
    const count = type => last30.filter(ev => ev.type === type || ev.subtype === type).length;
    const photos = count('photo');
    const params = count('params');
    const maintenance = count('maintenance') + count('completed');
    const equipment = count('equipment');
    const livestock = count('livestock') + count('fish') + count('coral');
    const active = [
      { label:'Photos', value:photos, icon:'📸' },
      { label:'Tests', value:params, icon:'🧪' },
      { label:'Maintenance', value:maintenance, icon:'✅' },
      { label:'Equipment', value:equipment, icon:'🔧' },
      { label:'Livestock', value:livestock, icon:'🐠' }
    ].sort((a,b) => b.value - a.value);
    const lead = active[0]?.value ? `${active[0].label} has been the most active area in the last 30 days.` : 'Start logging photos, tests, and maintenance to build intelligence.';
    return { photos, params, maintenance, equipment, livestock, lead, active };
  }

  function buildParameterInsight(){
    const logs = parameterLogs();
    if (logs.length < 2) return { title:'Parameter trends', detail:'Add at least two water tests to unlock trend markers.', status:'baseline' };
    const latest = logs[0];
    const previous = logs[1];
    const markers = [];
    [['PO₄','po4','ppm'],['Alk','alk','dKH'],['NO₃','no3','ppm']].forEach(([label,key,unit]) => {
      const a = num(latest[key]); const b = num(previous[key]);
      if (a === null || b === null) return;
      const delta = a - b;
      const txt = trendWord(delta, unit);
      if (txt) markers.push(`${label} ${txt}`);
    });
    return { title:'Parameter trends', detail:markers.length ? markers.join(' · ') : 'Latest test is stable against prior log.', status:'trend' };
  }

  function buildPhotoInsight(events){
    const photos = events.filter(ev => ev.type === 'photo').sort((a,b) => timeOf(b.date) - timeOf(a.date));
    if (!photos.length) return { title:'Photo comparison', detail:'No reef photos saved yet. Add a full-tank photo to start comparisons.', status:'baseline' };
    if (photos.length === 1) return { title:'Photo comparison', detail:'First photo saved. Add another photo later to compare progress.', status:'baseline' };
    const gap = daysBetween(photos[0].date, photos[1].date);
    const compare = photos[0].intelligence || photos[0].text || 'Use the newest two photos to compare algae, coral extension, and placement changes.';
    return { title:'Photo comparison', detail:`Newest photo is ${gap} day${gap === 1 ? '' : 's'} after the previous one. ${clean(compare, 120)}`, status:'compare' };
  }

  function buildMonthlySummary(events){
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthEvents = events.filter(ev => {
      const d = new Date(ev.date || 0);
      return !Number.isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    if (!monthEvents.length) return 'No events logged yet this month.';
    const counts = monthEvents.reduce((acc, ev) => { acc[ev.type] = (acc[ev.type] || 0) + 1; return acc; }, {});
    const pieces = [];
    if (counts.params) pieces.push(`${counts.params} water test${counts.params === 1 ? '' : 's'}`);
    if (counts.photo) pieces.push(`${counts.photo} photo${counts.photo === 1 ? '' : 's'}`);
    if (counts.maintenance) pieces.push(`${counts.maintenance} maintenance log${counts.maintenance === 1 ? '' : 's'}`);
    if (counts.equipment) pieces.push(`${counts.equipment} equipment event${counts.equipment === 1 ? '' : 's'}`);
    if (counts.completed) pieces.push(`${counts.completed} completed task${counts.completed === 1 ? '' : 's'}`);
    return `${monthLabel(now)}: ${pieces.length ? pieces.join(', ') : `${monthEvents.length} reef event${monthEvents.length === 1 ? '' : 's'}`} recorded.`;
  }

  function buildMilestones(events){
    const milestones = [];
    const tankStart = new Date('2023-12-24T12:00:00');
    const ageDays = Math.floor((Date.now() - tankStart.getTime()) / ONE_DAY);
    if (ageDays > 0) milestones.push({ icon:'🎂', title:'Tank age', detail:`${Math.floor(ageDays / 365)} year${Math.floor(ageDays / 365) === 1 ? '' : 's'} and ${ageDays % 365} days since setup.` });
    const waterTests = events.filter(e => e.type === 'params').length;
    const photos = events.filter(e => e.type === 'photo').length;
    const maintenance = events.filter(e => e.type === 'maintenance' || e.type === 'completed').length;
    if (waterTests) milestones.push({ icon:'🧪', title:'Water-test history', detail:`${waterTests} logged test${waterTests === 1 ? '' : 's'} in the timeline.` });
    if (photos) milestones.push({ icon:'📸', title:'Photo history', detail:`${photos} saved reef photo${photos === 1 ? '' : 's'} or AI Vision entr${photos === 1 ? 'y' : 'ies'}.` });
    if (maintenance) milestones.push({ icon:'✅', title:'Maintenance record', detail:`${maintenance} maintenance/completed task event${maintenance === 1 ? '' : 's'} recorded.` });
    const next = [];
    if (waterTests < 25) next.push(`${25 - waterTests} more tests to 25`);
    else if (waterTests < 50) next.push(`${50 - waterTests} more tests to 50`);
    if (photos < 10) next.push(`${10 - photos} more photos to 10`);
    if (next.length) milestones.push({ icon:'🏁', title:'Next milestone', detail:next.slice(0,2).join(' · ') });
    return milestones.slice(0, 4);
  }

  function renderTimelineIntelligence(events){
    const panel = document.getElementById('reef-timeline-intelligence');
    if (!panel) return;
    const focus = buildFocusSummary(events);
    const param = buildParameterInsight();
    const photo = buildPhotoInsight(events);
    const monthly = buildMonthlySummary(events);
    panel.innerHTML = `
      <div class="timeline-intel-head">
        <div><strong>Timeline Intelligence</strong><span>${esc(focus.lead)}</span></div>
        <button type="button" onclick="ReefKeeperTimeline.render()">Refresh</button>
      </div>
      <div class="timeline-intel-grid">
        <div class="timeline-intel-card"><b>📊 ${esc(param.title)}</b><span>${esc(param.detail)}</span></div>
        <div class="timeline-intel-card"><b>📷 ${esc(photo.title)}</b><span>${esc(photo.detail)}</span></div>
        <div class="timeline-intel-card"><b>🗓️ Monthly summary</b><span>${esc(monthly)}</span></div>
      </div>`;

    const milestones = document.getElementById('reef-timeline-milestones');
    if (milestones) {
      const items = buildMilestones(events);
      milestones.innerHTML = items.length ? items.map(m => `<div class="timeline-milestone"><span>${esc(m.icon)}</span><div><strong>${esc(m.title)}</strong><small>${esc(m.detail)}</small></div></div>`).join('') : '';
    }
  }

  async function renderUnifiedTimeline(){
    const el = document.getElementById('tank-history-list');
    if (!el) return;
    const search = String(document.getElementById('reef-timeline-search')?.value || '').trim().toLowerCase();
    const filter = String(document.getElementById('reef-timeline-filter')?.value || 'all').toLowerCase();
    const allEvents = buildTimelineEvents();
    renderTimelineIntelligence(allEvents);
    let events = allEvents.filter(ev => typeMatches(ev, filter));
    if (search) events = events.filter(ev => eventMatchesSearch(ev, search));
    events = events.slice(0, 140);

    const countEl = document.getElementById('reef-timeline-count');
    if (countEl) countEl.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;

    if (!events.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-emoji">🧭</div>No timeline entries found yet. Log a water test, maintenance action, livestock note, or AI Vision photo.</div>';
      return;
    }

    const html = [];
    let currentDay = '';
    for (const ev of events) {
      const group = dayKey(ev.date);
      if (group !== currentDay) {
        currentDay = group;
        html.push(`<div class="reef-timeline-day">${esc(group)}</div>`);
      }
      const img = await imageForEvent(ev);
      const click = actionForEvent(ev);
      const clickAttrs = click ? ` role="button" tabindex="0" onclick="${click}"` : '';
      const intel = ev.intelligence ? `<div class="timeline-intelligence-note">${esc(clean(ev.intelligence, 220))}</div>` : '';
      html.push(`<div class="timeline-entry reef-timeline-entry type-${esc(ev.type)} subtype-${esc(ev.subtype || 'none')}"${clickAttrs}>
        <div class="timeline-entry-photo">${img ? `<img src="${esc(img)}" alt="${esc(ev.title)}">` : esc(ev.icon)}</div>
        <div class="reef-timeline-main">
          <div class="timeline-entry-title">${esc(ev.title)}</div>
          <div class="timeline-entry-meta">${esc(dateLabel(ev.date))} · ${esc(ev.label)}</div>
          <div class="timeline-entry-text">${esc(clean(ev.text || '', 260))}</div>
          ${intel}
        </div>
      </div>`);
    }
    el.innerHTML = html.join('');
  }

  function renderRecentChangesFromTimeline(){
    const el = document.getElementById('recent-changes-home');
    if (!el) return;
    const events = buildTimelineEvents().slice(0, 5);
    if (!events.length) { el.innerHTML = '<div class="what-changed-empty">No recent changes logged yet.</div>'; return; }
    el.innerHTML = events.map(ev => `<div class="recent-change-item" onclick="openLongTermTool('tankhistory')" role="button" tabindex="0">
      <div class="recent-change-icon">${esc(ev.icon)}</div>
      <div><div class="recent-change-title">${esc(ev.title)}</div><div class="recent-change-meta">${esc(dateLabel(ev.date))} · ${esc(ev.label)}</div>${ev.intelligence ? `<div class="recent-change-note">${esc(clean(ev.intelligence, 90))}</div>` : ''}</div>
    </div>`).join('');
  }

  function getCoralHistory(name){
    const q = String(name || '').toLowerCase();
    return buildTimelineEvents().filter(ev => (ev.subtype === 'coral' || ev.type === 'photo') && (!q || `${ev.title} ${ev.text}`.toLowerCase().includes(q)));
  }
  function getFishHistory(name){
    const q = String(name || '').toLowerCase();
    return buildTimelineEvents().filter(ev => ev.subtype === 'fish' && (!q || `${ev.title} ${ev.text}`.toLowerCase().includes(q)));
  }
  function getEquipmentHistory(name){
    const q = String(name || '').toLowerCase();
    return buildTimelineEvents().filter(ev => ev.type === 'equipment' && (!q || `${ev.title} ${ev.text}`.toLowerCase().includes(q)));
  }

  function install(){
    window.ReefKeeperTimeline = {
      version:VERSION,
      getEvents:buildTimelineEvents,
      render:renderUnifiedTimeline,
      renderRecent:renderRecentChangesFromTimeline,
      getCoralHistory,
      getFishHistory,
      getEquipmentHistory,
      getMilestones:() => buildMilestones(buildTimelineEvents())
    };
    window.renderTankHistory = renderUnifiedTimeline;
    window.renderRecentChangesHome = renderRecentChangesFromTimeline;
    const oldOpen = window.openLongTermTool;
    if (typeof oldOpen === 'function' && !oldOpen.__timelineWrapped) {
      const wrapped = function(tool){
        const result = oldOpen.apply(this, arguments);
        if (tool === 'tankhistory') setTimeout(renderUnifiedTimeline, 80);
        return result;
      };
      wrapped.__timelineWrapped = true;
      window.openLongTermTool = wrapped;
    }
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => { try { renderRecentChangesFromTimeline(); } catch(e) {} }, 350);
    });
  }
  install();
})();
