// Reef Keeper Vision Engine 1.0
const RK_VISION_MODES = {
  coral: {
    label:'Coral', structured:true,
    itemType:'coral',
    prompt:'Analyze this coral photo for Reef Keeper. Identify the coral if possible, evaluate color, tissue, polyp extension, algae/pest irritation, recession, and growth signs. Compare against prior timeline notes when available. Be conservative and mention uncertainty from lighting or angle.'
  },
  fish: {
    label:'Fish', structured:true,
    itemType:'fish',
    prompt:'Analyze this fish photo for Reef Keeper. Identify the fish if possible and check visible body condition, fins, color, injury, parasite-like spots, breathing/stress clues, and behavior clues. Separate observation from diagnosis.'
  },
  algae: {
    label:'Algae / Pests', structured:false,
    prompt:'Analyze this reef aquarium image for algae, pests, irritation, or nuisance organisms. Identify likely types, confidence level, visual clues, what to inspect next, and safest actions for my tank. Separate observation from diagnosis.'
  },
  fulltank: {
    label:'Full Tank', structured:false,
    prompt:'Analyze this full-tank reef photo. Summarize livestock visible, coral condition, algae/cyano/dino concerns, flow or placement clues, coral warfare or shading risks, and the top three things to inspect next. Use my tank context.'
  },
  icp: {
    label:'ICP / Test', structured:false,
    prompt:'Analyze this ICP report, parameter chart, or water-test photo. Extract readable values, flag concerns, compare to my personalized targets when available, and give a practical next-step checklist.'
  },
  equipment: {
    label:'Equipment', structured:false,
    prompt:'Analyze this reef equipment photo. Identify equipment if possible, note setup or maintenance concerns, salt creep/leak/electrical/plumbing issues visible, and what to verify next.'
  }
};
let rkVisionMode = 'coral';
let rkVisionTargetId = '';
let rkPendingVision = null;

function setVisionMode(mode) {
  rkVisionMode = RK_VISION_MODES[mode] ? mode : 'coral';
  const sel = document.getElementById('vision-mode-select');
  if (sel) sel.value = rkVisionMode;
  const chip = document.getElementById('vision-current-mode');
  if (chip) chip.textContent = `Mode: ${RK_VISION_MODES[rkVisionMode].label}`;
  renderVisionTargetOptions();
}

function setVisionTarget(id) {
  rkVisionTargetId = id || '';
}

function renderVisionTargetOptions() {
  const sel = document.getElementById('vision-target-select');
  if (!sel) return;
  let items = [];
  try { items = getInventoryItems().filter(i => (i.status || '') !== 'lost/resolved'); } catch(e) { items = []; }
  const mode = RK_VISION_MODES[rkVisionMode] || RK_VISION_MODES.coral;
  const wanted = mode.itemType;
  const filtered = wanted ? items.filter(i => {
    const t = String(i.type || '').toLowerCase();
    if (wanted === 'coral') return t === 'coral' || t === 'anemone';
    if (wanted === 'fish') return t === 'fish';
    return true;
  }) : items;
  const current = rkVisionTargetId;
  sel.innerHTML = `<option value="">No livestock target</option>` + filtered.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name || 'Unnamed item')}</option>`).join('');
  if (current && filtered.some(i => String(i.id) === String(current))) sel.value = current;
  else { rkVisionTargetId = ''; sel.value = ''; }
}

function startVisionEngine(mode = null, source = 'camera') {
  if (mode) setVisionMode(mode);
  else setVisionMode(document.getElementById('vision-mode-select')?.value || rkVisionMode);
  const input = document.getElementById('vision-file-input');
  if (!input) return;
  input.value = '';
  input.removeAttribute('capture');
  if (source === 'camera') input.setAttribute('capture','environment');
  input.click();
}

function rkVisionArrayList(value) {
  return Array.isArray(value) && value.length ? `<ul>${value.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<div class="photo-analysis-muted">None visible from this photo.</div>';
}

