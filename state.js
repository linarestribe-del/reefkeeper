// Reef Keeper v10c state module
// Purpose: central authoritative tank state, task-status semantics, and visible Tank Memory editor.
(function(){
  'use strict';
  const storage = window.ReefKeeperStorage;
  const TASK_STATUS = Object.freeze({ ACTIVE:'active', COMPLETED:'completed', DISMISSED:'dismissed', RESOLVED:'resolved', DELETED:'deleted', HISTORICAL:'historical' });
  function now(){ return storage?.now ? storage.now() : new Date().toISOString(); }
  function baseState(){
    return {
      schemaVersion: 10, updatedAt: now(),
      hardPreferences: { chaetoReactorCancelled: true, kalkHoldUntilCalciumBelow450AndAlkStable: true },
      completedProtocols: { kfcRecovery: { status:'completed', completedAt:'2026-06-19T12:00:00.000Z', note:'KFC/cipro/amoxicillin recovery protocol is complete. Do not schedule recovery-dose or antibiotic-protocol tasks.' } },
      activeProtocols: {},
      resolvedIssues: {
        australianStripyRehomed: { status:'resolved', resolvedAt:'2026-05-13T12:00:00.000Z', note:'Australian Stripy fish are rehomed/resolved.' },
        hammersTorchesLost: { status:'resolved', resolvedAt:'2026-06-19T12:00:00.000Z', note:'All hammer and torch corals are lost/resolved. Do not plan observation/care tasks unless new ones are added.' }
      },
      livestock: {
        'Australian Stripy fish': { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Rehomed/resolved.' },
        'hammer corals': { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Lost/resolved.' },
        'torch corals': { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Lost/resolved.' },
        'purple stylophora': { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Lost/resolved.' }
      },
      activeCoralAndAnemones: ['zoanthids/zoas','bubble tip anemones','Grube\'s gorgonia','mushrooms/Ricordea','Montipora satosa','green star polyps'],
      planningRules: [
        'Do not plan tasks around livestock marked lost/resolved, rehomed/resolved, historical, or allowPlanningTasks=false.',
        'When an issue is done, mark the underlying issue resolved rather than only hiding a task card.',
        'Completed protocols and resolved issues override fixed tank-profile text, old templates, inventory defaults, and old AI plans.',
        'Reject generated tasks that conflict with authoritative tank state before display and before saving.'
      ],
      facts: ['KFC recovery protocol is complete.','Chaeto reactor plan is cancelled.','Australian Stripy fish are rehomed/resolved.','All hammer and torch corals are lost/resolved.'],
      taskStatuses: {}
    };
  }
  function merge(base, saved){
    saved = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    const out = { ...base, ...saved };
    ['hardPreferences','completedProtocols','activeProtocols','resolvedIssues','livestock','taskStatuses'].forEach(k => out[k] = { ...(base[k]||{}), ...(saved[k]||{}) });
    // v7 compatibility: livestockStatus map becomes livestock objects.
    if (saved.livestockStatus) Object.entries(saved.livestockStatus).forEach(([name, status]) => { out.livestock[name] = { ...(out.livestock[name]||{}), status:String(status), activeInTank:false, allowPlanningTasks:false }; });
    ['activeCoralAndAnemones','planningRules','facts'].forEach(k => out[k] = [...new Set([...(base[k]||[]), ...(saved[k]||[])].map(x => String(x||'').trim()).filter(Boolean))]);
    out.schemaVersion = 10; out.updatedAt = saved.updatedAt || base.updatedAt;
    return out;
  }
  function get(){
    const old = (typeof window.getReefTankState === 'function') ? window.getReefTankState() : null;
    const dbState = storage?.readDb()?.tankState || old || null;
    return merge(baseState(), dbState);
  }
  function set(state){
    const next = merge(baseState(), state || {}); next.updatedAt = now();
    if (storage) storage.updateDb(db => { db.tankState = next; return db; });
    try { localStorage.setItem('reef_tank_state_v7', JSON.stringify(next)); } catch(e) {}
    try { if (typeof window.setReefTankState === 'function') window.setReefTankState(next); } catch(e) {}
    return next;
  }
  function update(mutator){ const current = get(); return set(typeof mutator === 'function' ? (mutator(current) || current) : { ...current, ...(mutator || {}) }); }
  function taskText(text){ return String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function isBlockedTask(text){
    const t = taskText(text); const state = get();
    const blockers = [];
    if (state.hardPreferences?.chaetoReactorCancelled) blockers.push(['chaeto/refugium cancelled', /\b(chaeto|cheato|cheeto|refugium|macroalgae|macro algae)\b/]);
    if (state.completedProtocols?.kfcRecovery?.status === 'completed') blockers.push(['KFC recovery completed', /\b(kfc|kung fu|cipro|ciprofloxacin|amoxicillin|antibiotic|recovery dose|day\s*[4567]\s*recovery|skimmer cup retry)\b/]);
    if (state.resolvedIssues?.australianStripyRehomed) blockers.push(['Australian Stripy rehomed', /\b(australian|stripy|sump fish|rehom)\b/]);
    if (state.resolvedIssues?.hammersTorchesLost) blockers.push(['hammers/torches lost', /\b(hammer|hammers|torch|torches|euphyllia)\b/]);
    for (const [reason, rx] of blockers) if (rx.test(t)) return { blocked:true, reason };
    for (const [name, info] of Object.entries(state.livestock || {})) {
      if (info && info.allowPlanningTasks === false && t.includes(taskText(name))) return { blocked:true, reason:`${name} is ${info.status || 'not active'}` };
    }
    return { blocked:false, reason:'' };
  }
  function normalizeTaskStatus(status){ return Object.values(TASK_STATUS).includes(status) ? status : TASK_STATUS.ACTIVE; }
  function setTaskStatus(id, status, meta={}){ return update(state => { state.taskStatuses[id] = { status:normalizeTaskStatus(status), updatedAt:now(), ...meta }; return state; }); }
  function getMemoryLines(){
    const state = get(); const lines = ['AUTHORITATIVE TANK MEMORY (v10): these facts override older chat, templates, inventory defaults, and hidden task lists.'];
    Object.entries(state.hardPreferences||{}).forEach(([k,v]) => { if (v) lines.push(`Hard preference: ${k}.`); });
    Object.entries(state.completedProtocols||{}).forEach(([k,v]) => lines.push(`Completed protocol: ${k} — ${v.note || v.status || 'completed'}.`));
    Object.entries(state.resolvedIssues||{}).forEach(([k,v]) => lines.push(`Resolved issue: ${k} — ${v.note || v.status || 'resolved'}.`));
    Object.entries(state.livestock||{}).forEach(([name, v]) => lines.push(`Livestock: ${name}; status=${v.status || 'unknown'}; activeInTank=${v.activeInTank !== false}; allowPlanningTasks=${v.allowPlanningTasks !== false}. ${v.note || ''}`));
    if (state.activeCoralAndAnemones?.length) lines.push(`Active coral/anemone list for planning: ${state.activeCoralAndAnemones.join(', ')}.`);
    (state.planningRules||[]).forEach(rule => lines.push(`Planning rule: ${rule}`));
    return lines;
  }

  function proposalId(){ return 'tank-update-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
  function proposalFromMatch(kind, label, summary, updateText, details={}){
    return {
      id: proposalId(), kind, label, summary, updateText,
      scopes: details.scopes || ['Tank Memory','AI Context','Days-Off Plan','Reminders','Livestock when applicable'],
      details
    };
  }
  function extractCoralExceptionList(text){
    const m = String(text || '').match(/lost\s+all\s+coral(?:s)?\s+except\s+(.+)/i);
    if (!m) return [];
    return m[1].split(/,|\band\b|\+|\//i).map(x => x.trim().replace(/[.!?]$/,'')).filter(Boolean).slice(0,12);
  }
  function proposeFromText(text){
    const raw = String(text || '').trim();
    const t = taskText(raw);
    if (!raw || raw.length < 6) return null;

    const coralExceptions = extractCoralExceptionList(raw);
    if (coralExceptions.length) {
      return proposalFromMatch(
        'active_coral_reset',
        'Update active coral list',
        `Save that the active coral list should be limited to: ${coralExceptions.join(', ')}. Existing coral not on this list will be treated as historical unless re-added later.`,
        raw,
        { activeCoralAndAnemones: coralExceptions, scopes:['Tank Memory','Livestock','AI Context','Days-Off Plan','Reminders'] }
      );
    }

    if (/(hammer|hammers|torch|torches|euphyllia)/.test(t) && /(lost|gone|dead|died|removed|no more|none left|all gone|all lost)/.test(t)) {
      return proposalFromMatch('livestock_lost_hammer_torch','Hammer/torch corals lost','Mark all hammer and torch corals as historical/lost and block future care or observation tasks unless you add new ones later.',raw,{ affected:['hammer corals','torch corals'], status:'historical', activeInTank:false, allowPlanningTasks:false });
    }
    if (/(kfc|kung fu|cipro|ciprofloxacin|amoxicillin|antibiotic|recovery protocol)/.test(t) && /(done|complete|completed|finished|ended|over|final dose)/.test(t)) {
      return proposalFromMatch('protocol_completed_kfc','KFC recovery complete','Mark the KFC/antibiotic recovery protocol complete and block future recovery-dose tasks.',raw,{ protocol:'kfcRecovery' });
    }
    if (/(chaeto|cheato|cheeto|refugium|macroalgae|macro algae)/.test(t) && /(cancel|cancelled|canceled|no longer|not going|remove|removed|forget|dont|do not|wont|won t)/.test(t)) {
      return proposalFromMatch('preference_cancel_chaeto','Chaeto/refugium cancelled','Save a hard preference that chaeto/refugium/reactor startup tasks should not be planned.',raw,{ preference:'chaetoReactorCancelled' });
    }
    if (/(australian|stripy|strippy)/.test(t) && /(rehomed|re homed|gone|removed|resolved|done)/.test(t)) {
      return proposalFromMatch('livestock_rehomed_australian','Australian Stripy rehomed','Mark the Australian Stripy as rehomed/historical and block future sump, feeding, or rehoming tasks.',raw,{ affected:['Australian Stripy fish'], status:'historical', activeInTank:false, allowPlanningTasks:false });
    }

    const lostCommon = raw.match(/(?:lost|removed|rehomed|no longer have|do not have|don't have)\s+(?:my\s+|the\s+|all\s+)?([a-zA-Z0-9 '\-]+?)(?:\.|,|$)/i);
    if (lostCommon) {
      const name = lostCommon[1].trim();
      const tooBroad = /coral|fish|tank|reef|water|plan|task|reminder/i.test(name) && name.split(/\s+/).length < 2;
      if (name.length >= 3 && name.length <= 60 && !tooBroad) {
        return proposalFromMatch('livestock_lost_generic',`Mark ${name} historical`,`Save that ${name} is no longer active in the tank and block future care tasks unless re-added.`,raw,{ affected:[name], status:'historical', activeInTank:false, allowPlanningTasks:false });
      }
    }

    if (/\badded\b/.test(t) && /\btest coral\b/.test(t)) {
      return proposalFromMatch('livestock_added_generic','Add active livestock: test coral','Save test coral as active livestock so Ask AI and Days-Off Plan may consider it.',raw,{ affected:['test coral'], status:'active', activeInTank:true, allowPlanningTasks:true, scopes:['Tank Memory','Livestock','AI Context','Days-Off Plan'] });
    }

    // More reliable added-livestock detection. Handles:
    // "I added a new coral: blue test acropora", "I added coral blue test acropora",
    // and simple "I added a blue test acropora" wording.
    let addedName = '';
    const colonAdded = raw.match(/(?:added|bought|got|picked up|introduced)[^:]{0,80}:\s*([^.!?]+)/i);
    if (colonAdded) addedName = colonAdded[1].trim();
    if (!addedName) {
      const typedAdded = raw.match(/(?:added|bought|got|picked up|introduced)\s+(?:a\s+|an\s+|some\s+|new\s+)?(?:coral|fish|invert|invertebrate|anemone|livestock)\s+(?:called\s+|named\s+)?([^.!?,]+)/i);
      if (typedAdded) addedName = typedAdded[1].trim();
    }
    if (!addedName) {
      const addCommon = raw.match(/(?:added|bought|got|picked up|introduced)\s+(?:a\s+|an\s+|some\s+|new\s+)?([a-zA-Z0-9 '\-]+?)(?:\.|,|$)/i);
      if (addCommon) addedName = addCommon[1].trim();
    }
    if (addedName) {
      let name = addedName
        .replace(/^(?:new\s+)?(?:coral|fish|invert|invertebrate|anemone|livestock)[:\s-]*/i, '')
        .replace(/^(?:called|named)\s+/i, '')
        .trim();
      if (name.length >= 3 && name.length <= 80 && !/^(coral|fish|invert|invertebrate|anemone|livestock)$/i.test(name) && !/water|salt|food|test kit|kit|reminder|task|plan/i.test(name)) {
        return proposalFromMatch('livestock_added_generic',`Add active livestock: ${name}`,`Save ${name} as active livestock so Ask AI and Days-Off Plan may consider it.`,raw,{ affected:[name], status:'active', activeInTank:true, allowPlanningTasks:true, scopes:['Tank Memory','Livestock','AI Context','Days-Off Plan'] });
      }
    }
    return null;
  }

  function applyProposal(proposal){
    if (!proposal || !proposal.kind) return false;
    const p = proposal;
    let changed = false;
    update(state => {
      if (p.kind === 'active_coral_reset') {
        const active = (p.details?.activeCoralAndAnemones || []).map(x => String(x||'').trim()).filter(Boolean);
        if (active.length) {
          state.activeCoralAndAnemones = active;
          state.facts = [...new Set([...(state.facts||[]), `Active coral/anemone list reset: ${active.join(', ')}.`])];
          const likelyHistorical = ['hammer corals','torch corals','purple stylophora'];
          likelyHistorical.forEach(name => {
            if (!active.some(a => taskText(a).includes(taskText(name)) || taskText(name).includes(taskText(a)))) {
              state.livestock[name] = { ...(state.livestock[name]||{}), status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Not included in user-confirmed active coral list.' };
            }
          });
          changed = true;
        }
      } else if (p.kind === 'livestock_lost_hammer_torch') {
        state.resolvedIssues.hammersTorchesLost = { status:'resolved', resolvedAt:now(), note:'User confirmed hammer/torch corals are gone/lost/resolved.' };
        ['hammer corals','torch corals'].forEach(name => state.livestock[name] = { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Lost/resolved by user confirmation.' });
        state.facts = [...new Set([...(state.facts||[]),'All hammer and torch corals are lost/resolved.'])];
        changed = true;
      } else if (p.kind === 'protocol_completed_kfc') {
        state.completedProtocols.kfcRecovery = { status:'completed', completedAt:now(), note:'User confirmed KFC/antibiotic recovery protocol is complete.' };
        state.facts = [...new Set([...(state.facts||[]),'KFC recovery protocol is complete.'])];
        changed = true;
      } else if (p.kind === 'preference_cancel_chaeto') {
        state.hardPreferences.chaetoReactorCancelled = true;
        state.facts = [...new Set([...(state.facts||[]),'Chaeto reactor plan is cancelled.'])];
        changed = true;
      } else if (p.kind === 'livestock_rehomed_australian') {
        state.resolvedIssues.australianStripyRehomed = { status:'resolved', resolvedAt:now(), note:'User confirmed Australian Stripy fish are rehomed/resolved.' };
        state.livestock['Australian Stripy fish'] = { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Rehomed/resolved by user confirmation.' };
        state.facts = [...new Set([...(state.facts||[]),'Australian Stripy fish are rehomed/resolved.'])];
        changed = true;
      } else if (p.kind === 'livestock_lost_generic') {
        (p.details?.affected || []).forEach(name => { state.livestock[name] = { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Marked no longer active by user confirmation.' }; });
        state.facts = [...new Set([...(state.facts||[]), `${(p.details?.affected||[]).join(', ')} marked historical/not active.`])];
        changed = true;
      } else if (p.kind === 'livestock_added_generic') {
        (p.details?.affected || []).forEach(name => { state.livestock[name] = { status:'active', activeInTank:true, allowPlanningTasks:true, note:'Added/active by user confirmation.' }; });
        state.facts = [...new Set([...(state.facts||[]), `${(p.details?.affected||[]).join(', ')} marked active in tank.`])];
        changed = true;
      }
      return state;
    });
    if (changed) {
      try { storage?.syncDbToLegacy(); } catch(e){}
      try { window.ReefKeeperDaysOff?.repairSavedPlans?.(); } catch(e){}
      try { if (typeof renderReminderCenter === 'function') renderReminderCenter(); } catch(e){}
      try { if (typeof updateDaysOffDisplay === 'function') updateDaysOffDisplay(); } catch(e){}
      try { if (typeof renderInventory === 'function') renderInventory(); } catch(e){}
      renderMemoryPanel();
    }
    return changed;
  }

  function captureFromText(text){
    const t = taskText(text); let changed = false;
    update(state => {
      if (/(hammer|hammers|torch|torches|euphyllia)/.test(t) && /(lost|gone|dead|died|removed|no more|none left|all gone|all lost)/.test(t)) {
        state.resolvedIssues.hammersTorchesLost = { status:'resolved', resolvedAt:now(), note:'User said hammer/torch corals are gone/lost/resolved.' };
        state.livestock['hammer corals'] = { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Lost/resolved.' };
        state.livestock['torch corals'] = { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Lost/resolved.' };
        state.facts = [...new Set([...(state.facts||[]),'All hammer and torch corals are lost/resolved.'])]; changed = true;
      }
      if (/(kfc|kung fu|cipro|ciprofloxacin|amoxicillin|antibiotic|recovery protocol)/.test(t) && /(done|complete|completed|finished|ended|over|final dose)/.test(t)) {
        state.completedProtocols.kfcRecovery = { status:'completed', completedAt:now(), note:'User said KFC/antibiotic recovery protocol is complete.' }; changed = true;
      }
      if (/(chaeto|cheato|cheeto|refugium|macroalgae|macro algae)/.test(t) && /(cancel|cancelled|canceled|no longer|not going|remove|removed|forget|dont|do not|wont|won t)/.test(t)) {
        state.hardPreferences.chaetoReactorCancelled = true; changed = true;
      }
      if (/(australian|stripy|strippy)/.test(t) && /(rehomed|re homed|gone|removed|resolved|done)/.test(t)) {
        state.resolvedIssues.australianStripyRehomed = { status:'resolved', resolvedAt:now(), note:'User said Australian Stripy fish are rehomed/resolved.' };
        state.livestock['Australian Stripy fish'] = { status:'historical', activeInTank:false, allowPlanningTasks:false, note:'Rehomed/resolved.' }; changed = true;
      }
      return state;
    });
    if (changed) { try { storage?.syncDbToLegacy(); } catch(e){} renderMemoryPanel(); }
    return changed;
  }
  function renderMemoryPanel(){
    const host = document.getElementById('tank-memory-v8'); if (!host) return;
    const state = get();
    const facts = [
      ...Object.entries(state.hardPreferences||{}).filter(([,v])=>v).map(([k])=>({type:'Preference', label:k})),
      ...Object.entries(state.completedProtocols||{}).map(([k,v])=>({type:'Protocol complete', label:k, note:v.note})),
      ...Object.entries(state.resolvedIssues||{}).map(([k,v])=>({type:'Resolved issue', label:k, note:v.note})),
      ...Object.entries(state.livestock||{}).filter(([,v])=>v.activeInTank===false || v.allowPlanningTasks===false).map(([k,v])=>({type:'Historical livestock', label:k, note:v.note || v.status}))
    ];
    host.innerHTML = `<div class="card-title">🧠 Tank Memory</div>
      <div class="reminder-center-intro">These are authoritative facts used by Ask AI, Reminders, Days-Off Plan, and Diagnostics. Historical/resolved items are not just hidden; they are removed from active planning.</div>
      <div>${facts.map((f,i)=>`<div class="hidden-task-row"><div><div class="hidden-task-title">${escapeHtml(f.label)}</div><div class="hidden-task-meta">${escapeHtml(f.type)}${f.note ? ' · ' + escapeHtml(f.note) : ''}</div></div><button class="hidden-task-restore" onclick="ReefKeeperState.removeMemoryItem(${i})">Edit</button></div>`).join('') || '<div class="hidden-tasks-empty">No memory facts recorded yet.</div>'}</div>
      <div class="hidden-tasks-actions"><button class="hidden-tasks-btn" onclick="ReefKeeperState.syncNow()">Sync memory</button><button class="hidden-tasks-btn" onclick="ReefKeeperState.addManualMemory()">Add memory</button></div>`;
  }
  function ensureMemoryPanel(){
    if (document.getElementById('tank-memory-v8')) return renderMemoryPanel();
    const page = document.getElementById('page-log') || document.querySelector('.page.active');
    if (!page) return;
    const div = document.createElement('div'); div.id='tank-memory-v8'; div.className='card tank-status-card';
    // Place Tank Memory at the bottom of the Log page so it stays available
    // without crowding parameter logging, trends, or diagnostics.
    page.appendChild(div);
    renderMemoryPanel();
  }
  function addManualMemory(){
    const text = prompt('Add a tank memory fact. Examples: "All torches are lost" or "Do not plan chaeto reactor."');
    if (!text) return;
    if (!captureFromText(text)) update(state => { state.facts = [...new Set([...(state.facts||[]), text])]; return state; });
    renderMemoryPanel(); try { showToast('✅ Tank memory updated'); } catch(e){}
  }
  function removeMemoryItem(index){ alert('For safety, v10 treats memory edits as explicit updates. Use Add memory to re-activate or change a fact. A full edit/delete screen can be added next.'); }
  function syncNow(){ set(get()); storage?.syncDbToLegacy(); renderMemoryPanel(); try { showToast('✅ Tank memory synced'); } catch(e){} }

  const manager = { TASK_STATUS, get, set, update, isBlockedTask, getMemoryLines, proposeFromText, applyProposal, captureFromText, setTaskStatus, ensureMemoryPanel, renderMemoryPanel, addManualMemory, removeMemoryItem, syncNow };
  window.ReefKeeperState = manager;
  // Bridge old v7 global functions to v8 state where safe.
  const oldGetLines = window.getAuthoritativeTankStateMemoryLines;
  window.getAuthoritativeTankStateMemoryLines = function(){ return manager.getMemoryLines().map(line => (typeof compactMemoryLine === 'function' ? compactMemoryLine(line, 420) : line)); };
  const oldCapture = window.captureAuthoritativeTankStateFromText;
  window.captureAuthoritativeTankStateFromText = function(text){ const v8 = manager.captureFromText(text); let old = null; try { old = oldCapture ? oldCapture(text) : null; } catch(e){} return old || (v8 ? { key:'v8TankMemory', label:'Tank memory updated' } : null); };
  try { set(get()); storage?.syncDbToLegacy(); } catch(e){ console.warn('v8 state migration failed', e); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureMemoryPanel); else setTimeout(ensureMemoryPanel, 0);
})();
