// Reef Keeper v3.8.0 Reef Timeline
// Builds one chronological reef memory feed from existing local data.
(function(){
  'use strict';
  const VERSION = '3.8.0';
  const VISUAL_KEY = 'reef_tank_visual_history_v13';

  function parseArray(key){
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch(e) { return []; }
  }
  function asArray(v){ return Array.isArray(v) ? v : []; }
  function timeOf(value){ const t = new Date(value || 0).getTime(); return Number.isFinite(t) ? t : 0; }
  function newest(a,b){ return timeOf(b.isoDate || b.createdAt || b.completedAt || b.date) - timeOf(a.isoDate || a.createdAt || a.completedAt || a.date); }
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
    });
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
  function typeMatches(ev, filter){ return !filter || filter === 'all' || ev.type === filter; }

  function buildTimelineEvents(){
    const events = [];

    parseArray(VISUAL_KEY).forEach((item, i) => {
      events.push({
        id:eventId('photo', item, i), type:'photo', icon:'📸', label:'Photo',
        title:item.title || 'Reef photo',
        text:item.notes || item.trackingNotes || 'Visual reef history entry.',
        date:item.createdAt || item.isoDate || item.date,
        imageKey:item.imageKey, imageDataUrl:item.imageDataUrl || item.dataUrl,
        action:'vision'
      });
    });

    parameterLogs().forEach((l, i) => {
      events.push({ id:eventId('params', l, i), type:'params', icon:'🧪', label:'Parameters', title:'Water test logged', text:logSummary(l), date:l.isoDate || l.createdAt || l.date, action:'log' });
    });

    latestActions().forEach((a, i) => {
      const cat = String(a.category || 'maintenance').toLowerCase();
      const isEquipment = /equipment|skimmer|pump|heater|uv|ato|roller|gfo|carbon|reactor|rodi|apex|light/.test(`${cat} ${a.title || ''} ${a.notes || ''}`.toLowerCase());
      events.push({
        id:eventId('action', a, i), type:isEquipment ? 'equipment' : 'maintenance', icon:isEquipment ? '🔧' : '✅', label:isEquipment ? 'Equipment' : 'Maintenance',
        title:a.title || 'Action logged', text:a.notes || cat || 'Maintenance/action logged.', date:a.isoDate || a.createdAt || a.date, action:'log'
      });
    });

    completedEntries().forEach((h, i) => {
      events.push({ id:eventId('done', h, i), type:'completed', icon:'☑️', label:'Completed', title:`Completed: ${h.title || 'Task'}`, text:h.notes || h.type || 'Completed task.', date:h.completedAt || h.isoDate || h.createdAt || h.date, action:'reminders' });
    });

    inventoryItems().forEach((item, i) => {
      const added = item.acquiredDate || item.addedDate || item.createdAt;
      if (added) events.push({ id:eventId('livestock', item, i), type:'livestock', icon:String(item.type || '').toLowerCase() === 'fish' ? '🐠' : '🪸', label:'Livestock', title:item.name || 'Livestock added', text:[item.type, item.status, item.notes].filter(Boolean).join(' · ') || 'Inventory entry.', date:added, action:String(item.type || '').toLowerCase() === 'fish' ? 'fish' : 'coral' });
      asArray(item.photoAnalyses).forEach((p, j) => {
        events.push({ id:eventId('analysis', p, `${i}-${j}`), type:'photo', icon:'🔎', label:'AI Vision', title:`${item.name || 'Livestock'} analysis`, text:p.trackingNotes || p.growthAssessment || p.healthStatus || 'Photo analysis saved.', date:p.createdAt || p.isoDate || p.date, imageDataUrl:p.imageDataUrl, imageKey:p.imageKey, action:String(item.type || '').toLowerCase() === 'fish' ? 'fish' : 'coral' });
      });
    });

    equipmentItems().forEach((item, i) => {
      const serviced = item.lastServiceAt || item.serviceDate;
      if (serviced) events.push({ id:eventId('equipment-service', item, i), type:'equipment', icon:'🔧', label:'Equipment', title:`Serviced ${item.name || 'equipment'}`, text:[item.category, item.brand, item.model].filter(Boolean).join(' · ') || 'Equipment service logged.', date:serviced, action:'equipment' });
    });

    const seen = new Set();
    return events.filter(ev => {
      if (!ev || !timeOf(ev.date)) return false;
      const key = `${ev.type}|${ev.title}|${ev.date}|${ev.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => timeOf(b.date) - timeOf(a.date));
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

  async function renderUnifiedTimeline(){
    const el = document.getElementById('tank-history-list');
    if (!el) return;
    const search = String(document.getElementById('reef-timeline-search')?.value || '').trim().toLowerCase();
    const filter = String(document.getElementById('reef-timeline-filter')?.value || 'all').toLowerCase();
    let events = buildTimelineEvents().filter(ev => typeMatches(ev, filter));
    if (search) events = events.filter(ev => `${ev.title} ${ev.text} ${ev.label} ${ev.type}`.toLowerCase().includes(search));
    events = events.slice(0, 120);

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
      html.push(`<div class="timeline-entry reef-timeline-entry type-${esc(ev.type)}"${clickAttrs}>
        <div class="timeline-entry-photo">${img ? `<img src="${esc(img)}" alt="${esc(ev.title)}">` : esc(ev.icon)}</div>
        <div class="reef-timeline-main">
          <div class="timeline-entry-title">${esc(ev.title)}</div>
          <div class="timeline-entry-meta">${esc(dateLabel(ev.date))} · ${esc(ev.label)}</div>
          <div class="timeline-entry-text">${esc(clean(ev.text || '', 260))}</div>
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
      <div><div class="recent-change-title">${esc(ev.title)}</div><div class="recent-change-meta">${esc(dateLabel(ev.date))} · ${esc(ev.label)}</div></div>
    </div>`).join('');
  }

  function install(){
    window.ReefKeeperTimeline = { version:VERSION, getEvents:buildTimelineEvents, render:renderUnifiedTimeline, renderRecent:renderRecentChangesFromTimeline };
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
