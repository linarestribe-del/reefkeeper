// Reef Keeper v8 AI context adapter
(function(){
  'use strict';
  function cleanSystemContext(system){
    const state = window.ReefKeeperState?.get?.();
    let text = String(system || '');
    if (state?.resolvedIssues?.hammersTorchesLost) {
      text = text.replace(/hammer coral \(2 surviving colonies\)/ig, 'hammer corals (lost/resolved — none active)');
      text = text.replace(/hammer\/torch coral/ig, 'historical hammer/torch coral');
    }
    return text;
  }
  const oldAsk = window.askOpenAI;
  if (oldAsk) {
    window.askOpenAI = async function(userMsg, history, modelMode, attachment){
      try { window.ReefKeeperState?.captureFromText?.(userMsg); } catch(e){}
      return oldAsk.call(this, userMsg, history, modelMode, attachment);
    };
  }
  const oldPlanContext = window.getCurrentPlanPromptContext;
  if (oldPlanContext) {
    window.getCurrentPlanPromptContext = function(){
      const ctx = oldPlanContext.call(this) || {};
      ctx.authoritativeTankState = window.ReefKeeperState?.get?.() || ctx.authoritativeTankState;
      ctx.authoritativeTankStateLines = window.ReefKeeperState?.getMemoryLines?.() || ctx.authoritativeTankStateLines || [];
      ctx.blockedPlanningTopics = (ctx.authoritativeTankStateLines || []).filter(x => /resolved|completed|cancelled|historical|Planning rule/i.test(x)).slice(0,40);
      return ctx;
    };
  }
  window.ReefKeeperAiContext = { cleanSystemContext };
})();
