// Reef Keeper v8 storage module
// Purpose: one durable app database plus legacy sync so older screens keep working.
(function(){
  'use strict';
  const DB_KEY = 'reef_keeper_db_v8';
  const LEGACY_KEYS = [
    'reef_logs','reef_actions','reef_completed_history','reef_ai_reminders','reef_static_reminder_states',
    'reef_days_off_plan_states','reef_hidden_static_reminders','reef_hidden_plan_tasks','reef_ai_days_off_plans',
    'reef_task_schedule','reef_resolved_issues','reef_model_mode','reef_use_tank_context','reef_tank_mode',
    'reef_inventory','reef_inventory_custom','reef_guardrails','reef_monthly_reviews','reef_inventory_custom_v2',
    'reef_chat_conversations','reef_tank_knowledge_base','reef_equipment_inventory_v1','reef_tank_state_v7'
  ];
  const ARRAY_KEYS = new Set(['reef_logs','reef_actions','reef_completed_history','reef_ai_reminders','reef_hidden_static_reminders','reef_hidden_plan_tasks','reef_inventory','reef_inventory_custom','reef_guardrails','reef_monthly_reviews','reef_inventory_custom_v2','reef_chat_conversations','reef_tank_knowledge_base','reef_equipment_inventory_v1']);
  const OBJECT_KEYS = new Set(['reef_static_reminder_states','reef_days_off_plan_states','reef_ai_days_off_plans','reef_task_schedule','reef_resolved_issues','reef_tank_state_v7']);

  function now(){ return new Date().toISOString(); }
  function parse(key, fallback){
    try { const raw = localStorage.getItem(key); if (raw === null || raw === '') return fallback; return JSON.parse(raw); }
    catch(e){ return fallback; }
  }
  function write(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch(e){ console.warn('Storage write failed', key, e); return false; } }
  function defaultDb(){
    return {
      schemaVersion: 8,
      createdAt: now(),
      updatedAt: now(),
      tankState: null,
      data: {
        logs: [], actions: [], completedHistory: [], reminders: [], inventory: [], chatConversations: [],
        daysOffPlans: {}, daysOffPlanStates: {}, taskSchedule: {}, resolvedIssues: {}, hiddenStaticReminders: [], hiddenPlanTasks: [],
        settings: {}, guardrails: [], monthlyReviews: [], tankKnowledgeBase: [], equipment: []
      },
      legacy: {}
    };
  }
  function normalizeDb(db){
    const base = defaultDb();
    const merged = { ...base, ...(db && typeof db === 'object' ? db : {}) };
    merged.data = { ...base.data, ...(merged.data || {}) };
    merged.legacy = { ...(merged.legacy || {}) };
    merged.schemaVersion = 8;
    merged.updatedAt = merged.updatedAt || now();
    return merged;
  }
  function readDb(){ return normalizeDb(parse(DB_KEY, defaultDb())); }
  function saveDb(db){ const next = normalizeDb(db); next.updatedAt = now(); write(DB_KEY, next); return next; }
  function updateDb(mutator){ const db = readDb(); const next = typeof mutator === 'function' ? (mutator(db) || db) : { ...db, ...(mutator || {}) }; return saveDb(next); }
  function snapshotLegacy(){
    const snap = {};
    LEGACY_KEYS.forEach(key => {
      if (localStorage.getItem(key) === null) return;
      let fallback = null;
      if (ARRAY_KEYS.has(key)) fallback = [];
      if (OBJECT_KEYS.has(key)) fallback = {};
      snap[key] = parse(key, fallback);
    });
    return snap;
  }
  function importLegacyIntoDb(){
    return updateDb(db => {
      const snap = snapshotLegacy();
      db.legacy = { ...(db.legacy || {}), ...snap };
      const d = db.data;
      if (Array.isArray(snap.reef_logs)) d.logs = snap.reef_logs;
      if (Array.isArray(snap.reef_actions)) d.actions = snap.reef_actions;
      if (Array.isArray(snap.reef_completed_history)) d.completedHistory = snap.reef_completed_history;
      if (Array.isArray(snap.reef_ai_reminders)) d.reminders = snap.reef_ai_reminders;
      if (Array.isArray(snap.reef_inventory)) d.inventory = snap.reef_inventory;
      if (Array.isArray(snap.reef_chat_conversations)) d.chatConversations = snap.reef_chat_conversations;
      if (snap.reef_ai_days_off_plans && typeof snap.reef_ai_days_off_plans === 'object' && !Array.isArray(snap.reef_ai_days_off_plans)) d.daysOffPlans = snap.reef_ai_days_off_plans;
      if (snap.reef_days_off_plan_states && typeof snap.reef_days_off_plan_states === 'object' && !Array.isArray(snap.reef_days_off_plan_states)) d.daysOffPlanStates = snap.reef_days_off_plan_states;
      if (snap.reef_task_schedule && typeof snap.reef_task_schedule === 'object' && !Array.isArray(snap.reef_task_schedule)) d.taskSchedule = snap.reef_task_schedule;
      if (snap.reef_resolved_issues && typeof snap.reef_resolved_issues === 'object' && !Array.isArray(snap.reef_resolved_issues)) d.resolvedIssues = snap.reef_resolved_issues;
      if (Array.isArray(snap.reef_hidden_static_reminders)) d.hiddenStaticReminders = snap.reef_hidden_static_reminders;
      if (Array.isArray(snap.reef_hidden_plan_tasks)) d.hiddenPlanTasks = snap.reef_hidden_plan_tasks;
      if (Array.isArray(snap.reef_guardrails)) d.guardrails = snap.reef_guardrails;
      if (Array.isArray(snap.reef_monthly_reviews)) d.monthlyReviews = snap.reef_monthly_reviews;
      if (Array.isArray(snap.reef_tank_knowledge_base)) d.tankKnowledgeBase = snap.reef_tank_knowledge_base;
      if (Array.isArray(snap.reef_equipment_inventory_v1)) d.equipment = snap.reef_equipment_inventory_v1;
      d.settings = {
        modelMode: localStorage.getItem('reef_model_mode') || d.settings.modelMode || 'balanced',
        useTankContext: localStorage.getItem('reef_use_tank_context') || d.settings.useTankContext || 'true',
        tankMode: localStorage.getItem('reef_tank_mode') || d.settings.tankMode || 'recovery'
      };
      if (snap.reef_tank_state_v7) db.tankState = snap.reef_tank_state_v7;
      return db;
    });
  }
  function syncDbToLegacy(){
    const db = readDb(); const d = db.data || {};
    const pairs = [
      ['reef_logs', d.logs || []], ['reef_actions', d.actions || []], ['reef_completed_history', d.completedHistory || []],
      ['reef_ai_reminders', d.reminders || []], ['reef_inventory', d.inventory || []], ['reef_chat_conversations', d.chatConversations || []],
      ['reef_ai_days_off_plans', d.daysOffPlans || {}], ['reef_days_off_plan_states', d.daysOffPlanStates || {}],
      ['reef_task_schedule', d.taskSchedule || {}], ['reef_resolved_issues', d.resolvedIssues || {}],
      ['reef_hidden_static_reminders', d.hiddenStaticReminders || []], ['reef_hidden_plan_tasks', d.hiddenPlanTasks || []],
      ['reef_guardrails', d.guardrails || []], ['reef_monthly_reviews', d.monthlyReviews || []], ['reef_tank_knowledge_base', d.tankKnowledgeBase || []], ['reef_equipment_inventory_v1', d.equipment || []]
    ];
    pairs.forEach(([k,v]) => write(k,v));
    if (db.tankState) write('reef_tank_state_v7', db.tankState);
    if (d.settings) {
      if (d.settings.modelMode) localStorage.setItem('reef_model_mode', d.settings.modelMode);
      if (d.settings.useTankContext) localStorage.setItem('reef_use_tank_context', d.settings.useTankContext);
      if (d.settings.tankMode) localStorage.setItem('reef_tank_mode', d.settings.tankMode);
    }
    return db;
  }
  function mirrorKeyToDb(legacyKey, dbPath){
    const value = parse(legacyKey, ARRAY_KEYS.has(legacyKey) ? [] : OBJECT_KEYS.has(legacyKey) ? {} : null);
    return updateDb(db => { let target = db; const parts = dbPath.split('.'); for (let i=0;i<parts.length-1;i++) target = target[parts[i]] = target[parts[i]] || {}; target[parts.at(-1)] = value; return db; });
  }
  window.ReefKeeperStorage = { DB_KEY, LEGACY_KEYS, readDb, saveDb, updateDb, importLegacyIntoDb, syncDbToLegacy, mirrorKeyToDb, parse, write, now };
  try { if (!localStorage.getItem(DB_KEY)) importLegacyIntoDb(); else importLegacyIntoDb(); syncDbToLegacy(); } catch(e) { console.warn('v8 storage migration failed', e); }
})();