function renderVisionStructuredResult(result) {
  return `
    <div class="vision-result-title">🔎 ${escapeHtml(RK_VISION_MODES[rkVisionMode].label)} Analysis</div>
    <div class="vision-result-meta">Suggested ID: <strong>${escapeHtml(result.suggestedId || 'uncertain')}</strong> · Confidence: ${escapeHtml(result.confidence || 'low')} · Health: ${escapeHtml(result.healthStatus || 'uncertain')}</div>
    <div class="vision-result-section"><strong>Visible signs</strong>${rkVisionArrayList(result.visibleSigns)}</div>
    <div class="vision-result-section"><strong>Concerns</strong>${rkVisionArrayList(result.healthConcerns)}</div>
    ${result.growthAssessment ? `<div class="vision-result-section"><strong>Growth / condition</strong><br>${escapeHtml(result.growthAssessment)}</div>` : ''}
    ${result.estimatedGrowthPercent && result.estimatedGrowthPercent !== 'unknown' ? `<div class="vision-result-section"><strong>Estimated growth change</strong><br>${escapeHtml(result.estimatedGrowthPercent)}</div>` : ''}
    ${result.bodyCondition && result.bodyCondition !== 'unknown' ? `<div class="vision-result-section"><strong>Body / extension condition</strong><br>${escapeHtml(result.bodyCondition)}</div>` : ''}
    ${result.timelineComparison && result.timelineComparison !== 'insufficient history' ? `<div class="vision-result-section"><strong>Timeline comparison</strong><br>${escapeHtml(result.timelineComparison)}</div>` : ''}
    <div class="vision-result-section"><strong>Recommended actions</strong>${rkVisionArrayList(result.recommendedActions)}</div>
    ${result.trackingNotes ? `<div class="vision-result-section"><strong>Timeline note</strong><br>${escapeHtml(result.trackingNotes)}</div>` : ''}`;
}

function renderVisionResult(result, structured) {
  const panel = document.getElementById('vision-result-card');
  if (!panel) return;
  const html = structured ? renderVisionStructuredResult(result) : `
    <div class="vision-result-title">🔎 ${escapeHtml(RK_VISION_MODES[rkVisionMode].label)} Analysis</div>
    <div class="vision-result-section">${escapeHtml(String(result.answer || result.text || 'No result returned.')).replace(/\n/g,'<br>')}</div>`;
  panel.innerHTML = `${html}
    <div class="vision-save-row">
      <button class="vision-save-primary" type="button" onclick="saveVisionToHistory()">Save Analysis</button>
      <button class="vision-save-secondary" type="button" onclick="saveVisionToLivestockTimeline()">Save to Livestock Timeline</button>
      <button class="vision-save-secondary" type="button" onclick="saveVisionToTankHistory()">Save Full-Tank History</button>
    </div>`;
  panel.classList.add('visible');
  try { panel.scrollIntoView({ block:'nearest', behavior:'smooth' }); } catch(e) {}
}

