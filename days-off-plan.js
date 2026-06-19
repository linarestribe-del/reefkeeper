// Reef Keeper v8 days-off plan adapter
// Purpose: deterministic plan validation after AI output and before display/save.
(function(){
  'use strict';
  function filterPlan(plan){
    if (!plan || !Array.isArray(plan.days)) return plan;
    const removed = [];
    const next = { ...plan, days: plan.days.map(day => {
      const tasks = (day.tasks || []).filter(task => {
        const verdict = window.ReefKeeperState?.isBlockedTask?.(`${day.title || ''} ${task}`) || { blocked:false };
        if (verdict.blocked) removed.push({ day:day.day, task, reason:verdict.reason });
        return !verdict.blocked;
      });
      return { ...day, tasks };
    }) };
    next.days = next.days.filter(day => Array.isArray(day.tasks) && day.tasks.length);
    if (removed.length) {
      try { localStorage.setItem('reef_last_plan_filter_report', JSON.stringify({ at:new Date().toISOString(), removed })); } catch(e){}
      next.summary = (next.summary || 'Custom days-off plan.') + ` Filtered ${removed.length} resolved/historical task${removed.length===1?'':'s'}.`;
    }
    return next;
  }
  const oldNormalize = window.normalizeDaysOffPlan;
  if (oldNormalize) {
    window.normalizeDaysOffPlan = function(plan){ return oldNormalize.call(this, filterPlan(plan)); };
  }
  const oldSave = window.saveAiDaysOffPlanForCurrentBlock;
  if (oldSave) {
    window.saveAiDaysOffPlanForCurrentBlock = function(plan){ return oldSave.call(this, filterPlan(plan)); };
  }
  const oldGetTemplate = window.getTemplateDaysOffPlan;
  if (oldGetTemplate) {
    window.getTemplateDaysOffPlan = function(){ return filterPlan(oldGetTemplate.call(this)); };
  }
  function clearBadHiddenIds(){
    try {
      const hidden = JSON.parse(localStorage.getItem('reef_hidden_plan_tasks') || '[]');
      if (Array.isArray(hidden)) {
        const cleaned = hidden.filter(id => !/^d\d+-t\d+$/.test(String(id)));
        if (cleaned.length !== hidden.length) localStorage.setItem('reef_hidden_plan_tasks', JSON.stringify(cleaned));
      }
    } catch(e){}
  }
  function repairSavedPlans(){
    try {
      const raw = JSON.parse(localStorage.getItem('reef_ai_days_off_plans') || '{}');
      let changed = false;
      Object.entries(raw).forEach(([key, plan]) => {
        const filtered = filterPlan(plan);
        if (JSON.stringify(filtered) !== JSON.stringify(plan)) { raw[key] = filtered; changed = true; }
      });
      if (changed) localStorage.setItem('reef_ai_days_off_plans', JSON.stringify(raw));
      window.ReefKeeperStorage?.mirrorKeyToDb?.('reef_ai_days_off_plans','data.daysOffPlans');
    } catch(e){}
  }
  clearBadHiddenIds(); repairSavedPlans();
  try { if (typeof updateDaysOffDisplay === 'function') updateDaysOffDisplay(); } catch(e){}
  window.ReefKeeperDaysOff = { filterPlan, repairSavedPlans, clearBadHiddenIds };
})();
