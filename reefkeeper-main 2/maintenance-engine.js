// Reef Keeper v22 Maintenance Engine
// Purpose: convert logged maintenance/actions into due-date tasks for reminders, dashboard context, and Days-Off Planner.
(function(){
  'use strict';
  const ENGINE_KEY = 'reef_maintenance_engine_v1';
  const MIGRATION_KEY = 'reef_maintenance_engine_backfilled_v1';

  function nowIso(){ return new Date().toISOString(); }
  function safeParse(key, fallback){ try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function safeWrite(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){} }
  function daysBetween(a,b){ const da = new Date(a).getTime(); const db = new Date(b).getTime(); if (!Number.isFinite(da) || !Number.isFinite(db)) return null; return Math.floor((db-da)/86400000); }
  function addDays(iso, days){ const d = new Date(iso || Date.now()); d.setDate(d.getDate() + Number(days || 0)); return d.toISOString(); }
  function normalize(text){ return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function uidPart(text){ return normalize(text).replace(/\s+/g,'-').slice(0,64) || 'item'; }

  const RULES = [
    { id:'water-change', title:'Water Change', intervalDays:14, priority:'soon', emoji:'💧', match:/\b(water change|changed water|wc\b|mix saltwater|fritz rpm)\b/i, detail:'Due based on your last logged water change.' },
    { id:'test-alk-po4', title:'Test Alk & Phosphate', intervalDays:4, priority:'urgent', emoji:'🧪', match:/\b(test|tested|testing)\b.*\b(alk|alkalinity|phosphate|po4)\b|\b(alk|phosphate|po4)\b.*\b(test|tested|testing)\b/i, detail:'Due based on your last logged Alk/PO₄ test.' },
    { id:'full-parameter-test', title:'Full Parameter Test', intervalDays:14, priority:'soon', emoji:'🧪', match:/\b(full parameter|all parameter|tested all|alk.*ca.*mg|ca.*mg.*no3|nitrate.*phosphate.*alk)\b/i, detail:'Due based on your last full parameter check.' },
    { id:'clean-skimmer-cup', title:'Clean Skimmer Cup', intervalDays:7, priority:'normal', emoji:'🧼', match:/\b(skimmer cup|cleaned cup|empty skimmer|emptied skimmer|neck clean|cleaned skimmer neck)\b/i, detail:'Due based on your last skimmer cup/neck cleaning.' },
    { id:'deep-clean-skimmer', title:'Deep Clean Skimmer Pump', intervalDays:90, priority:'normal', emoji:'🔧', match:/\b(deep clean.*skimmer|skimmer pump|cleaned skimmer pump|serviced skimmer|simplicit[y]? 240)\b/i, detail:'Due based on your last skimmer pump service.' },
    { id:'replace-carbon', title:'Replace Carbon', intervalDays:30, priority:'normal', emoji:'♻️', match:/\b(carbon|rox|rox 0 8)\b.*\b(replace|changed|add|added|new|swap|swapped)\b|\b(replace|changed|added|new|swap|swapped)\b.*\b(carbon|rox|rox 0 8)\b/i, detail:'Due based on your last carbon replacement.' },
    { id:'replace-gfo', title:'Replace GFO Media', intervalDays:42, priority:'normal', emoji:'🔬', match:/\b(gfo|phosphate media|reactor media)\b.*\b(replace|changed|add|added|new|swap|swapped)\b|\b(replace|changed|added|new|swap|swapped)\b.*\b(gfo|phosphate media)\b/i, detail:'Due based on your last GFO/media replacement.' },
    { id:'clean-filter-roller', title:'Check/Clean Filter Roller', intervalDays:30, priority:'normal', emoji:'🧻', match:/\b(filter roller|roller mat|bubble magus roller|changed fleece|roller fleece)\b/i, detail:'Due based on your last filter roller check/service.' },
    { id:'clean-flow-pumps', title:'Clean Flow Pumps / Wet Sides', intervalDays:60, priority:'normal', emoji:'🌊', match:/\b(mp40|wet side|powerhead|flow pump|jebao dmp|dmp20)\b.*\b(clean|service|serviced|vinegar|citric)\b|\b(clean|serviced|service)\b.*\b(mp40|wet side|powerhead|flow pump|dmp20)\b/i, detail:'Due based on your last flow-pump service.' },
    { id:'clean-return-pumps', title:'Service Return Pumps', intervalDays:90, priority:'normal', emoji:'🔁', match:/\b(return pump|mdp smart|jebao mdp|mdp)\b.*\b(clean|service|serviced|impeller)\b|\b(clean|serviced|service)\b.*\b(return pump|jebao mdp|mdp)\b/i, detail:'Due based on your last return-pump service.' },
    { id:'check-heaters', title:'Inspect Heaters', intervalDays:30, priority:'soon', emoji:'🌡️', match:/\b(heater|hygger|temperature probe|temp probe)\b.*\b(check|inspect|clean|tested|test)\b|\b(check|inspect|clean|tested|test)\b.*\b(heater|hygger|temperature probe|temp probe)\b/i, detail:'Due based on your last heater/temperature safety check.' },
    { id:'clean-ato-sensor', title:'Clean ATO Sensor & Reservoir', intervalDays:30, priority:'normal', emoji:'💦', match:/\b(ato|auto top off|top off|useek)\b.*\b(clean|inspect|service|sensor|reservoir)\b|\b(clean|inspect|service)\b.*\b(ato|auto top off|top off|useek)\b/i, detail:'Due based on your last ATO inspection/service.' },
    { id:'uv-service', title:'Inspect UV Sterilizer', intervalDays:90, priority:'normal', emoji:'💡', match:/\b(uv|icecap uv|sterilizer)\b.*\b(clean|inspect|service|quartz|bulb|lamp)\b|\b(clean|inspect|service|changed bulb|replace bulb)\b.*\b(uv|sterilizer)\b/i, detail:'Due based on your last UV inspection/service.' },
    { id:'replace-uv-bulb', title:'Replace UV Bulb', intervalDays:365, priority:'normal', emoji:'💡', match:/\b(uv bulb|uv lamp)\b.*\b(replace|changed|new)\b|\b(replace|changed|new)\b.*\b(uv bulb|uv lamp)\b/i, detail:'Due based on your last UV bulb replacement.' },
    { id:'check-rodi', title:'Check RODI TDS / Filters', intervalDays:30, priority:'normal', emoji:'🚰', match:/\b(rodi|r o d i|tds|di resin|sediment filter|carbon block)\b/i, detail:'Due based on your last RODI/TDS check.' },
    { id:'calibrate-probes', title:'Calibrate / Check Probes', intervalDays:90, priority:'normal', emoji:'📈', match:/\b(calibrate|calibrated|probe|ph probe|orp probe|apex probe)\b/i, detail:'Due based on your last probe calibration/check.' },
    { id:'aiptasia-followup', title:'Aiptasia Follow-up Inspection', intervalDays:14, priority:'soon', emoji:'🪸', match:/\b(aiptasia|aiptasia x|berghia)\b/i, detail:'Due based on your last aiptasia treatment/inspection.' }
  ];

  function getEngine(){
    const data = safeParse(ENGINE_KEY, { records:{}, updatedAt: nowIso() });
    if (!data.records || typeof data.records !== 'object') data.records = {};
    return data;
  }
  function setEngine(data){ data.updatedAt = nowIso(); safeWrite(ENGINE_KEY, data); try { window.ReefKeeperStorage?.mirrorKeyToDb?.(ENGINE_KEY, 'data.maintenanceEngine'); } catch(e){} return data; }

  function inferRuleFromText(title, notes, category){
    const text = `${title || ''} ${notes || ''}`;
    const lower = normalize(text);
    // Prefer explicit equipment service interval when Equipment Manager logs it.
    const intervalMatch = String(notes || '').match(/interval\s+(\d+)\s+days?/i);
    if (/^serviced\s+/i.test(String(title || '')) && intervalMatch) {
      const equipmentName = String(title || '').replace(/^serviced\s+/i,'').trim() || 'Equipment';
      return { id:`equipment-${uidPart(equipmentName)}`, title:`Service ${equipmentName}`, intervalDays: Math.max(1, Number(intervalMatch[1])), priority:'normal', emoji:'🔧', detail:`Due based on the maintenance interval for ${equipmentName}.` };
    }
    const found = RULES.find(rule => rule.match.test(text));
    if (found) return found;
    if (category === 'equipment' || /\b(service|serviced|cleaned|inspect|inspection)\b/.test(lower) && /\b(pump|skimmer|uv|heater|ato|roller|reactor|apex|light|equipment)\b/.test(lower)) {
      return { id:`equipment-${uidPart(title || notes || 'equipment')}`, title:`Follow up: ${String(title || 'Equipment service').slice(0,70)}`, intervalDays:90, priority:'normal', emoji:'🔧', detail:'Due based on your last equipment-related maintenance log.' };
    }
    return null;
  }

  function recordCompletion({ title, notes, category, completedAt, source, sourceId, explicitRule }){
    const rule = explicitRule || inferRuleFromText(title, notes, category);
    if (!rule) return null;
    const doneAt = completedAt || nowIso();
    const record = {
      id: rule.id,
      title: rule.title,
      intervalDays: Number(rule.intervalDays || 30),
      priority: rule.priority || 'normal',
      emoji: rule.emoji || '✅',
      detail: rule.detail || `Due every ${rule.intervalDays || 30} days.`,
      lastCompletedAt: doneAt,
      nextDueAt: addDays(doneAt, rule.intervalDays || 30),
      source: source || 'Action History',
      sourceId: sourceId || '',
      lastText: [title, notes].filter(Boolean).join(' · ').slice(0, 240),
      updatedAt: nowIso()
    };
    const data = getEngine();
    data.records[record.id] = { ...(data.records[record.id] || {}), ...record };
    setEngine(data);
    return record;
  }

  function backfill(){
    try {
      const already = localStorage.getItem(MIGRATION_KEY);
      if (already === 'done') return;
      const actions = Array.isArray(window.getActionEntries?.()) ? window.getActionEntries() : safeParse('reef_actions', []);
      actions.slice().reverse().forEach(a => recordCompletion({ title:a.title, notes:a.notes, category:a.category, completedAt:a.isoDate || a.date, source:'Action History', sourceId:a.id }));
      const completed = Array.isArray(window.getCompletedHistory?.()) ? window.getCompletedHistory() : safeParse('reef_completed_history', []);
      completed.slice().reverse().forEach(h => recordCompletion({ title:h.title, notes:h.notes, category:h.type || h.source, completedAt:h.completedAt || h.isoDate || h.date, source:h.source || 'Completed History', sourceId:h.id || h.sourceId }));
      localStorage.setItem(MIGRATION_KEY, 'done');
    } catch(e) { console.warn('Maintenance Engine backfill failed', e); }
  }

  function taskFromRecord(record, options={}){
    const today = new Date();
    const due = new Date(record.nextDueAt || 0);
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    const overdue = daysUntil < 0;
    const dueSoon = daysUntil <= Number(options.windowDays ?? 14);
    if (!dueSoon) return null;
    const when = overdue ? `${Math.abs(daysUntil)} day${Math.abs(daysUntil)===1?'':'s'} overdue` : daysUntil === 0 ? 'Due today' : `Due in ${daysUntil} day${daysUntil===1?'':'s'}`;
    return {
      id: `maintenance:${record.id}`,
      title: `${record.emoji || '✅'} ${record.title}`,
      detail: `${when}. ${record.detail || ''} Last done: ${formatDate(record.lastCompletedAt)}.`,
      scheduledDay: null,
      maintenanceRecord: record,
      source: 'Maintenance Engine'
    };
  }
  function formatDate(raw){ const d = new Date(raw); return raw && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) : 'unknown'; }

  function getDueTasks(options={}){
    backfill();
    const records = Object.values(getEngine().records || {});
    return records.map(r => taskFromRecord(r, options)).filter(Boolean).sort((a,b) => new Date(a.maintenanceRecord.nextDueAt) - new Date(b.maintenanceRecord.nextDueAt));
  }

  function getSummaryLines(){
    backfill();
    const records = Object.values(getEngine().records || {}).sort((a,b) => new Date(a.nextDueAt || 0) - new Date(b.nextDueAt || 0));
    if (!records.length) return ['No maintenance interval records yet. Log maintenance/actions to start building due dates.'];
    return records.slice(0, 30).map(r => `${r.title}: last ${formatDate(r.lastCompletedAt)}, next due ${formatDate(r.nextDueAt)}, interval ${r.intervalDays} days.`);
  }

  function markTaskCompleteByText(text, meta={}){
    return recordCompletion({ title:text, notes:meta.notes || '', category:meta.category || 'maintenance', completedAt:meta.completedAt || nowIso(), source:meta.source || 'Task Completion', sourceId:meta.sourceId || '' });
  }

  function installWrappers(){
    backfill();

    const oldSaveActionEntry = window.saveActionEntry;
    if (typeof oldSaveActionEntry === 'function' && !oldSaveActionEntry.__maintenanceWrapped) {
      const wrapped = function(){
        const title = document.getElementById('action-title')?.value?.trim() || '';
        const category = document.getElementById('action-category')?.value || 'other';
        const notes = document.getElementById('action-notes')?.value?.trim() || '';
        const result = oldSaveActionEntry.apply(this, arguments);
        if (title) {
          const rec = recordCompletion({ title, notes, category, completedAt: nowIso(), source:'Action History' });
          if (rec) try { console.log('Maintenance Engine updated', rec); } catch(e){}
        }
        try { window.renderReminderCenter?.(); window.renderDaysOffWorkPlan?.(); window.renderSmartTankDashboard?.(); } catch(e){}
        return result;
      };
      wrapped.__maintenanceWrapped = true;
      window.saveActionEntry = wrapped;
    }

    const oldRecordEquipmentService = window.recordEquipmentService;
    if (typeof oldRecordEquipmentService === 'function' && !oldRecordEquipmentService.__maintenanceWrapped) {
      const wrapped = function(id){
        let item = null;
        try { item = window.getEquipmentItems?.().find(i => i.id === id); } catch(e){}
        const result = oldRecordEquipmentService.apply(this, arguments);
        if (item) {
          const interval = Number(item.maintenanceDays || 90);
          recordCompletion({
            title:`Serviced ${item.name}`,
            notes:`${item.category || 'Equipment'} · interval ${interval} days`,
            category:'equipment',
            completedAt: nowIso(),
            source:'Equipment Manager',
            sourceId:id,
            explicitRule:{ id:`equipment-${id}`, title:`Service ${item.name}`, intervalDays: interval, priority:'normal', emoji:'🔧', detail:`Due based on the ${interval}-day interval saved for ${item.name}.` }
          });
        }
        try { window.renderReminderCenter?.(); window.renderDaysOffWorkPlan?.(); window.renderSmartTankDashboard?.(); } catch(e){}
        return result;
      };
      wrapped.__maintenanceWrapped = true;
      window.recordEquipmentService = wrapped;
    }

    const oldGetAllActive = window.getAllActiveReefTasksForPlanning;
    if (typeof oldGetAllActive === 'function' && !oldGetAllActive.__maintenanceWrapped) {
      const wrapped = function(){
        const base = oldGetAllActive.apply(this, arguments) || [];
        const existingText = new Set(base.map(t => normalize(`${t.title || ''} ${t.detail || ''}`)));
        const due = getDueTasks({ windowDays: 21 }).filter(t => {
          const text = normalize(`${t.title || ''} ${t.detail || ''}`);
          return !Array.from(existingText).some(existing => existing.includes(normalize(t.maintenanceRecord.title)) || text.includes(existing.slice(0,30)));
        });
        return [...base, ...due].slice(0, 40);
      };
      wrapped.__maintenanceWrapped = true;
      window.getAllActiveReefTasksForPlanning = wrapped;
    }

    const oldContext = window.getCurrentPlanPromptContext;
    if (typeof oldContext === 'function' && !oldContext.__maintenanceWrapped) {
      const wrapped = function(){
        const ctx = oldContext.apply(this, arguments) || {};
        ctx.maintenanceEngine = {
          dueTasks: getDueTasks({ windowDays: 21 }).slice(0, 20),
          summaryLines: getSummaryLines().slice(0, 30),
          rule: 'When a maintenance item was logged recently, do not schedule it again until its interval is due. Prefer due/overdue Maintenance Engine tasks over generic template tasks.'
        };
        return ctx;
      };
      wrapped.__maintenanceWrapped = true;
      window.getCurrentPlanPromptContext = wrapped;
    }
  }

  window.ReefKeeperMaintenance = {
    ENGINE_KEY,
    RULES,
    get: getEngine,
    set: setEngine,
    recordCompletion,
    inferRuleFromText,
    getDueTasks,
    getSummaryLines,
    markTaskCompleteByText,
    backfill,
    installWrappers
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installWrappers);
  else installWrappers();
})();