async function handleVisionFile(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  setVisionMode(document.getElementById('vision-mode-select')?.value || rkVisionMode);
  setVisionTarget(document.getElementById('vision-target-select')?.value || '');
  const preview = document.getElementById('vision-preview');
  const panel = document.getElementById('vision-result-card');
  try {
    const dataUrl = typeof resizeInventoryImage === 'function' ? await resizeInventoryImage(file) : await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=reject; r.readAsDataURL(file); });
    if (preview) { preview.innerHTML = `<img src="${dataUrl}" alt="Vision photo"><div><strong>Photo ready.</strong><br><span style="font-size:12px;color:var(--text-mid);font-weight:800;">Analyzing ${escapeHtml(RK_VISION_MODES[rkVisionMode].label.toLowerCase())}...</span></div>`; preview.classList.add('visible'); }
    if (panel) { panel.innerHTML = '<span class="spinner"></span> AI Vision is analyzing the photo...'; panel.classList.add('visible'); }
    const mode = RK_VISION_MODES[rkVisionMode] || RK_VISION_MODES.coral;
    let result, structured = !!mode.structured;
    const items = typeof getInventoryItems === 'function' ? getInventoryItems() : [];
    const target = rkVisionTargetId ? items.find(i => String(i.id) === String(rkVisionTargetId)) : null;
    if (structured) {
      const pseudoItem = target || { id:'', name: mode.label, type: mode.itemType || 'other', notes: mode.prompt };
      const response = await fetch('/api/photo-analysis', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          item: pseudoItem,
          image: { name:file.name || 'reef vision photo', type:file.type || 'image/jpeg', dataUrl },
          previousAnalyses: target ? getInventoryAnalysisHistory(target.id) : [],
          tankSummary: typeof getLocalTankMemorySummary === 'function' ? getLocalTankMemorySummary(`${mode.label} photo analysis`) : ''
        })
      });
      result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(result.error || 'Photo analysis failed');
    } else {
      const response = await askOpenAI(mode.prompt, [], typeof getModelMode === 'function' ? getModelMode() : 'balanced', [{ kind:'image', name:file.name || 'reef vision photo', type:file.type || 'image/jpeg', dataUrl }]);
      result = { answer: response.answer || '' };
    }
    rkPendingVision = { mode:rkVisionMode, targetId:rkVisionTargetId, imageDataUrl:dataUrl, result, structured, analyzedAt:new Date().toISOString(), fileName:file.name || 'reef vision photo' };
    renderVisionResult(result, structured);
    showToast('🔎 Vision analysis complete');
  } catch(e) {
    console.error(e);
    if (panel) panel.innerHTML = `⚠️ Could not analyze photo. ${escapeHtml(e.message || 'Try a clearer or smaller image.')}`;
    showToast('⚠️ Vision analysis failed');
  } finally {
    if (event?.target) event.target.value = '';
  }
}


function clearVisionAnalysis(savedLabel = '') {
  rkPendingVision = null;
  const preview = document.getElementById('vision-preview');
  const panel = document.getElementById('vision-result-card');
  const input = document.getElementById('vision-file-input');
  if (preview) {
    preview.innerHTML = savedLabel
      ? `<div><strong>✅ ${escapeHtml(savedLabel)}</strong><br><span style="font-size:12px;color:var(--text-mid);font-weight:800;">Ready for the next photo.</span></div>`
      : '';
    preview.classList.toggle('visible', Boolean(savedLabel));
  }
  if (panel) {
    panel.innerHTML = '';
    panel.classList.remove('visible');
  }
  if (input) input.value = '';
}

function visionSummaryText(v = rkPendingVision) {
  if (!v) return '';
  const r = v.result || {};
  if (v.structured) {
    return [
      r.trackingNotes ? `Notes: ${r.trackingNotes}` : '',
      r.growthAssessment ? `Growth/condition: ${r.growthAssessment}` : '',
      Array.isArray(r.visibleSigns) && r.visibleSigns.length ? `Visible: ${r.visibleSigns.join('; ')}` : '',
      Array.isArray(r.healthConcerns) && r.healthConcerns.length ? `Concerns: ${r.healthConcerns.join('; ')}` : '',
      Array.isArray(r.recommendedActions) && r.recommendedActions.length ? `Next: ${r.recommendedActions.join('; ')}` : ''
    ].filter(Boolean).join('\n');
  }
  return String(r.answer || r.text || '').slice(0, 1200);
}

function saveVisionToHistory() {
  if (!rkPendingVision) { showToast('⚠️ Analyze a photo first'); return; }
  try {
    const actions = typeof getActionEntries === 'function' ? getActionEntries() : [];
    const mode = RK_VISION_MODES[rkPendingVision.mode]?.label || 'Vision';
    actions.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title: `AI Vision: ${mode}`,
      category: rkPendingVision.mode === 'equipment' ? 'equipment' : 'livestock',
      notes: visionSummaryText(),
      date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
      isoDate: new Date().toISOString()
    });
    if (typeof setActionEntries === 'function') setActionEntries(actions.slice(0, 100));
    try { renderActionHistory(); renderRecentChangesHome(); renderSmartTankDashboard(); } catch(e) {}
    showToast('✅ Vision analysis saved to Action History');
    clearVisionAnalysis('Analysis saved');
  } catch(e) { showToast('⚠️ Could not save analysis'); }
}

