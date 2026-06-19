// Reef Keeper v8 diagnostics adapter
(function(){
  'use strict';
  function contradictionChecks(){
    const checks = [];
    const state = window.ReefKeeperState?.get?.() || {};
    const plans = (()=>{ try { return JSON.parse(localStorage.getItem('reef_ai_days_off_plans') || '{}'); } catch(e){ return {}; } })();
    const planText = JSON.stringify(plans).toLowerCase();
    function add(level,label,detail,fix){ checks.push({ level, label, detail, fix }); }
    if (state.resolvedIssues?.hammersTorchesLost && /hammer|torch|euphyllia/.test(planText)) add('warn','Plan mentions lost hammers/torches','Saved AI plans still contain historical hammer/torch wording.',()=>window.ReefKeeperDaysOff?.repairSavedPlans?.());
    if (state.completedProtocols?.kfcRecovery && /kfc|cipro|amoxicillin|antibiotic|recovery dose/.test(planText)) add('warn','Plan mentions completed KFC recovery','Saved AI plans still contain completed recovery/treatment wording.',()=>window.ReefKeeperDaysOff?.repairSavedPlans?.());
    if (state.hardPreferences?.chaetoReactorCancelled && /chaeto|cheato|cheeto|refugium/.test(planText)) add('warn','Plan mentions cancelled chaeto/refugium','Saved AI plans still contain cancelled chaeto/refugium wording.',()=>window.ReefKeeperDaysOff?.repairSavedPlans?.());
    const hidden = (()=>{ try { return JSON.parse(localStorage.getItem('reef_hidden_plan_tasks') || '[]'); } catch(e){ return []; } })();
    const badHidden = Array.isArray(hidden) ? hidden.filter(id => /^d\d+-t\d+$/.test(String(id))) : [];
    if (badHidden.length) add('warn','Generic hidden task IDs found',`${badHidden.length} generic day/task slots can hide new AI plan tasks.`,()=>window.ReefKeeperDaysOff?.clearBadHiddenIds?.());
    return checks;
  }
  const oldRun = window.runDiagnostics;
  if (oldRun) {
    window.runDiagnostics = function(){
      const result = oldRun.call(this) || [];
      const extra = contradictionChecks();
      const box = document.getElementById('diagnostics-result');
      if (box && extra.length) {
        const html = `<div class="diagnostics-summary">🧠 v8 contradiction checks</div><ul class="diagnostics-list">${extra.map((c,i)=>`<li><span class="diagnostics-${c.level}">${c.level === 'ok' ? '✅' : '🟡'} ${escapeHtml(c.label)}</span> — ${escapeHtml(c.detail)} <button class="history-filter-btn" onclick="ReefKeeperDiagnostics.fix(${i})">Fix</button></li>`).join('')}</ul>`;
        box.innerHTML += html;
      } else if (box) {
        box.innerHTML += `<div class="diagnostics-summary">✅ v8 contradiction checks passed</div>`;
      }
      return result.concat(extra);
    };
  }
  function fix(i){ const c = contradictionChecks()[i]; if (c?.fix) c.fix(); try { runDiagnostics(); updateDaysOffDisplay(); showToast('🛠️ v8 repair applied'); } catch(e){} }
  window.ReefKeeperDiagnostics = { contradictionChecks, fix };
})();