async function saveVisionToLivestockTimeline() {
  if (!rkPendingVision) { showToast('⚠️ Analyze a photo first'); return; }
  const targetId = rkPendingVision.targetId || document.getElementById('vision-target-select')?.value || '';
  if (!targetId) { showToast('Choose a livestock target first'); return; }
  try {
    let items = getInventoryItems();
    const idx = items.findIndex(i => String(i.id) === String(targetId));
    if (idx < 0) { showToast('Livestock target not found'); return; }
    const imageKey = `vision-${targetId}-${Date.now().toString(36)}`;
    await saveInventoryPhotoData(imageKey, rkPendingVision.imageDataUrl);
    const r = rkPendingVision.result || {};
    const entry = rkPendingVision.structured ? {
      id:imageKey, imageKey, analyzedAt:rkPendingVision.analyzedAt,
      suggestedId:r.suggestedId || '', confidence:r.confidence || 'low', category:r.category || items[idx].type || 'other',
      healthStatus:r.healthStatus || 'uncertain', visibleSigns:r.visibleSigns || [], healthConcerns:r.healthConcerns || [],
      growthAssessment:r.growthAssessment || '', estimatedGrowthPercent:r.estimatedGrowthPercent || 'unknown', bodyCondition:r.bodyCondition || 'unknown',
      timelineComparison:r.timelineComparison || 'insufficient history', recommendedActions:r.recommendedActions || [], trackingNotes:r.trackingNotes || '',
      saveSuggestion:r.saveSuggestion || 'AI Vision timeline photo'
    } : {
      id:imageKey, imageKey, analyzedAt:rkPendingVision.analyzedAt, suggestedId:items[idx].name || '', confidence:'medium', category:items[idx].type || 'other', healthStatus:'uncertain',
      visibleSigns:[], healthConcerns:[], growthAssessment:'', estimatedGrowthPercent:'unknown', bodyCondition:'unknown', timelineComparison:'', recommendedActions:[], trackingNotes:visionSummaryText(), saveSuggestion:'AI Vision timeline note'
    };
    const current = Array.isArray(items[idx].photoAnalyses) ? items[idx].photoAnalyses : [];
    items[idx] = { ...items[idx], photoAnalyses:[entry, ...current].slice(0, 40), updatedAt:new Date().toISOString() };
    if (entry.healthStatus && entry.healthStatus !== 'uncertain') items[idx].status = entry.healthStatus;
    if (!setInventoryItems(items)) throw new Error('Could not save inventory timeline.');
    try { renderInventory(); renderLivestockGuide(); renderSmartTankDashboard(); } catch(e) {}
    showToast('📈 Saved to livestock timeline');
    clearVisionAnalysis('Saved to livestock timeline');
  } catch(e) { console.error(e); showToast('⚠️ Could not save timeline'); }
}

async function saveVisionToTankHistory() {
  if (!rkPendingVision) { showToast('⚠️ Analyze a photo first'); return; }
  try {
    const key = `tank-history-${Date.now().toString(36)}`;
    await saveInventoryPhotoData(key, rkPendingVision.imageDataUrl);
    const items = JSON.parse(localStorage.getItem('reef_tank_history') || '[]');
    items.unshift({ id:key, imageKey:key, title:`AI Vision ${RK_VISION_MODES[rkPendingVision.mode]?.label || 'Photo'}`, notes:visionSummaryText(), createdAt:new Date().toISOString() });
    localStorage.setItem('reef_tank_history', JSON.stringify(items.slice(0, 60)));
    try { renderTankHistory(); } catch(e) {}
    showToast('🖼️ Saved to visual tank history');
    clearVisionAnalysis('Saved to full-tank history');
  } catch(e) { console.error(e); showToast('⚠️ Could not save tank history'); }
}

try { document.addEventListener('DOMContentLoaded', () => { setVisionMode('coral'); }); } catch(e) {}
