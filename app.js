// ── Tank context fed to AI ──────────────────────────────────────────────
const TANK_CONTEXT = `You are Reef Keeper, an expert AI reef tank assistant. You know everything about this specific tank:

TANK: 120 gallon SCA display + 50 gallon Red Sea Reefer sump. Started December 24, 2023.
EQUIPMENT: 2 Jerboa MDP Smart DC return pumps, 2 Hygger 802 titanium heaters, Bubble Magus filter roller, 240 DC Simplicity protein skimmer (outdoor air intake), 27W IceCap UV sterilizer, IceCap 120 GFO reactor (BIG Kahuna GFO, tumbling, ~3 weeks in), DIY two-stage reactor (GFO then ROX 0.8 carbon separated by foam), 4 A8se 11 Max lights, 2 MP40 powerheads + 1 Jebao DMP20, Useek smart ATO (10 gal reservoir), Neptune Apex controller, 5-stage RODI with booster pump, DIY kalk stirrer (not currently running), 55 gal Brute saltwater mixing can. User has cancelled the previous chaeto reactor plan and does not want chaeto reactor setup/reminder/plan tasks unless explicitly changed later.

LIVESTOCK: 2 clownfish (breeding pair, hosting Duncan coral, laying eggs regularly), yellow corgi wrasse, melanurus wrasse, red head Solon wrasse, banggai cardinal, blue chromis, yellow tang, white tail bristle tooth tang, desjardini sailfin tang, orange banded goby, tiger pistol shrimp, Molly Miller blenny, 2 bubble tip anemones (stationary ~1 year, not hosted by clownfish), 2 Halloween hermit crabs, scarlet red leg hermits, Hawaiian blue leg hermits, sand sifting starfish (new, 1-2 months), serpent starfish, 2 fighting conchs, hammer coral (2 surviving colonies), green candy cane coral, purple stylophora (lost), Ricordea mushrooms (stressed, below BTAs — allelopathy issue), Grube's gorgonia, Duncan coral (healthy, clownfish host).

CURRENT PARAMETERS (latest readings):
- Phosphate: 0.65 ppm (was 1.88 peak, dropping with GFO — target 0.05-0.10)
- Alkalinity: 10.0 dKH (was 11.4, target 8.5-9.5, stabilizing)
- Calcium: 478 mg/L (above target 400-440, do NOT dose kalk yet)
- Magnesium: not yet logged in app (typical target ~1280-1400 mg/L; use your actual test value when available)
- Nitrate: 22 ppm (target 5-10)
- pH: 8.4-8.6 (excellent, outdoor skimmer air)
- Temperature: 77.8-78.7°F (stable)
- ORP: 400-423 mV (excellent)
- ICP elevated: Iodine 0.368 (ref 0.055-0.080), Sulfate low at 2298 (ref 2550-2850), Molybdenum 23.5, Barium 55.6

ISSUES:
- ~100 aiptasia spreading — Aiptasia-X treatment planned, then Berghia nudibranch
- 2 Australian Stripy fish were in sump and needed rehoming; if local memory says this was resolved, treat that newer memory as authoritative
- Mushrooms stressed from BTA allelopathy (positioned below BTAs)
- Hair algae mostly treated with Reef Flux, some remains
- Lost SPS (stylophora) and some hammer/torch coral due to high phosphate + alk swings
- No coralline algae growing (phosphate inhibiting calcification)
- Iodine elevated — likely from nori in homemade food, switching to Rod's Frozen Reef Frenzy

SALT: Fritz RPM (returning to this brand)
FEEDING: TDO pellets 3x daily via auto feeder + homemade frozen (switching to Rod's Frozen). Tangs dominate feeder — wrasses need target feeding.
SCHEDULE: A-Watch, 7 days on 12-hour nights / 7 days off rotating. Next/known first day off starts May 13, 2026. Days-off blocks run 7 days, then 7 days on.
DO NOT DOSE KALK until calcium below 450 and alk stable 3+ weeks. Do not suggest starting or maintaining a chaeto reactor; the user has cancelled that plan.

Be concise, warm, and practical. Use emoji occasionally. Reference their specific tank details when relevant.`;

let chatHistory = [];
let currentConversationId = null;
const API_URL = "/api/chat";
const PLAN_API_URL = "/api/plan";
const GENERAL_REEF_CONTEXT = `You are Reef Keeper, a practical reef aquarium assistant. Give safe, general reef husbandry advice. Do not assume Jorge's specific tank parameters, livestock, equipment, or schedule unless the user provides them in the message.`;

// ── Tank context preference ────────────────────────────────────────────────
function getUseTankContext() {
  try { return localStorage.getItem('reef_use_tank_context') !== 'false'; } catch(e) { return true; }
}

function setUseTankContext(enabled) {
  const value = Boolean(enabled);
  try { localStorage.setItem('reef_use_tank_context', value ? 'true' : 'false'); } catch(e) {}
  document.querySelectorAll('.tank-context-toggle').forEach(toggle => { toggle.checked = value; });
}

function initTankContextToggle() {
  setUseTankContext(getUseTankContext());
}

function memoryArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch(e) { return []; }
}

function memoryDateValue(item) {
  const raw = item?.isoDate || item?.completedAt || item?.createdAt || item?.date || 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function memorySortNewest(items) {
  return [...items].sort((a, b) => memoryDateValue(b) - memoryDateValue(a));
}

function memoryLineDate(item) {
  const raw = item?.isoDate || item?.completedAt || item?.createdAt || item?.date;
  const d = new Date(raw);
  if (!raw || Number.isNaN(d.getTime())) return item?.date || 'Recent';
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function memoryNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function compactMemoryLine(text, max = 240) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function buildLogMemoryLine(l) {
  const vals = [
    l.po4 ? `PO4 ${l.po4}` : '',
    l.alk ? `Alk ${l.alk}` : '',
    l.ca ? `Ca ${l.ca}` : '',
    l.mg ? `Mg ${l.mg}` : '',
    l.no3 ? `NO3 ${l.no3}` : '',
    l.ph ? `pH ${l.ph}` : '',
    l.sal ? `SG ${l.sal}` : ''
  ].filter(Boolean).join(', ');
  return `${memoryLineDate(l)}: ${vals || 'parameter log saved'}`;
}

function buildActionMemoryLine(a) {
  return compactMemoryLine(`${memoryLineDate(a)}: ${a.title || 'Action'}${a.category ? ` (${a.category})` : ''}${a.notes ? ` - ${a.notes}` : ''}`);
}

function buildCompletedMemoryLine(h) {
  return compactMemoryLine(`${memoryLineDate(h)}: completed ${h.title || 'task'}${h.type ? ` (${h.type})` : ''}${h.notes ? ` - ${h.notes}` : ''}`);
}

function formatTrendValue(value, key) {
  if (!Number.isFinite(value)) return '';
  if (key === 'sal') return value.toFixed(3);
  if (key === 'po4' || key === 'ph') return value.toFixed(2);
  if (key === 'alk') return value.toFixed(1);
  return Math.round(value).toString();
}

function trendDirection(first, latest) {
  const delta = latest - first;
  if (Math.abs(delta) < 0.0001) return 'flat';
  return delta > 0 ? 'rising' : 'falling';
}

function buildParameterTrendSummary(logs) {
  const params = [
    { key:'po4', label:'Phosphate', unit:'ppm', goal:'target 0.05–0.10; avoid rapid changes' },
    { key:'alk', label:'Alkalinity', unit:'dKH', goal:'target 8.5–9.5; stability matters most' },
    { key:'no3', label:'Nitrate', unit:'ppm', goal:'target roughly 5–10' },
    { key:'ca', label:'Calcium', unit:'mg/L', goal:'avoid kalk until under 450 and alk stable' },
    { key:'mg', label:'Magnesium', unit:'mg/L', goal:'typical reef target about 1280–1400' },
    { key:'ph', label:'pH', unit:'', goal:'watch for sustained low pH' },
    { key:'sal', label:'Salinity', unit:'SG', goal:'target about 1.025–1.026 SG / 35 ppt' }
  ];

  const sorted = [...logs].sort((a, b) => memoryDateValue(a) - memoryDateValue(b));
  const lines = [];
  params.forEach(param => {
    const points = sorted
      .map(log => ({ date: memoryLineDate(log), value: memoryNumber(log[param.key]) }))
      .filter(point => point.value !== null);
    if (!points.length) return;
    const first = points[0];
    const latest = points[points.length - 1];
    const peak = points.reduce((max, p) => p.value > max.value ? p : max, points[0]);
    const low = points.reduce((min, p) => p.value < min.value ? p : min, points[0]);
    const values = points.slice(-8).map(p => formatTrendValue(p.value, param.key)).join(' → ');
    const direction = points.length > 1 ? trendDirection(first.value, latest.value) : 'single reading';
    lines.push(`${param.label}: latest ${formatTrendValue(latest.value, param.key)}${param.unit ? ' ' + param.unit : ''}; trend ${direction}; recent values ${values}; high ${formatTrendValue(peak.value, param.key)} on ${peak.date}; low ${formatTrendValue(low.value, param.key)} on ${low.date}; ${param.goal}.`);
  });
  return lines.length ? lines.join('\n') : 'No parameter trend data beyond the fixed tank profile yet.';
}

function topicFlagsFromText(text) {
  const t = String(text || '').toLowerCase();
  const topics = [];
  const checks = [
    ['phosphate', ['phosphate','po4','gfo']],
    ['alkalinity', ['alk','alkalinity','dkh','kalk']],
    ['chaeto reactor', ['chaeto','cheato','cheeto','reactor']],
    ['aiptasia', ['aiptasia','berghia','aiptasia-x']],
    ['carbon', ['carbon','rox']],
    ['water changes', ['water change','fritz','salt','salinity']],
    ['feeding/livestock', ['feed','feeding','australian','sump','fish','livestock','wrasse','tang']],
    ['corals/anemones', ['coral','hammer','mushroom','ricordea','bta','anemone','duncan','sps','torch']],
    ['equipment', ['skimmer','uv','pump','heater','apex','roller','light']]
  ];
  checks.forEach(([label, words]) => { if (words.some(w => t.includes(w))) topics.push(label); });
  return topics;
}

function buildLongTermTankSummary(logs, actions, completedHistory) {
  const combinedText = [...actions, ...completedHistory]
    .map(item => `${item.title || ''} ${item.category || ''} ${item.notes || ''}`)
    .join(' ');
  const topics = [...new Set(topicFlagsFromText(combinedText))];
  const oldestLog = memorySortNewest(logs).slice(-1)[0];
  const latestLog = memorySortNewest(logs)[0];
  const actionCount = actions.length;
  const completedCount = completedHistory.length;
  const lines = [
    'Long-term decision frame: favor stability and avoid stacking multiple major changes at once. For this tank, parameter trend and coral response should matter more than a single reading.',
    'Core recovery theme from the fixed profile: phosphate has been very high, alkalinity has been elevated/swinging, calcium has been high, SPS/coral losses followed nutrient/alk instability, aiptasia control should be gradual, and kalk should remain off until calcium and alk conditions are appropriate.'
  ];
  if (oldestLog && latestLog && oldestLog !== latestLog) {
    lines.push(`Logged parameter span: ${memoryLineDate(oldestLog)} through ${memoryLineDate(latestLog)}.`);
  }
  if (actionCount || completedCount) {
    lines.push(`Stored local history volume: ${actionCount} maintenance/action entries and ${completedCount} completed reminder/task entries on this device.`);
  }
  if (topics.length) {
    lines.push(`Recurring local-history topics: ${topics.join(', ')}.`);
  }
  return lines.join('\n');
}

function getMemorySearchTerms(userMsg) {
  const base = String(userMsg || '').toLowerCase();
  const words = base.match(/[a-z0-9]+/g) || [];
  const stop = new Set(['the','and','for','with','that','this','what','when','where','why','how','should','could','would','about','from','into','your','my','you','are','is','was','were','have','has','had','can','will','all','any','not','but','out','off','day','days','plan','task','reminder','tank','reef']);
  const terms = words.filter(w => w.length >= 3 && !stop.has(w));
  if (base.includes('chaeto') || base.includes('cheato') || base.includes('cheeto')) terms.push('chaeto','cheato','cheeto','reactor','nitrate','phosphate','light');
  if (base.includes('aiptasia')) terms.push('aiptasia','berghia','treatment','aiptasia-x');
  if (base.includes('phosphate') || base.includes('po4')) terms.push('phosphate','po4','gfo','feeding','water');
  if (base.includes('alk') || base.includes('alkalinity') || base.includes('dkh')) terms.push('alk','alkalinity','dkh','kalk','calcium');
  if (base.includes('mushroom') || base.includes('ricordea')) terms.push('mushroom','ricordea','bta','anemone','allelopathy','carbon');
  if (base.includes('carbon') || base.includes('rox')) terms.push('carbon','rox','reactor');
  return [...new Set(terms)].slice(0, 30);
}

function getRelevantOlderHistory(userMsg, actions, completedHistory, reminders, logs) {
  const terms = getMemorySearchTerms(userMsg);
  if (!terms.length) return [];
  const items = [];
  actions.forEach(a => items.push({ kind:'action', date: memoryDateValue(a), text: buildActionMemoryLine(a), haystack: `${a.title || ''} ${a.category || ''} ${a.notes || ''}`.toLowerCase() }));
  completedHistory.forEach(h => items.push({ kind:'completed', date: memoryDateValue(h), text: buildCompletedMemoryLine(h), haystack: `${h.title || ''} ${h.type || ''} ${h.notes || ''}`.toLowerCase() }));
  reminders.forEach(r => items.push({ kind:'active reminder', date: memoryDateValue(r), text: compactMemoryLine(`${r.title || 'Reminder'} - ${r.when || 'No date'}${r.repeat && r.repeat !== 'none' ? `, ${r.repeat}` : ''}${r.notes ? ` - ${r.notes}` : ''}`), haystack: `${r.title || ''} ${r.notes || ''} ${r.when || ''} ${r.repeat || ''} ${r.category || ''}`.toLowerCase() }));
  logs.forEach(l => items.push({ kind:'parameter log', date: memoryDateValue(l), text: buildLogMemoryLine(l), haystack: buildLogMemoryLine(l).toLowerCase() }));

  return items
    .map(item => ({ ...item, score: terms.reduce((score, term) => score + (item.haystack.includes(term) ? 1 : 0), 0) }))
    .filter(item => item.score > 0)
    .sort((a, b) => (b.score - a.score) || (b.date - a.date))
    .slice(0, 18)
    .map(item => `${item.kind}: ${item.text}`);
}

function getActiveTaskMemoryLines() {
  if (typeof getAllActiveReefTasksForPlanning !== 'function') return [];
  try {
    return getAllActiveReefTasksForPlanning().slice(0, 30).map(task => compactMemoryLine(`${task.title || 'Task'}${task.when ? ` - ${task.when}` : ''}${task.repeat && task.repeat !== 'none' ? `, ${task.repeat}` : ''}${task.scheduledDay ? `, scheduled Day ${task.scheduledDay}` : ''}${task.notes ? ` - ${task.notes}` : ''}`));
  } catch(e) { return []; }
}

function getLocalTankMemorySummary(userMsg = '') {
  const logs = memorySortNewest([...getDefaultLogs(), ...memoryArray('reef_logs')]);
  const actions = memorySortNewest(memoryArray('reef_actions'));
  const reminders = memorySortNewest(memoryArray('reef_ai_reminders')).filter(r => !r.completed);
  const completedHistory = memorySortNewest(memoryArray('reef_completed_history'));

  const recentLogLines = logs.slice(0, 20).map(buildLogMemoryLine);
  const actionLines = actions.slice(0, 30).map(buildActionMemoryLine);
  const reminderLines = reminders.slice(0, 20).map(r => compactMemoryLine(`${r.title || 'Reminder'} - ${r.when || 'No date'}${r.repeat && r.repeat !== 'none' ? `, ${r.repeat}` : ''}${r.notes ? ` - ${r.notes}` : ''}`));
  const completedLines = completedHistory.slice(0, 30).map(buildCompletedMemoryLine);
  const activeTaskLines = getActiveTaskMemoryLines();
  const relevantLines = getRelevantOlderHistory(userMsg, actions, completedHistory, reminders, logs);
  const knowledgeLines = getTankKnowledgeMemoryLines();

  return `\n\nEXPANDED LOCAL TANK MEMORY FROM THIS DEVICE:\nUse this memory when the tank-context toggle is on. Prioritize the user's newest message, then current/latest logs, then trends and relevant history. Do not overreact to one data point if the longer trend suggests stability or gradual recovery.\n\nTANK KNOWLEDGE BASE (persistent decisions and rules):\n${knowledgeLines.length ? knowledgeLines.join('\\n') : 'No tank knowledge base notes yet.'}\n\nCURRENT PARAMETER TREND SUMMARY:\n${buildParameterTrendSummary(logs)}\n\nROLLING LONG-TERM TANK SUMMARY:\n${buildLongTermTankSummary(logs, actions, completedHistory)}\n\nRECENT DETAILED PARAMETER LOGS (newest first, up to 20):\n${recentLogLines.length ? recentLogLines.join('\n') : 'No user-entered parameter logs yet.'}\n\nRECENT MAINTENANCE/ACTION HISTORY (newest first, up to 30):\n${actionLines.length ? actionLines.join('\n') : 'No actions logged yet.'}\n\nRECENT COMPLETED REMINDERS/TASKS (newest first, up to 30):\n${completedLines.length ? completedLines.join('\n') : 'No completed reminder/task history yet.'}\n\nACTIVE REEF TASKS AND SCHEDULED PLAN ITEMS:\n${activeTaskLines.length ? activeTaskLines.join('\n') : (reminderLines.length ? reminderLines.join('\n') : 'No active saved reminders/tasks.')}\n\nQUESTION-RELEVANT OLDER HISTORY RETRIEVED FROM LOCAL DATA:\n${relevantLines.length ? relevantLines.join('\n') : 'No specific older local-history matches found for this question.'}`;
}



// ── Answer style / model mode ──────────────────────────────────────────────
function getModelMode() {
  try { return localStorage.getItem('reef_model_mode') || 'balanced'; } catch(e) { return 'balanced'; }
}

function setModelMode(mode) {
  const allowed = ['quick', 'balanced', 'deep', 'simple'];
  const selected = allowed.includes(mode) ? mode : 'balanced';
  try { localStorage.setItem('reef_model_mode', selected); } catch(e) {}
  document.querySelectorAll('.model-selector').forEach(sel => { sel.value = selected; });
}

function initModelMode() {
  setModelMode(getModelMode());
}


function scrollActivePageToTop(event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  const content = document.querySelector('.app-content');
  if (!content) return;
  try {
    content.scrollTo({ top: 0, behavior: 'smooth' });
  } catch(e) {
    content.scrollTop = 0;
  }
}

function updateGlobalScrollTopVisibility() {
  const btn = document.getElementById('global-scroll-top-btn') || document.querySelector('.scroll-top-btn');
  const activePage = document.querySelector('.page.active');
  if (!btn || !activePage) return;
  btn.classList.toggle('hidden', activePage.id === 'page-chat');
}

function scrollCatalogToTop(event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  const panel = document.querySelector('#catalog-overlay .catalog-panel');
  const overlay = document.getElementById('catalog-overlay');
  const list = document.getElementById('livestock-catalog-list');
  [panel, overlay, list].filter(Boolean).forEach(el => {
    try { el.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch(e) { el.scrollTop = 0; }
  });
}


let currentInventoryTab = 'fish';

function openLongTermTool(tool) {
  const overlay = document.getElementById(`tool-${tool}-overlay`);
  if (!overlay) return;
  overlay.classList.add('visible');
  if (tool === 'inventory') { renderInventory(); renderLivestockGuide(); }
  if (tool === 'strategy') { renderGuardrails(); renderMaintenanceIntervals(); }
  if (tool === 'summary') { refreshLongTermSummary(); }
  setTimeout(() => scrollToolToTop(tool), 20);
}

function closeLongTermTool(tool) {
  const overlay = document.getElementById(`tool-${tool}-overlay`);
  if (overlay) overlay.classList.remove('visible');
}

function handleToolOverlayClick(event, tool) {
  if (event.target && event.target.id === `tool-${tool}-overlay`) closeLongTermTool(tool);
}

function scrollToolToTop(tool) {
  const body = document.getElementById(`tool-${tool}-body`);
  if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
}

function setInventoryTab(tab) {
  const allowed = ['fish', 'invert', 'coral'];
  currentInventoryTab = allowed.includes(tab) ? tab : 'fish';
  document.querySelectorAll('.inventory-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.inventoryTab === currentInventoryTab);
  });
  const type = document.getElementById('inventory-type');
  if (type) type.value = currentInventoryTab === 'coral' ? 'coral' : currentInventoryTab;
  renderInventory();
  scrollToolToTop('inventory');
}

function inventoryTabGroup(item) {
  const type = String(item?.type || 'other').toLowerCase();
  if (type === 'fish') return 'fish';
  if (type === 'coral' || type === 'anemone') return 'coral';
  return 'invert';
}

function toggleLivestockCatalogCard(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('expanded');
}

// ── Navigation ──────────────────────────────────────────────────────────────
function showPage(name, btn) {
  const page = document.getElementById('page-' + name);
  if (!page) {
    console.warn('Missing page:', name);
    showToast('⚠️ Page not found');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  page.classList.add('active');
  if (btn) btn.classList.add('active');
  updateGlobalScrollTopVisibility();
  const content = document.querySelector('.app-content');
  if (content) content.scrollTop = 0;
  if (name === 'chat') autoRefreshQuickQuestionsOnChatOpen();
  if (name === 'home') { renderTankStatus(); renderRecentChangesHome(); }
  if (name === 'log') renderLongTermTools();
}


function openLivestockCatalog() {
  renderLivestockCatalogModal();
  const overlay = document.getElementById('catalog-overlay');
  if (overlay) overlay.classList.add('visible');
}

function closeLivestockCatalog() {
  const overlay = document.getElementById('catalog-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function handleCatalogOverlayClick(event) {
  if (event.target && event.target.id === 'catalog-overlay') closeLivestockCatalog();
}

// ── Backend AI call ─────────────────────────────────────────────────────────
async function askOpenAI(userMsg, history, modelMode = getModelMode()) {
  const messages = history.length > 0
    ? [...history, { role: 'user', content: userMsg }]
    : [{ role: 'user', content: userMsg }];

  const useTankContext = getUseTankContext();
  const selectedSystem = useTankContext ? `${TANK_CONTEXT}${getLocalTankMemorySummary(userMsg)}` : GENERAL_REEF_CONTEXT;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: selectedSystem,
      messages,
      modelMode,
      useTankContext
    })
  });

  let data = {};
  try { data = await response.json(); } catch(e) {}

  if (!response.ok || data.error) {
    throw new Error(data.error || `Backend error ${response.status}`);
  }

  return {
    answer: data.answer || '',
    reminders: Array.isArray(data.reminders) ? data.reminders : []
  };
}

// ── Smart randomized question ideas ─────────────────────────────────────────
const LOCAL_QUICK_QUESTION_POOL = [
  'What is the next safest thing I should do for the tank?',
  'What am I most likely overlooking right now?',
  'Do my latest parameters suggest stability or risk?',
  'What should I avoid changing this week?',
  'What would you inspect first if you were standing in front of the tank?',
  'What is the most likely reason corals are not improving yet?',
  'How should I space out reef work this days-off block?',
  'What does my phosphate trend suggest I should do next?',
  'Is my alkalinity trend safe enough to make changes?',
  'Should I adjust GFO or hold steady?',
  'What should I watch after changing carbon or GFO?',
  'How should I handle aiptasia without stressing the tank?',
  'What should I look for before adding more coral?',
  'What maintenance should be done before my next work block?',
  'What does my maintenance history suggest is helping most?',
  'What task should I move later in the week to avoid stacking stress?',
  'What is the simplest reef task that would give the most benefit today?',
  'What should I log today that would help future advice?',
  'Are my nutrients changing too fast or too slowly?',
  'What would be a good observation checklist for tonight?'
];

let quickQuestionsLoading = false;
let lastQuickQuestionsAutoRefreshAt = 0;
const QUICK_QUESTION_AUTO_REFRESH_MS = 5 * 60 * 1000;

function shouldAutoRefreshQuickQuestions(force = false) {
  if (force) return true;
  if (quickQuestionsLoading) return false;
  return Date.now() - lastQuickQuestionsAutoRefreshAt > QUICK_QUESTION_AUTO_REFRESH_MS;
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cleanQuickQuestion(text) {
  return String(text || '')
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^['\"]|['\"]$/g, '')
    .trim();
}

function parseQuickQuestionIdeas(answer) {
  return String(answer || '')
    .split(/\n+/)
    .map(cleanQuickQuestion)
    .filter(q => q.length > 12 && q.length < 120)
    .filter(q => !/chaeto|cheato|cheeto|australian|stripy/i.test(q))
    .slice(0, 4);
}

function renderQuickQuestions(questions) {
  const container = document.getElementById('quick-questions');
  if (!container) return;
  const chosen = (Array.isArray(questions) && questions.length)
    ? questions.slice(0, 4)
    : shuffleArray(LOCAL_QUICK_QUESTION_POOL).slice(0, 4);

  container.innerHTML = chosen.map(q =>
    `<button class="quick-q" onclick="sendQuickQ(this)">${escapeHtml(q)}</button>`
  ).join('');
}

async function refreshQuickQuestionsWithAI(options = {}) {
  const silent = !!options.silent;
  if (quickQuestionsLoading) return;
  quickQuestionsLoading = true;
  lastQuickQuestionsAutoRefreshAt = Date.now();
  const btn = document.getElementById('quick-question-refresh');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Thinking...';
  }

  try {
    const prompt = `Create exactly 4 short, useful question prompts the reef keeper might not think to ask next. Base them on this specific tank context, recent logs, active tasks, and days-off plan, but also frame the ideas against best practices from stable successful mixed reef systems. Prefer questions that help notice overlooked risks, timing/spacing issues, parameter trends, livestock/coral response, maintenance gaps, or next-step decisions. Do not invent live research or claim to have checked other tanks online. Avoid chaeto/cheato/cheeto reactor topics because that plan is cancelled. Avoid Australian Stripy rehoming/feeding topics if that issue is resolved. Return only the 4 questions, one per line, with no numbering.`;
    const result = await askOpenAI(prompt, [], 'quick');
    const ideas = parseQuickQuestionIdeas(result.answer);
    renderQuickQuestions(ideas.length ? ideas : null);
    if (!silent) showToast(ideas.length ? '✨ Fresh question ideas loaded' : '✨ New ideas loaded');
  } catch(e) {
    renderQuickQuestions();
    if (!silent) showToast('Using local question ideas');
  } finally {
    quickQuestionsLoading = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✨ Surprise me';
    }
  }
}

function autoRefreshQuickQuestionsOnChatOpen() {
  renderQuickQuestions();
  if (shouldAutoRefreshQuickQuestions()) {
    refreshQuickQuestionsWithAI({ silent: true });
  }
}


// ── File attachment state ───────────────────────────────────────────────────
let attachedFileContext = null;

function updateAttachmentStatus() {
  const box = document.getElementById('attachment-status');
  const label = document.getElementById('attachment-label');
  if (!box || !label) return;
  if (attachedFileContext) {
    label.textContent = `📎 ${attachedFileContext.name}`;
    box.classList.add('visible');
  } else {
    label.textContent = '📎 File attached';
    box.classList.remove('visible');
  }
}

function clearAttachment() {
  attachedFileContext = null;
  const input = document.getElementById('file-input');
  if (input) input.value = '';
  updateAttachmentStatus();
}

function handleFileUpload(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '').slice(0, 12000);
    attachedFileContext = { name: file.name, text };
    updateAttachmentStatus();
    showToast('📎 File attached');
  };
  reader.onerror = () => {
    clearAttachment();
    showToast('⚠️ Could not read file');
  };
  reader.readAsText(file);
}


// ── Ask AI conversation history ─────────────────────────────────────────────
const CHAT_CONVERSATIONS_KEY = 'reef_chat_conversations';

function getChatConversations() {
  try {
    const value = JSON.parse(localStorage.getItem(CHAT_CONVERSATIONS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch(e) { return []; }
}

function setChatConversations(items) {
  try {
    localStorage.setItem(CHAT_CONVERSATIONS_KEY, JSON.stringify(items.slice(0, 60)));
  } catch(e) {
    console.warn('Could not save conversation history:', e);
    showToast('⚠️ Could not save chat history. Export a backup or clear old browser data.');
  }
}

function chatConversationTitle(messages) {
  const firstUser = (messages || []).find(m => m && m.role === 'user' && m.content);
  const raw = firstUser ? firstUser.content : 'New reef conversation';
  return compactMemoryLine(String(raw).replace(/Attached file for context[\s\S]*/i, '').trim(), 54) || 'New reef conversation';
}

function chatConversationPreview(messages) {
  const last = [...(messages || [])].reverse().find(m => m && m.content);
  return compactMemoryLine(last ? last.content : 'No messages yet.', 110);
}

function ensureCurrentConversationId() {
  if (!currentConversationId) currentConversationId = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return currentConversationId;
}

function saveCurrentConversation() {
  if (!Array.isArray(chatHistory) || chatHistory.length === 0) return;
  const id = ensureCurrentConversationId();
  const now = new Date().toISOString();
  const existing = getChatConversations();
  const old = existing.find(c => c.id === id);
  const item = {
    id,
    title: old?.title || chatConversationTitle(chatHistory),
    createdAt: old?.createdAt || now,
    updatedAt: now,
    modelMode: getModelMode ? getModelMode() : 'balanced',
    useTankContext: getUseTankContext ? getUseTankContext() : true,
    messages: chatHistory.slice(-80)
  };
  const next = [item, ...existing.filter(c => c.id !== id)]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  setChatConversations(next);
}

function initialChatMessageHtml() {
  return `<div class="msg ai">
    <div class="msg-avatar">🐠</div>
    <div class="msg-bubble">Hey! I'm your Reef Keeper AI assistant. I know all about your 120 gallon tank — your current parameters, your livestock, your equipment, and your recovery plan. Ask me anything!</div>
  </div>`;
}

function renderChatFromHistory(messages) {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  box.innerHTML = initialChatMessageHtml();
  (messages || []).forEach(m => appendMsg(m.role === 'assistant' ? 'ai' : 'user', m.content || ''));
  scrollChatToBottom();
}

function startNewChat() {
  if (chatHistory.length) saveCurrentConversation();
  chatHistory = [];
  currentConversationId = null;
  clearAttachment?.();
  const input = document.getElementById('chat-input');
  if (input) { input.value = ''; input.style.height = 'auto'; }
  const box = document.getElementById('chat-messages');
  if (box) box.innerHTML = initialChatMessageHtml();
  showToast('Started a new chat');
}

function openChatHistory() {
  saveCurrentConversation();
  renderChatHistoryList();
  const overlay = document.getElementById('chat-history-overlay');
  if (overlay) overlay.classList.add('visible');
}

function closeChatHistory() {
  const overlay = document.getElementById('chat-history-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function handleChatHistoryOverlayClick(event) {
  if (event.target && event.target.id === 'chat-history-overlay') closeChatHistory();
}

function scrollChatHistoryToTop() {
  const panel = document.querySelector('#chat-history-overlay .catalog-panel');
  if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderChatHistoryList() {
  const list = document.getElementById('chat-history-list');
  if (!list) return;
  const query = String(document.getElementById('chat-history-search')?.value || '').trim().toLowerCase();
  const items = getChatConversations().filter(c => {
    if (!query) return true;
    const hay = [c.title, ...(c.messages || []).map(m => m.content)].join(' ').toLowerCase();
    return hay.includes(query);
  });
  if (!items.length) {
    list.innerHTML = `<div class="history-empty">No saved conversations found.</div>`;
    return;
  }
  list.innerHTML = items.map(c => {
    const date = new Date(c.updatedAt || c.createdAt || Date.now());
    const when = Number.isNaN(date.getTime()) ? 'Saved conversation' : date.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    const count = Array.isArray(c.messages) ? c.messages.length : 0;
    return `<div class="history-item" data-chat-id="${escapeHtml(c.id)}">
      <div class="history-title">${escapeHtml(c.title || 'Reef conversation')}</div>
      <div class="history-meta">${escapeHtml(when)} · ${count} message${count === 1 ? '' : 's'}</div>
      <div class="history-preview">${escapeHtml(chatConversationPreview(c.messages || []))}</div>
      <div class="history-actions">
        <button class="history-open-btn" type="button" onclick="loadChatConversation('${escapeHtml(c.id)}')">Open / continue</button>
        <button class="history-delete-btn" type="button" onclick="deleteChatConversation('${escapeHtml(c.id)}', event)">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function loadChatConversation(id) {
  const item = getChatConversations().find(c => c.id === id);
  if (!item) return showToast('Conversation not found');
  currentConversationId = item.id;
  chatHistory = Array.isArray(item.messages) ? item.messages.slice(-80) : [];
  renderChatFromHistory(chatHistory);
  closeChatHistory();
  showPage('chat', document.querySelector('.nav-btn[onclick*="chat"]'));
}

function deleteChatConversation(id, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const next = getChatConversations().filter(c => c.id !== id);
  setChatConversations(next);
  if (currentConversationId === id) {
    currentConversationId = null;
    chatHistory = [];
    const box = document.getElementById('chat-messages');
    if (box) box.innerHTML = initialChatMessageHtml();
  }
  renderChatHistoryList();
  showToast('Conversation deleted');
}

// ── Chat ────────────────────────────────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat(e);
  }
}

function sendQuickQ(btn) {
  document.getElementById('chat-input').value = btn.textContent;
  sendChat();
}

function appendMsg(role, text) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const avatar = role === 'ai' ? '<div class="msg-avatar">🐠</div>' : '';
  div.innerHTML = `${avatar}<div class="msg-bubble">${text.replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function appendSuggestedReminders(reminders) {
  if (!Array.isArray(reminders) || reminders.length === 0) return;

  const msgs = document.getElementById('chat-messages');
  reminders.forEach(reminder => {
    const div = document.createElement('div');
    div.className = 'suggested-reminder-card';
    div.innerHTML = `
      <div class="suggested-reminder-label">Suggested reminder</div>
      <div class="suggested-reminder-title">${escapeHtml(reminder.emoji || '⏰')} ${escapeHtml(reminder.title)}</div>
      <div class="suggested-reminder-detail">
        ${escapeHtml(reminder.when || 'No date set')}
        ${reminder.repeat && reminder.repeat !== 'none' ? ` · ${escapeHtml(reminder.repeat)}` : ''}<br>
        ${escapeHtml(reminder.notes || '')}
      </div>
      <div class="suggested-reminder-actions">
        <button class="reminder-action-btn reminder-save-btn">Save Reminder</button>
        <button class="reminder-action-btn reminder-dismiss-btn">Dismiss</button>
      </div>
    `;

    div.querySelector('.reminder-save-btn').addEventListener('click', () => {
      saveSuggestedReminder(reminder);
      div.remove();
      showToast('✅ Reminder saved');
    });

    div.querySelector('.reminder-dismiss-btn').addEventListener('click', () => {
      div.remove();
    });

    msgs.appendChild(div);
  });
  msgs.scrollTop = msgs.scrollHeight;
}


function normalizeManagementText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/cheato/g, 'chaeto')
    .replace(/cheeto/g, 'chaeto')
    .replace(/aiptasiax/g, 'aiptasia x')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseManagementCommand(text) {
  const normalized = normalizeManagementText(text);
  const isRemove = /(remove|delete|clear|hide|cancel|drop)/.test(normalized) || normalized.includes('get rid of');
  const mentionsManagedArea = /(reminder|reminders|plan|plans|task|tasks|checklist)/.test(normalized);
  if (!isRemove || !mentionsManagedArea) return null;

  const knownTopicMap = [
    { key: 'chaeto reactor', terms: ['chaeto', 'reactor'] },
    { key: 'chaeto', terms: ['chaeto'] },
    { key: 'aiptasia', terms: ['aiptasia'] },
    { key: 'australians', terms: ['australian', 'australians', 'stripy'] },
    { key: 'gfo', terms: ['gfo'] },
    { key: 'carbon', terms: ['carbon', 'rox'] },
    { key: 'water change', terms: ['water', 'change'] },
    { key: 'phosphate', terms: ['phosphate', 'po4'] },
    { key: 'alkalinity', terms: ['alkalinity', 'alk'] },
    { key: 'icp', terms: ['icp'] }
  ];
  const topic = knownTopicMap.find(t => t.terms.some(term => normalized.includes(term)));
  const scope = normalized.includes('plan') || normalized.includes('task') ? (normalized.includes('reminder') ? 'all' : 'plans') : 'reminders';

  const stop = new Set(['please','can','you','remove','delete','clear','hide','cancel','drop','get','rid','of','all','the','my','reef','keeper','reminder','reminders','plan','plans','task','tasks','checklist','or','and','from','for','about']);
  const fallbackTerms = normalized.split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
  const terms = topic ? topic.terms : fallbackTerms;
  if (!terms.length) return null;
  return { action: 'remove', scope, topicLabel: topic ? topic.key : terms.join(' '), terms };
}

function textMatchesTerms(text, terms) {
  const n = normalizeManagementText(text);
  return terms.some(term => n.includes(normalizeManagementText(term)));
}

function findManagementMatches(command) {
  const hiddenStatic = new Set(getHiddenStaticReminders());
  const matches = { staticIds: [], savedIds: [], planTaskIds: [], labels: [] };

  if (command.scope !== 'plans') {
    STATIC_REMINDER_LIBRARY.forEach(r => {
      if (hiddenStatic.has(r.id)) return;
      if (textMatchesTerms(`${r.id} ${r.title} ${r.detail} ${r.group}`, command.terms)) {
        matches.staticIds.push(r.id);
        matches.labels.push(`Reminder: ${r.title}`);
      }
    });

    normalizeSavedReminderRecurrences().forEach(r => {
      if (textMatchesTerms(`${r.title} ${r.notes} ${r.when} ${r.repeat} ${r.category}`, command.terms)) {
        matches.savedIds.push(r.id);
        matches.labels.push(`Saved AI reminder: ${r.title}`);
      }
    });
  }

  if (command.scope !== 'reminders') {
    const hiddenPlan = new Set(getHiddenPlanTasks());
    getCurrentDaysOffPlan().days.forEach(day => {
      day.tasks.forEach((task, idx) => {
        const taskId = `d${day.day}-t${idx}`;
        if (hiddenPlan.has(taskId)) return;
        if (textMatchesTerms(`${day.title} ${task}`, command.terms)) {
          matches.planTaskIds.push(taskId);
          matches.labels.push(`Days-off plan: Day ${day.day} — ${task}`);
        }
      });
    });
  }

  return matches;
}

function appendManagementCard(command, matches) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'management-card';
  const visibleLabels = matches.labels.slice(0, 8).map(label => `• ${escapeHtml(label)}`).join('<br>');
  const extra = matches.labels.length > 8 ? `<br>• and ${matches.labels.length - 8} more` : '';
  div.innerHTML = `
    <div class="management-card-title">Confirm cleanup</div>
    <div class="management-card-text">I found ${matches.labels.length} item${matches.labels.length === 1 ? '' : 's'} matching “${escapeHtml(command.topicLabel)}.” Remove them from active reminders/plans?</div>
    <div class="management-match-list">${visibleLabels}${extra}</div>
    <div class="management-actions">
      <button class="management-btn management-confirm-btn">Remove matches</button>
      <button class="management-btn management-cancel-btn">Cancel</button>
    </div>`;

  div.querySelector('.management-confirm-btn').addEventListener('click', () => {
    applyManagementRemoval(matches);
    div.remove();
    appendMsg('ai', `Done — I removed ${matches.labels.length} matching reminder/plan item${matches.labels.length === 1 ? '' : 's'} for “${command.topicLabel}.”`);
  });
  div.querySelector('.management-cancel-btn').addEventListener('click', () => div.remove());
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeCompletedHistoryForPlanTaskIds(taskIds) {
  if (!taskIds || !taskIds.length) return;
  const ids = new Set(taskIds);
  const history = getCompletedHistoryEntries().filter(h => {
    if (h.source !== 'Days-Off Work Plan') return true;
    return !Array.from(ids).some(taskId => String(h.sourceId || '').endsWith(`-${taskId}`));
  });
  setCompletedHistoryEntries(history);
}

function applyManagementRemoval(matches) {
  if (matches.savedIds.length) {
    const removeSaved = new Set(matches.savedIds);
    setSavedReminders(normalizeSavedReminderRecurrences().filter(r => !removeSaved.has(r.id)));
    matches.savedIds.forEach(id => removeCompletedHistoryFor(id, 'AI Reminder'));
  }
  if (matches.staticIds.length) {
    const hidden = new Set(getHiddenStaticReminders());
    matches.staticIds.forEach(id => {
      hidden.add(id);
      removeCompletedHistoryFor(id, 'Built-in Reminder');
    });
    setHiddenStaticReminders(Array.from(hidden));
  }
  if (matches.planTaskIds.length) {
    const hiddenPlan = new Set(getHiddenPlanTasks());
    matches.planTaskIds.forEach(id => hiddenPlan.add(id));
    setHiddenPlanTasks(Array.from(hiddenPlan));
    removeCompletedHistoryForPlanTaskIds(matches.planTaskIds);
  }

  renderSavedReminders();
  renderReminderCenter();
  renderDaysOffWorkPlan();
  renderCompletedHistory();
  initStaticReminderChecks();
  showToast('✅ Cleanup complete');
}

function handleManagementCommandIfNeeded(text) {
  const command = parseManagementCommand(text);
  if (!command) return false;
  appendMsg('user', text);
  const matches = findManagementMatches(command);
  if (!matches.labels.length) {
    appendMsg('ai', `I did not find any active reminders or days-off plan items matching “${command.topicLabel}.”`);
    return true;
  }
  appendMsg('ai', 'I can do that. I found matching items, but I need your approval before removing them.');
  appendManagementCard(command, matches);
  return true;
}

function showTyping() {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="msg-avatar">🐠</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

function scrollChatToBottom() {
  const content = document.querySelector('.app-content');
  const messages = document.getElementById('chat-messages');
  requestAnimationFrame(() => {
    try {
      if (messages && messages.lastElementChild) {
        messages.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
      } else if (content) {
        content.scrollTop = content.scrollHeight;
      }
    } catch(e) {
      if (content) content.scrollTop = content.scrollHeight;
    }
  });
}

async function sendChat(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  if (handleManagementCommandIfNeeded(text)) {
    input.value = '';
    input.style.height = 'auto';
    scrollChatToBottom();
    return;
  }

  let capturedUpdate = null;
  try {
    capturedUpdate = autoCaptureTankUpdateFromChat(text);
  } catch(e) {
    console.warn('Tank update auto-capture failed:', e);
  }

  try {
    appendMsg('user', attachedFileContext ? `${text}\n\n📎 Attached: ${attachedFileContext.name}` : text);
    input.value = '';
    input.style.height = 'auto';
    scrollChatToBottom();
  } catch(e) {
    console.error('Could not add user message:', e);
    try { appendMsg('ai', '⚠️ Something went wrong adding your question. Please reload the app and try again.'); } catch(_) {}
    return;
  }

  if (capturedUpdate) {
    appendMsg('ai', `Noted — I updated your tank memory: ${capturedUpdate.label}. I also removed matching active reminders/plan items so future days-off plans should not include them.`);
    scrollChatToBottom();
  }

  const textForAI = attachedFileContext
    ? `${text}\n\nAttached file for context (${attachedFileContext.name}):\n\n${attachedFileContext.text}`
    : text;

  chatHistory.push({ role: 'user', content: textForAI });
  saveCurrentConversation();

  showTyping();
  scrollChatToBottom();

  try {
    const result = await askOpenAI(textForAI, chatHistory.slice(0, -1), getModelMode());
    removeTyping();
    appendMsg('ai', result.answer || 'I received your question, but the answer came back empty.');
    appendSuggestedReminders(result.reminders);
    chatHistory.push({ role: 'assistant', content: result.answer || '' });
    if (chatHistory.length > 80) chatHistory = chatHistory.slice(-80);
    saveCurrentConversation();
    if (attachedFileContext) clearAttachment();
    scrollChatToBottom();
  } catch(e) {
    console.error('Ask AI failed:', e);
    removeTyping();
    appendMsg('ai', '⚠️ Couldn\'t connect to AI. Please check your connection and try again.');
    scrollChatToBottom();
  }
}

// ── Parameter logging ───────────────────────────────────────────────────────
function saveLog() {
  const po4 = document.getElementById('log-po4').value;
  const alk = document.getElementById('log-alk').value;
  const ca  = document.getElementById('log-ca').value;
  const no3 = document.getElementById('log-no3').value;
  const ph  = document.getElementById('log-ph').value;
  const sal = document.getElementById('log-sal').value;
  const mg  = document.getElementById('log-mg').value;

  if (!po4 && !alk && !no3 && !ca && !ph && !sal && !mg) {
    showToast('⚠️ Enter at least one parameter');
    return;
  }

  const entry = { date: new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}), isoDate: new Date().toISOString(), po4, alk, ca, no3, ph, sal, mg };
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem('reef_logs') || '[]'); } catch(e) {}
  logs.unshift(entry);
  if (logs.length > 30) logs = logs.slice(0, 30);
  try { localStorage.setItem('reef_logs', JSON.stringify(logs)); } catch(e) {}

  renderLogHistory();
  renderTrendControls();
  renderTrendChart(currentTrendParam);
  updateHomeChips(entry);
  renderTankStatus();

  ['log-po4','log-alk','log-ca','log-no3','log-ph','log-sal','log-mg'].forEach(id => {
    document.getElementById(id).value = '';
  });

  showToast('✅ Reading saved!');
}

function renderLogHistory() {
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem('reef_logs') || '[]'); } catch(e) {}

  const container = document.getElementById('log-history');
  if (logs.length === 0) return;

  const defaultLogs = [
    { date: 'May 5, 2026',  po4:'0.65', alk:'10.0', no3:'22' },
    { date: 'Apr 22, 2026', po4:'0.90', alk:'11.4', no3:'22.1' },
    { date: 'Apr 2, 2026',  po4:'0.90', alk:'8.8',  no3:'20.9' },
  ];
  const allLogs = [...logs, ...defaultLogs].slice(0, 10);

  container.innerHTML = allLogs.map(l => {
    const vals = [
      l.po4 ? `PO₄: ${l.po4}` : '',
      l.alk ? `Alk: ${l.alk}` : '',
      l.no3 ? `NO₃: ${l.no3}` : '',
      l.ca  ? `Ca: ${l.ca}`   : '',
      l.mg  ? `Mg: ${l.mg}`   : '',
      l.ph  ? `pH: ${l.ph}`   : '',
      l.sal ? `SG: ${l.sal}`  : '',
    ].filter(Boolean).join(' · ');
    return `<div class="log-history-item">
      <div>
        <div class="log-date">${l.date}</div>
        <div class="log-vals">${vals}</div>
      </div>
    </div>`;
  }).join('');
}

function formatHomeChipValue(raw, unit, decimals = null) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  const val = decimals === null ? String(raw) : n.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return `${val}${unit ? ` <span class="status-chip-unit">${unit}</span>` : ''}`;
}

function getLatestValueForKey(key) {
  const logs = getAllLogsForCharts().slice().reverse();
  const found = logs.find(log => log && log[key] !== undefined && log[key] !== null && log[key] !== '');
  return found || null;
}

function updateHomeChips(entry = null) {
  const grid = document.getElementById('home-params-grid');
  if (!grid) return;

  // Use the latest logged value for each parameter, not just the fields entered in the most recent save.
  // That way a partial log, such as only phosphate + alkalinity, does not blank out pH/nitrate.
  const sourceFor = key => {
    if (entry && entry[key] !== undefined && entry[key] !== null && entry[key] !== '') return entry;
    return getLatestValueForKey(key);
  };

  const defs = [
    { key:'po4', label:'Phosphate', unit:'ppm', decimals:2, threshold: v => v > 0.3 ? 'critical' : v > 0.1 ? 'warn' : 'good' },
    { key:'alk', label:'Alkalinity', unit:'dKH', decimals:1, threshold: v => v > 10 || v < 8 ? 'warn' : 'good' },
    { key:'no3', label:'Nitrate', unit:'ppm', decimals:1, threshold: v => v > 15 ? 'warn' : 'good' },
    { key:'ph',  label:'pH', unit:'', decimals:2, threshold: v => v < 8.2 ? 'critical' : 'good' },
    { key:'ca',  label:'Calcium', unit:'mg/L', decimals:0, threshold: v => v > 450 || v < 380 ? 'warn' : 'good' },
    { key:'mg',  label:'Magnesium', unit:'mg/L', decimals:0, threshold: v => v > 1450 || v < 1250 ? 'warn' : 'good' },
    { key:'sal', label:'Salinity', unit:'SG', decimals:3, threshold: v => v < 1.024 || v > 1.027 ? 'warn' : 'good' },
  ];

  const items = defs.map(d => {
    const src = sourceFor(d.key);
    const raw = src ? src[d.key] : null;
    const val = formatHomeChipValue(raw, d.unit, d.decimals);
    if (!val) return null;
    return { ...d, val, raw };
  }).filter(Boolean).slice(0, 3);

  if (items.length === 0) {
    grid.innerHTML = '<button class="status-chip catalog-chip" onclick="openLivestockCatalog()" type="button"><div class="status-chip-label">Livestock</div><div class="status-chip-val">Catalog</div><span class="catalog-subtitle">Photos, names & notes</span></button>';
    return;
  }

  const catalogChip = `<button class="status-chip catalog-chip" onclick="openLivestockCatalog()" type="button">
      <div class="status-chip-label">Livestock</div>
      <div class="status-chip-val">Catalog</div>
      <span class="catalog-subtitle">Photos, names & notes</span>
    </button>`;
  grid.innerHTML = items.map(i => {
    const numVal = parseFloat(i.raw);
    const cls = i.threshold(numVal);
    return `<div class="status-chip ${cls}">
      <div class="status-chip-label">${i.label}</div>
      <div class="status-chip-val">${i.val}</div>
    </div>`;
  }).join('') + catalogChip;
}

// ── AI Analysis of current inputs ───────────────────────────────────────────
async function analyzeLog() {
  const po4 = document.getElementById('log-po4').value;
  const alk = document.getElementById('log-alk').value;
  const ca  = document.getElementById('log-ca').value;
  const no3 = document.getElementById('log-no3').value;
  const ph  = document.getElementById('log-ph').value;
  const sal = document.getElementById('log-sal').value;
  const mg  = document.getElementById('log-mg').value;

  if (!po4 && !alk && !no3 && !ca && !mg) {
    showToast('⚠️ Enter parameters to analyze');
    return;
  }

  const resultEl = document.getElementById('analysis-result');
  resultEl.style.display = 'block';
  resultEl.classList.add('visible');
  resultEl.innerHTML = '<span class="spinner"></span> Analyzing your parameters...';

  const vals = [
    po4 ? `Phosphate: ${po4} ppm` : '',
    alk ? `Alkalinity: ${alk} dKH` : '',
    ca  ? `Calcium: ${ca} mg/L` : '',
    no3 ? `Nitrate: ${no3} ppm` : '',
    ph  ? `pH: ${ph}` : '',
    sal ? `Salinity: ${sal}` : '',
    mg  ? `Magnesium: ${mg} mg/L` : '',
  ].filter(Boolean).join(', ');

  const prompt = `I just tested my tank. Here are my results: ${vals}. Please give me a brief analysis — what looks good, what concerns you, and what's the most important action I should take right now. Keep it practical and concise.`;

  try {
    const result = await askOpenAI(prompt, [], getModelMode());
    resultEl.innerHTML = result.answer.replace(/\n/g, '<br>');
  } catch(e) {
    resultEl.innerHTML = '⚠️ Couldn\'t connect to AI. Check your connection.';
  }
}


// ── Parameter trends ───────────────────────────────────────────────────────
const TREND_PARAMS = [
  { key: 'po4', label: 'Phosphate', unit: 'ppm' },
  { key: 'alk', label: 'Alkalinity', unit: 'dKH' },
  { key: 'no3', label: 'Nitrate', unit: 'ppm' },
  { key: 'ca', label: 'Calcium', unit: 'mg/L' },
  { key: 'mg', label: 'Magnesium', unit: 'mg/L' },
  { key: 'ph', label: 'pH', unit: '' },
  { key: 'sal', label: 'Salinity', unit: 'SG' },
];
let currentTrendParam = 'po4';

function getDefaultLogs() {
  return [
    { date: 'Apr 2, 2026',  isoDate: '2026-04-02T12:00:00.000Z', po4:'0.90', alk:'8.8',  no3:'20.9' },
    { date: 'Apr 22, 2026', isoDate: '2026-04-22T12:00:00.000Z', po4:'0.90', alk:'11.4', no3:'22.1' },
    { date: 'May 5, 2026',  isoDate: '2026-05-05T12:00:00.000Z', po4:'0.65', alk:'10.0', no3:'22' },
  ];
}

function getAllLogsForCharts() {
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem('reef_logs') || '[]'); } catch(e) {}
  return [...getDefaultLogs(), ...logs].filter(Boolean).sort((a, b) => {
    const da = new Date(a.isoDate || a.date || 0).getTime();
    const db = new Date(b.isoDate || b.date || 0).getTime();
    return da - db;
  });
}

function renderTrendControls() {
  const container = document.getElementById('trend-controls');
  if (!container) return;
  container.innerHTML = TREND_PARAMS.map(p => `<button class="trend-tab${p.key === currentTrendParam ? ' active' : ''}" onclick="renderTrendChart('${p.key}')">${p.label}</button>`).join('');
}

function shortTrendDate(log) {
  const raw = log?.isoDate || log?.date;
  const d = new Date(raw);
  if (raw && !Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  return String(log?.date || '').replace(/,\s*\d{4}/, '').slice(0, 8) || 'Log';
}

function trendXAxisLabels(points, x, yBase) {
  if (!points.length) return '';
  const wanted = new Set([0, points.length - 1]);
  if (points.length > 2) wanted.add(Math.floor((points.length - 1) / 2));
  if (points.length <= 5) points.forEach((_, i) => wanted.add(i));
  return points.map((p, i) => {
    if (!wanted.has(i)) return '';
    const label = escapeHtml(p.shortDate || p.date || 'Log');
    return `<text x="${x(i).toFixed(1)}" y="${yBase}" font-size="9" font-weight="800" fill="#48cae4" text-anchor="middle">${label}</text>`;
  }).join('');
}

function renderTrendChart(paramKey = currentTrendParam) {
  currentTrendParam = paramKey;
  renderTrendControls();
  const container = document.getElementById('trend-chart');
  if (!container) return;

  const param = TREND_PARAMS.find(p => p.key === paramKey) || TREND_PARAMS[0];
  const points = getAllLogsForCharts()
    .map((log, index) => ({ index, date: log.date || '', shortDate: shortTrendDate(log), value: parseFloat(log[param.key]) }))
    .filter(p => Number.isFinite(p.value));

  if (points.length < 2) {
    container.innerHTML = `<div class="trend-chart-title">${param.label}</div><div class="trend-empty">Log at least two ${param.label.toLowerCase()} readings to see a trend.</div>`;
    return;
  }

  const width = 320, height = 180, padL = 38, padR = 14, padT = 18, padB = 34;
  const minValRaw = Math.min(...points.map(p => p.value));
  const maxValRaw = Math.max(...points.map(p => p.value));
  const spread = Math.max(maxValRaw - minValRaw, Math.abs(maxValRaw) * 0.08, 0.1);
  const minVal = minValRaw - spread * 0.18;
  const maxVal = maxValRaw + spread * 0.18;
  const x = i => padL + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - padL - padR));
  const y = v => padT + ((maxVal - v) / (maxVal - minVal)) * (height - padT - padB);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const delta = latest.value - previous.value;
  const trendWord = Math.abs(delta) < 0.0001 ? 'flat' : delta > 0 ? 'up' : 'down';
  const subtitle = `Latest: ${latest.value}${param.unit ? ' ' + param.unit : ''} · ${trendWord} ${Math.abs(delta).toFixed(param.key === 'sal' ? 3 : param.key === 'po4' || param.key === 'ph' ? 2 : 1)} since last log`;
  const labelMin = minValRaw.toFixed(param.key === 'sal' ? 3 : param.key === 'po4' || param.key === 'ph' ? 2 : 1);
  const labelMax = maxValRaw.toFixed(param.key === 'sal' ? 3 : param.key === 'po4' || param.key === 'ph' ? 2 : 1);

  container.innerHTML = `
    <div class="trend-chart-title">${param.label}</div>
    <div class="trend-chart-subtitle">${subtitle}</div>
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${param.label} trend chart">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height-padB}" stroke="rgba(0,119,182,0.18)" stroke-width="2" />
      <line x1="${padL}" y1="${height-padB}" x2="${width-padR}" y2="${height-padB}" stroke="rgba(0,119,182,0.18)" stroke-width="2" />
      <text x="4" y="${padT+4}" font-size="10" font-weight="800" fill="#0077b6">${labelMax}</text>
      <text x="4" y="${height-padB+4}" font-size="10" font-weight="800" fill="#0077b6">${labelMin}</text>
      <path d="${path}" fill="none" stroke="#0077b6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${points.map((p,i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="5" fill="#ffffff" stroke="#0077b6" stroke-width="3"><title>${escapeHtml(p.date)}: ${p.value}</title></circle>`).join('')}
      ${trendXAxisLabels(points, x, height - 10)}
    </svg>`;
}

// ── Maintenance / action history ───────────────────────────────────────────
function getActionEntries() {
  try { return JSON.parse(localStorage.getItem('reef_actions') || '[]'); } catch(e) { return []; }
}

function setActionEntries(entries) {
  try { localStorage.setItem('reef_actions', JSON.stringify(entries)); } catch(e) {}
}

function actionIcon(category) {
  return ({ maintenance:'💧', testing:'🧪', treatment:'🦠', equipment:'🔧', feeding:'🐟', livestock:'🦐', other:'📝' })[category] || '📝';
}

function saveActionEntry() {
  const titleEl = document.getElementById('action-title');
  const categoryEl = document.getElementById('action-category');
  const notesEl = document.getElementById('action-notes');
  const title = titleEl.value.trim();
  if (!title) { showToast('⚠️ Enter an action first'); return; }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    title,
    category: categoryEl.value || 'other',
    notes: notesEl.value.trim(),
    date: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
    isoDate: new Date().toISOString()
  };
  const entries = getActionEntries();
  entries.unshift(entry);
  setActionEntries(entries.slice(0, 80));
  titleEl.value = '';
  notesEl.value = '';
  renderActionHistory();
  renderRecentChangesHome();
  renderLongTermSummary();
  showToast('✅ Action saved');
}

function deleteActionEntry(id) {
  setActionEntries(getActionEntries().filter(e => e.id !== id));
  renderActionHistory();
  renderRecentChangesHome();
  renderLongTermSummary();
  showToast('🗑️ Action deleted');
}

function renderActionHistory() {
  const container = document.getElementById('action-history');
  if (!container) return;
  const entries = getActionEntries();
  if (entries.length === 0) {
    container.innerHTML = '<div class="saved-reminder-empty">No maintenance actions logged yet.</div>';
    return;
  }
  container.innerHTML = entries.slice(0, 12).map(e => `
    <div class="action-history-item">
      <div class="action-history-icon">${actionIcon(e.category)}</div>
      <div class="action-history-main">
        <div class="action-history-title">${escapeHtml(e.title)}</div>
        <div class="action-history-meta">${escapeHtml(e.date)} · ${escapeHtml(e.category || 'other')}</div>
        ${e.notes ? `<div class="action-history-notes">${escapeHtml(e.notes)}</div>` : ''}
      </div>
      <button class="reminder-delete-small" onclick="deleteActionEntry('${escapeHtml(e.id)}')" aria-label="Delete action">×</button>
    </div>`).join('');
}

// ── Completed reminder/task history ───────────────────────────────────────
let currentCompletedHistoryFilter = 'all';

function getCompletedHistoryEntries() {
  try { return JSON.parse(localStorage.getItem('reef_completed_history') || '[]'); } catch(e) { return []; }
}

function setCompletedHistoryEntries(entries) {
  try { localStorage.setItem('reef_completed_history', JSON.stringify(entries)); } catch(e) {}
}

function completedHistoryIcon(type) {
  return type === 'days-off' ? '🧰' : '✅';
}

function completedHistoryTypeLabel(type) {
  return type === 'days-off' ? 'Days-Off Task' : 'Reminder';
}

function recordCompletedHistory(entry) {
  if (!entry || !entry.title) return;
  const entries = getCompletedHistoryEntries();
  const completedAt = entry.completedAt || new Date().toISOString();
  const duplicateKey = `${entry.source || entry.type || 'item'}|${entry.sourceId || ''}|${completedAt.slice(0, 10)}`;
  const alreadyRecorded = entries.some(e => e.duplicateKey === duplicateKey);
  if (alreadyRecorded) return;

  const historyEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    type: entry.type || 'reminder',
    source: entry.source || 'Reminder',
    sourceId: entry.sourceId || '',
    title: entry.title,
    notes: entry.notes || '',
    completedAt,
    nextDueAt: entry.nextDueAt || null,
    blockKey: entry.blockKey || null,
    duplicateKey
  };
  entries.unshift(historyEntry);
  setCompletedHistoryEntries(entries.slice(0, 200));
  renderCompletedHistory();
}

function removeCompletedHistoryFor(sourceId, source = null) {
  if (!sourceId) return;
  const entries = getCompletedHistoryEntries();
  const filtered = entries.filter(e => {
    const sameSourceId = e.sourceId === sourceId;
    const sameSource = !source || e.source === source;
    return !(sameSourceId && sameSource);
  });
  if (filtered.length !== entries.length) {
    setCompletedHistoryEntries(filtered);
    renderCompletedHistory();
  }
}

function deleteCompletedHistoryEntry(id) {
  setCompletedHistoryEntries(getCompletedHistoryEntries().filter(e => e.id !== id));
  renderCompletedHistory();
  showToast('🗑️ History item deleted');
}

function clearCompletedHistory() {
  if (!confirm('Clear completed reminder/task history? This will not delete active reminders or parameter logs.')) return;
  setCompletedHistoryEntries([]);
  renderCompletedHistory();
  showToast('🧹 Completed history cleared');
}

function setCompletedHistoryFilter(filter) {
  currentCompletedHistoryFilter = ['all', 'reminder', 'days-off'].includes(filter) ? filter : 'all';
  document.querySelectorAll('.history-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.historyFilter === currentCompletedHistoryFilter);
  });
  renderCompletedHistory();
}

function formatHistoryDate(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}

function renderCompletedHistory() {
  const container = document.getElementById('completed-history');
  if (!container) return;
  let entries = getCompletedHistoryEntries();
  if (currentCompletedHistoryFilter !== 'all') {
    entries = entries.filter(e => e.type === currentCompletedHistoryFilter);
  }
  if (entries.length === 0) {
    container.innerHTML = '<div class="saved-reminder-empty">No completed reminders or days-off tasks recorded yet.</div>';
    return;
  }

  container.innerHTML = entries.slice(0, 50).map(e => {
    const nextDue = e.nextDueAt ? ` · Next due ${formatDueDate(e.nextDueAt)}` : '';
    const notes = [e.notes || '', e.blockKey ? `Block: ${e.blockKey}` : ''].filter(Boolean).join('\n');
    return `<div class="completed-history-item">
      <div class="completed-history-icon">${completedHistoryIcon(e.type)}</div>
      <div class="completed-history-main">
        <div class="completed-history-title">${escapeHtml(e.title)}</div>
        <div class="completed-history-meta">${escapeHtml(completedHistoryTypeLabel(e.type))} · ${escapeHtml(formatHistoryDate(e.completedAt))}${escapeHtml(nextDue)}</div>
        ${notes ? `<div class="completed-history-notes">${escapeHtml(notes)}</div>` : ''}
      </div>
      <button class="reminder-delete-small" onclick="deleteCompletedHistoryEntry('${escapeHtml(e.id)}')" aria-label="Delete history item">×</button>
    </div>`;
  }).join('');
}


// ── Diagnostics / self-check ───────────────────────────────────────────────
function safeParseStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined || raw === '') return fallback;
    return JSON.parse(raw);
  } catch(e) {
    return { __parseError: true, key };
  }
}

function isParseError(value) {
  return Boolean(value && value.__parseError);
}

function getKnownTaskKeysForDiagnostics() {
  const keys = new Set();
  try { STATIC_REMINDER_LIBRARY.forEach(r => keys.add(staticTaskKey(r.id))); } catch(e) {}
  try { normalizeSavedReminderRecurrences().forEach(r => keys.add(savedTaskKey(r.id))); } catch(e) {}
  return keys;
}

function runDiagnostics() {
  const checks = [];
  const add = (level, label, detail) => checks.push({ level, label, detail: detail || '' });

  const arrayKeys = ['reef_logs', 'reef_actions', 'reef_completed_history', 'reef_ai_reminders', 'reef_hidden_static_reminders', 'reef_hidden_plan_tasks'];
  const objectKeys = ['reef_static_reminder_states', 'reef_days_off_plan_states', 'reef_ai_days_off_plans', 'reef_task_schedule', 'reef_resolved_issues'];

  arrayKeys.forEach(key => {
    const parsed = safeParseStorage(key, []);
    if (isParseError(parsed)) add('error', key, 'Invalid JSON. Repair will reset this field.');
    else if (!Array.isArray(parsed)) add('warn', key, 'Expected a list. Repair can normalize it.');
    else add('ok', key, `${parsed.length} item${parsed.length === 1 ? '' : 's'}.`);
  });

  objectKeys.forEach(key => {
    const parsed = safeParseStorage(key, {});
    if (isParseError(parsed)) add('error', key, 'Invalid JSON. Repair will reset this field.');
    else if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') add('warn', key, 'Expected an object. Repair can normalize it.');
    else add('ok', key, `${Object.keys(parsed).length} record${Object.keys(parsed).length === 1 ? '' : 's'}.`);
  });

  const logs = memoryArray('reef_logs');
  const badLogs = logs.filter(l => !l || typeof l !== 'object' || !Object.values(l).some(Boolean));
  add(badLogs.length ? 'warn' : 'ok', 'Parameter logs', badLogs.length ? `${badLogs.length} empty or malformed log entry found.` : `${logs.length} saved log entries look readable.`);

  const actions = getActionEntries();
  const actionsWithoutTitle = actions.filter(a => !String(a.title || '').trim());
  add(actionsWithoutTitle.length ? 'warn' : 'ok', 'Maintenance/action history', actionsWithoutTitle.length ? `${actionsWithoutTitle.length} entries are missing a title.` : `${actions.length} action entries look readable.`);

  const saved = normalizeSavedReminderRecurrences();
  const savedWithoutTitle = saved.filter(r => !String(r.title || '').trim());
  const duplicateSavedIds = saved.map(r => r.id).filter((id, i, arr) => id && arr.indexOf(id) !== i);
  add(savedWithoutTitle.length || duplicateSavedIds.length ? 'warn' : 'ok', 'Saved AI reminders', savedWithoutTitle.length ? `${savedWithoutTitle.length} reminders are missing a title.` : duplicateSavedIds.length ? `${duplicateSavedIds.length} duplicate reminder IDs found.` : `${saved.length} saved reminders look readable.`);

  const schedule = getTaskSchedule();
  const knownKeys = getKnownTaskKeysForDiagnostics();
  const orphanedSchedule = Object.keys(schedule).filter(key => !knownKeys.has(key));
  const badScheduleDays = Object.entries(schedule).filter(([, day]) => Number(day) < 1 || Number(day) > 7 || !Number.isFinite(Number(day)));
  add(orphanedSchedule.length || badScheduleDays.length ? 'warn' : 'ok', 'Task scheduling', orphanedSchedule.length ? `${orphanedSchedule.length} scheduled tasks no longer exist.` : badScheduleDays.length ? `${badScheduleDays.length} tasks have invalid day numbers.` : 'Scheduled tasks point to valid active tasks.');

  const completed = getCompletedHistory();
  const historyMissingTitle = completed.filter(h => !String(h.title || '').trim());
  const duplicateHistoryIds = completed.map(h => h.id).filter((id, i, arr) => id && arr.indexOf(id) !== i);
  add(historyMissingTitle.length || duplicateHistoryIds.length ? 'warn' : 'ok', 'Completed history', historyMissingTitle.length ? `${historyMissingTitle.length} history entries are missing a title.` : duplicateHistoryIds.length ? `${duplicateHistoryIds.length} duplicate history IDs found.` : `${completed.length} history entries look readable.`);

  const backupMissing = REEF_BACKUP_KEYS.filter(key => localStorage.getItem(key) === null);
  add('ok', 'Backup fields', backupMissing.length ? `${backupMissing.length} backup fields are empty because they have not been used yet.` : 'All backup fields currently exist.');

  const summary = checks.reduce((acc, c) => { acc[c.level] = (acc[c.level] || 0) + 1; return acc; }, {});
  const result = document.getElementById('diagnostics-result');
  const icon = summary.error ? '⚠️' : summary.warn ? '🟡' : '✅';
  if (result) {
    result.innerHTML = `<div class="diagnostics-summary">${icon} ${summary.error || 0} errors · ${summary.warn || 0} warnings · ${summary.ok || 0} checks passed</div>` +
      `<ul class="diagnostics-list">${checks.map(c => `<li><span class="diagnostics-${c.level}">${c.level === 'ok' ? '✅' : c.level === 'warn' ? '🟡' : '⚠️'} ${escapeHtml(c.label)}</span>${c.detail ? ` — ${escapeHtml(c.detail)}` : ''}</li>`).join('')}</ul>`;
  }
  return checks;
}

function repairDiagnosticsIssues() {
  const arrayKeys = ['reef_logs', 'reef_actions', 'reef_completed_history', 'reef_ai_reminders', 'reef_hidden_static_reminders', 'reef_hidden_plan_tasks'];
  const objectKeys = ['reef_static_reminder_states', 'reef_days_off_plan_states', 'reef_ai_days_off_plans', 'reef_task_schedule', 'reef_resolved_issues'];
  let fixes = 0;

  arrayKeys.forEach(key => {
    const parsed = safeParseStorage(key, []);
    if (isParseError(parsed) || !Array.isArray(parsed)) {
      localStorage.setItem(key, '[]');
      fixes++;
    }
  });

  objectKeys.forEach(key => {
    const parsed = safeParseStorage(key, {});
    if (isParseError(parsed) || !parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      localStorage.setItem(key, '{}');
      fixes++;
    }
  });

  const knownKeys = getKnownTaskKeysForDiagnostics();
  const schedule = getTaskSchedule();
  let scheduleChanged = false;
  Object.entries(schedule).forEach(([key, day]) => {
    const dayNum = Number(day);
    if (!knownKeys.has(key) || !Number.isFinite(dayNum) || dayNum < 1 || dayNum > 7) {
      delete schedule[key];
      scheduleChanged = true;
    } else if (schedule[key] !== dayNum) {
      schedule[key] = dayNum;
      scheduleChanged = true;
    }
  });
  if (scheduleChanged) { setTaskSchedule(schedule); fixes++; }

  const dedupeById = (items) => {
    const seen = new Set();
    let changed = false;
    const cleaned = [];
    items.forEach(item => {
      if (!item || typeof item !== 'object') { changed = true; return; }
      if (item.id && seen.has(item.id)) { changed = true; return; }
      if (item.id) seen.add(item.id);
      cleaned.push(item);
    });
    return { cleaned, changed };
  };

  const savedFix = dedupeById(getSavedReminders());
  if (savedFix.changed) { setSavedReminders(savedFix.cleaned); fixes++; }
  const historyFix = dedupeById(getCompletedHistory());
  if (historyFix.changed) { setCompletedHistory(historyFix.cleaned); fixes++; }

  renderLogHistory();
  renderTrendControls();
  renderTrendChart(currentTrendParam);
  renderActionHistory();
  renderCompletedHistory();
  renderTankStatus();
  renderReminderCenter();
  updateDaysOffDisplay();
  initStaticReminderChecks();

  showToast(fixes ? `🛠️ Repaired ${fixes} issue${fixes === 1 ? '' : 's'}` : '✅ No repairs needed');
  runDiagnostics();
}



// ── Long-term reef operating tools ─────────────────────────────────────────
const DEFAULT_TANK_MODE = 'recovery';
const TANK_MODE_COPY = {
  recovery: 'Recovery: conservative decisions, reduce stress, avoid stacking changes.',
  stabilizing: 'Stabilizing: confirm trends, keep routines consistent, change one thing at a time.',
  maintenance: 'Maintenance: preserve stability, catch early warning signs, keep intervals current.',
  growth: 'Growth: optimize coral growth only after parameters and husbandry are consistent.',
  troubleshooting: 'Troubleshooting: focus on cause-and-effect and recent changes.'
};

function getTankMode() {
  try { return localStorage.getItem('reef_tank_mode') || DEFAULT_TANK_MODE; } catch(e) { return DEFAULT_TANK_MODE; }
}

function setTankMode(mode) {
  const allowed = Object.keys(TANK_MODE_COPY);
  const selected = allowed.includes(mode) ? mode : DEFAULT_TANK_MODE;
  try { localStorage.setItem('reef_tank_mode', selected); } catch(e) {}
  const sel = document.getElementById('tank-mode-select');
  if (sel) sel.value = selected;
  renderTankStatus();
  renderLongTermSummary();
  showToast(`✅ Tank mode: ${selected}`);
}

function initTankMode() {
  const sel = document.getElementById('tank-mode-select');
  if (sel) sel.value = getTankMode();
}

const INVENTORY_GUIDE_DEFAULTS = {
  'inv-clowns': { scientificName:'Amphiprion ocellaris / A. percula (verify)', naturalRange:'Indo-Pacific reef lagoons and outer reef slopes', facts:['Hardy clownfish pair that may defend a nesting territory.', 'Captive pairs often lay eggs regularly once settled.', 'Can irritate corals they adopt as hosts.'] },
  'inv-yellow-coris': { scientificName:'Halichoeres chrysus', naturalRange:'Indo-Pacific sand flats, lagoons, and reef edges', facts:['Active pest-hunting wrasse that sleeps in sand.', 'Needs a sand bed and secure lid.', 'Generally peaceful but may eat tiny ornamental inverts.'] },
  'inv-melanurus': { scientificName:'Halichoeres melanurus', naturalRange:'Western Pacific reefs and rubble zones', facts:['Useful hunter of flatworms and small pests.', 'Sleeps in sand and may jump.', 'Can become assertive as it matures.'] },
  'inv-solon': { scientificName:'Cirrhilabrus solorensis (verify)', naturalRange:'Western Pacific and eastern Indian Ocean reef slopes', facts:['Colorful fairy wrasse; active open-water swimmer.', 'Needs a tight lid because fairy wrasses jump.', 'Usually peaceful but can posture with other wrasses.'] },
  'inv-banggai': { scientificName:'Pterapogon kauderni', naturalRange:'Banggai Islands region, Indonesia', facts:['Mouthbrooding cardinalfish with distinct black-and-white pattern.', 'Slow, deliberate swimmer that prefers calmer zones.', 'Often does best with peaceful tankmates.'] },
  'inv-chromis': { scientificName:'Chromis viridis / Chromis spp. (verify)', naturalRange:'Indo-Pacific reef slopes and lagoons', facts:['Open-water planktivore.', 'Best observed for social stress if kept singly or in groups.', 'Benefits from small frequent feedings.'] },
  'inv-yellow-tang': { scientificName:'Zebrasoma flavescens', naturalRange:'Central Pacific reefs, especially Hawaii region', facts:['Constant grazer that helps control film algae.', 'Can dominate feeding stations.', 'Needs strong vegetable/algae-based nutrition.'] },
  'inv-white-tail': { scientificName:'Ctenochaetus flavicauda', naturalRange:'South Pacific reef slopes', facts:['Bristletooth tang that grazes films and detritus.', 'Usually less aggressive than Zebrasoma tangs.', 'Watch for competition around algae/nori.'] },
  'inv-sailfin': { scientificName:'Zebrasoma desjardinii', naturalRange:'Indian Ocean and Red Sea reefs', facts:['Large tang with strong grazing behavior.', 'Can become dominant because of size.', 'Needs swimming room and steady algae-based foods.'] },
  'inv-orange-banded-goby': { scientificName:'Amblyeleotris randalli (verify)', naturalRange:'Indo-Pacific sandy reef slopes and rubble zones', facts:['Shrimp goby that often pairs with pistol shrimp.', 'Keeps watch near the burrow entrance.', 'Needs sand/rubble and stable rockwork.'] },
  'inv-tiger-pistol-shrimp': { scientificName:'Alpheus bellulus (verify)', naturalRange:'Indo-Pacific sandy lagoons, reef flats, and rubble zones', facts:['Burrow-building shrimp commonly paired with gobies.', 'Uses snapping claw for defense and communication.', 'May move sand around rock bases; stable rockwork matters.'] },
  'inv-molly-miller-blenny': { scientificName:'Scartella cristata', naturalRange:'Tropical and subtropical Atlantic/Caribbean rocky reefs, tidepools, and algae-covered hard surfaces', facts:['Hardy algae-grazing blenny with lots of personality.', 'Often picks at film algae and small nuisance growth.', 'Can become territorial around favorite perches.'] },
  'inv-btas': { scientificName:'Entacmaea quadricolor', naturalRange:'Indo-Pacific reef habitats', facts:['Can move or split when stressed or thriving.', 'Capable of stinging nearby corals.', 'Stable placement for a long period is a good sign.'] },
  'inv-duncan': { scientificName:'Duncanopsammia axifuga', naturalRange:'Australia and Indo-Pacific turbid reef zones', facts:['Photosynthetic LPS coral that also accepts meaty foods.', 'Often tolerant and expressive, making it a useful “mood indicator.”', 'Clownfish hosting may irritate polyps but yours has remained healthy.'] },
  'inv-hammers': { scientificName:'Fimbriaphyllia / Euphyllia spp. (verify)', naturalRange:'Indo-Pacific reef slopes and lagoons', facts:['LPS coral that prefers moderate flow and stable alkalinity.', 'Can sting neighbors with sweeper tentacles.', 'Recovery is often slow after nutrient or alkalinity swings.'] },
  'inv-candy': { scientificName:'Caulastrea furcata', naturalRange:'Indo-Pacific reef flats and lagoons', facts:['Hardy LPS coral with fleshy polyps.', 'Benefits from stable alkalinity and occasional feeding.', 'Good long-term indicator for tissue recession or nutrient stress.'] },
  'inv-ricordea': { scientificName:'Ricordea spp.', naturalRange:'Caribbean and Indo-Pacific reef rubble zones depending species', facts:['Mushroom corallimorph that dislikes direct stinging/chemical warfare.', 'Can shrink when irritated by anemones or changing conditions.', 'Often benefits from lower flow and space from aggressive neighbors.'] },
  'inv-gorgonia': { scientificName:'Pinnigorgia flava (verify)', naturalRange:'Aquacultured strain; related gorgonians occur in Indo-Pacific reefs', facts:['Hardy photosynthetic gorgonian often sold as Grube’s gorgonian.', 'Enjoys moderate to stronger flow.', 'Can grow quickly when conditions are stable.'] },
  'inv-stylo': { scientificName:'Stylophora spp.', naturalRange:'Indo-Pacific reef slopes and high-light zones', facts:['SPS coral that needs stable alkalinity and nutrients.', 'Loss is useful history for deciding when the tank is ready for SPS again.', 'Use as a benchmark, not a current care item.'] },
  'inv-halloween-hermits': { scientificName:'Ciliopagurus strigatus', naturalRange:'Indo-Pacific reef flats and rubble zones', facts:['Large, colorful hermit with orange/red banding.', 'Good scavenger but may bulldoze small frags or shells.', 'Provide spare shells to reduce conflicts.'] },
  'inv-scarlet-red-leg-hermits': { scientificName:'Paguristes cadenati', naturalRange:'Caribbean reefs and rubble zones', facts:['Generally reef-safe scarlet-legged scavenger.', 'Eats leftover food and some film algae/detritus.', 'Usually more peaceful than many larger hermits.'] },
  'inv-hawaiian-blue-leg-hermits': { scientificName:'Calcinus laevimanus (verify)', naturalRange:'Hawaiian and broader Pacific reef rubble/intertidal zones', facts:['Small active hermit useful for detritus and algae picking.', 'Can compete for shells with snails or other hermits.', 'Best kept with spare shells available.'] },
  'inv-sand-sifting-starfish': { scientificName:'Astropecten spp. (verify)', naturalRange:'Tropical sandy bottoms and lagoon sand flats', facts:['Sifts through sand for microfauna and detritus.', 'Needs a mature, food-rich sand bed.', 'Watch for shrinking or slow starvation in newer or very clean systems.'] },
  'inv-serpent-starfish': { scientificName:'Ophioderma / Ophiolepis spp. (verify)', naturalRange:'Tropical reef rubble, rockwork, and crevices', facts:['Nocturnal scavenger that hides in rockwork.', 'Useful cleanup crew member for leftover food.', 'Watch central disc size as a health indicator.'] },
  'inv-conchs': { scientificName:'Strombus / Conomurex spp. (verify)', naturalRange:'Tropical sandy lagoons and reef flats', facts:['Excellent sand-bed grazers and detritus consumers.', 'Need available sand surface and supplemental food if algae is scarce.', 'Usually peaceful and beneficial in mature tanks.'] },
  'inv-australians': { scientificName:'Microcanthus strigatus (verify)', naturalRange:'Temperate/subtropical Indo-Pacific rocky reefs', facts:['Resolved item: previously in sump and rehomed.', 'Known to nip or eat some desirable invertebrates/corals in your system.', 'Keep as historical context, not an active care item.'] }
};

let pendingInventoryPhotoData = '';
let inventoryAiFillInProgress = false;
let inventoryAiFillRequestId = 0;

function defaultInventoryItems() {
  return [
    { id:'inv-clowns', name:'Clownfish breeding pair', type:'fish', status:'healthy', location:'Display / Duncan host', notes:'Laying eggs regularly; hosting Duncan coral.' },
    { id:'inv-yellow-coris', name:'Yellow coris wrasse', type:'fish', status:'stable', location:'Display', notes:'' },
    { id:'inv-melanurus', name:'Melanurus wrasse', type:'fish', status:'stable', location:'Display', notes:'' },
    { id:'inv-solon', name:'Red Head Solon Fairy Wrasse', type:'fish', status:'stable', location:'Display', notes:'Blue body, pink head, black mark under chin.' },
    { id:'inv-banggai', name:'Banggai cardinal', type:'fish', status:'stable', location:'Display', notes:'' },
    { id:'inv-chromis', name:'Blue chromis', type:'fish', status:'stable', location:'Display', notes:'' },
    { id:'inv-yellow-tang', name:'Yellow tang', type:'fish', status:'stable', location:'Display', notes:'Dominates feeder at times.' },
    { id:'inv-white-tail', name:'White tail bristletooth tang', type:'fish', status:'stable', location:'Display', notes:'' },
    { id:'inv-sailfin', name:'Desjardini sailfin tang', type:'fish', status:'stable', location:'Display', notes:'' },
    { id:'inv-orange-banded-goby', name:'Orange banded goby', type:'fish', status:'stable', location:'Display / burrow', notes:'Paired with tiger pistol shrimp.' },
    { id:'inv-tiger-pistol-shrimp', name:'Tiger pistol shrimp', type:'invert', status:'stable', location:'Display / burrow', notes:'Paired with orange banded goby.' },
    { id:'inv-molly-miller-blenny', name:'Molly Miller Blenny', type:'fish', status:'stable', location:'Display', notes:'' },
    { id:'inv-btas', name:'Bubble tip anemones', type:'anemone', status:'stable', location:'Display', notes:'Stationary about a year; near Ricordea/mushroom concern.' },
    { id:'inv-duncan', name:'Duncan coral', type:'coral', status:'healthy', location:'Display', notes:'Clownfish host; currently healthy.' },
    { id:'inv-hammers', name:'Hammer coral colonies', type:'coral', status:'recovering', location:'Display', notes:'Two surviving colonies after earlier instability.' },
    { id:'inv-candy', name:'Green candy cane coral', type:'coral', status:'stable', location:'Display', notes:'' },
    { id:'inv-ricordea', name:'Ricordea mushrooms', type:'coral', status:'stressed', location:'Below BTAs', notes:'Likely allelopathy/irritation concern from BTAs above.' },
    { id:'inv-gorgonia', name:"Grube's gorgonia", type:'coral', status:'stable', location:'Display', notes:'' },
    { id:'inv-stylo', name:'Purple stylophora', type:'coral', status:'lost/resolved', location:'Former SPS', notes:'Lost during high phosphate / alkalinity instability period.' },
    { id:'inv-halloween-hermits', name:'Halloween hermits', type:'invert', status:'stable', location:'Display', notes:'Two Halloween hermits.' },
    { id:'inv-scarlet-red-leg-hermits', name:'Scarlet red leg hermits', type:'invert', status:'stable', location:'Display', notes:'' },
    { id:'inv-hawaiian-blue-leg-hermits', name:'Hawaiian blue leg hermits', type:'invert', status:'stable', location:'Display', notes:'' },
    { id:'inv-sand-sifting-starfish', name:'Sand sifting starfish', type:'invert', status:'stable', location:'Sand bed', notes:'Newer addition; watch long-term body condition.' },
    { id:'inv-serpent-starfish', name:'Serpent starfish', type:'invert', status:'stable', location:'Rockwork', notes:'' },
    { id:'inv-conchs', name:'Fighting conchs', type:'invert', status:'stable', location:'Sand bed', notes:'Two fighting conchs.' },
    { id:'inv-australians', name:'Australian Stripy fish', type:'fish', status:'lost/resolved', location:'Rehomed', notes:'Previously in sump; rehoming issue resolved.' }
  ].map(normalizeInventoryItem);
}

function getInventoryGuideDefaults(item) {
  if (!item) return {};
  const byId = INVENTORY_GUIDE_DEFAULTS[item.id];
  if (byId) return byId;
  const name = String(item.name || '').toLowerCase();
  return Object.entries(INVENTORY_GUIDE_DEFAULTS).find(([id, val]) => name.includes(id.replace('inv-','').replace('-', ' ')) || String(val.scientificName || '').toLowerCase().includes(name))?.[1] || {};
}

function normalizeInventoryItem(item) {
  const defaults = getInventoryGuideDefaults(item);
  return {
    ...item,
    scientificName: item.scientificName || defaults.scientificName || '',
    naturalRange: item.naturalRange || defaults.naturalRange || '',
    facts: Array.isArray(item.facts) ? item.facts : (item.facts ? String(item.facts).split('\n').map(x => x.trim()).filter(Boolean) : (defaults.facts || [])),
    photoData: item.photoData || '',
    photoKey: item.photoKey || '',
    photoUpdatedAt: item.photoUpdatedAt || ''
  };
}


function inventoryHas(items, id) {
  return items.some(i => String(i.id) === String(id));
}

const REEF_CUSTOM_INVENTORY_KEY = 'reef_inventory_custom';
const REEF_CUSTOM_INVENTORY_KEY_V2 = 'reef_inventory_custom_v2';

function defaultInventoryIdSet() {
  try { return new Set(defaultInventoryItems().map(i => String(i.id))); } catch(e) { return new Set(); }
}


function inventoryStorageReadArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch(e) { return []; }
}

function inventoryStorageWriteArray(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(compactInventoryItems(items || [])));
    return true;
  } catch(e) {
    console.error('Could not save inventory array', key, e);
    return false;
  }
}

function compactInventoryItems(items) {
  return (items || []).map(item => {
    const normalized = normalizeInventoryItem(item);
    if (normalized.photoData) delete normalized.photoData;
    return normalized;
  });
}

function getCustomInventoryItems() {
  const v2 = inventoryStorageReadArray(REEF_CUSTOM_INVENTORY_KEY_V2);
  const v1 = inventoryStorageReadArray(REEF_CUSTOM_INVENTORY_KEY);
  const saved = inventoryStorageReadArray('reef_inventory');
  const defaultIds = defaultInventoryIdSet();
  const savedCustom = saved.filter(item => item && !defaultIds.has(String(item.id || '')));
  return mergeInventoryItems(mergeInventoryItems(v1, savedCustom), v2).map(normalizeInventoryItem);
}

function setCustomInventoryItems(items) {
  const ok2 = inventoryStorageWriteArray(REEF_CUSTOM_INVENTORY_KEY_V2, items || []);
  inventoryStorageWriteArray(REEF_CUSTOM_INVENTORY_KEY, items || []);
  return ok2;
}


function upsertCustomInventoryItem(item) {
  if (!item || !item.id) return false;
  if (defaultInventoryIdSet().has(String(item.id))) return true;
  const custom = getCustomInventoryItems();
  const idx = custom.findIndex(i => String(i.id) === String(item.id));
  const compact = compactInventoryItems([item])[0];
  if (idx >= 0) custom[idx] = { ...custom[idx], ...compact };
  else custom.unshift(compact);
  return setCustomInventoryItems(custom);
}

function removeCustomInventoryItem(id) {
  if (!id) return;
  const custom = getCustomInventoryItems().filter(i => String(i.id) !== String(id));
  setCustomInventoryItems(custom);
}

function mergeInventoryItems(primary, secondary) {
  const byId = new Map();
  [...(primary || []), ...(secondary || [])].forEach(item => {
    if (!item) return;
    const id = String(item.id || '').trim();
    if (!id) return;
    byId.set(id, { ...(byId.get(id) || {}), ...item });
  });
  return Array.from(byId.values());
}

function persistCustomInventorySubset(items) {
  const defaultIds = defaultInventoryIdSet();
  const custom = (items || []).filter(item => item && !defaultIds.has(String(item.id || '')));
  if (custom.length) setCustomInventoryItems(custom);
}

function migrateInventoryItems(items) {
  let next = [...items];
  const removeIds = new Set();
  const addIfMissing = (entry) => {
    if (!inventoryHas(next, entry.id)) next.push(entry);
  };

  const combinedGoby = next.find(i => String(i.id) === 'inv-goby-shrimp' || /goby\s*(\+|and|&)\s*pistol/i.test(String(i.name || '')));
  if (combinedGoby) {
    removeIds.add(String(combinedGoby.id));
    addIfMissing({ id:'inv-orange-banded-goby', name:'Orange banded goby', type:'fish', status:combinedGoby.status || 'stable', location:combinedGoby.location || 'Display / burrow', notes:'Paired with tiger pistol shrimp.' });
    addIfMissing({ id:'inv-tiger-pistol-shrimp', name:'Tiger pistol shrimp', type:'invert', status:combinedGoby.status || 'stable', location:combinedGoby.location || 'Display / burrow', notes:'Paired with orange banded goby.' });
  }

  const combinedStars = next.find(i => String(i.id) === 'inv-stars' || /sand sifting starfish and serpent|sand.*serpent/i.test(String(i.name || '')));
  if (combinedStars) {
    removeIds.add(String(combinedStars.id));
    addIfMissing({ id:'inv-sand-sifting-starfish', name:'Sand sifting starfish', type:'invert', status:combinedStars.status || 'stable', location:'Sand bed', notes:'Newer addition; watch long-term body condition.' });
    addIfMissing({ id:'inv-serpent-starfish', name:'Serpent starfish', type:'invert', status:combinedStars.status || 'stable', location:'Rockwork', notes:'' });
  }

  const combinedHermits = next.find(i => String(i.id) === 'inv-hermits' || /^hermit crabs$/i.test(String(i.name || '')));
  if (combinedHermits) {
    removeIds.add(String(combinedHermits.id));
    addIfMissing({ id:'inv-halloween-hermits', name:'Halloween hermits', type:'invert', status:combinedHermits.status || 'stable', location:combinedHermits.location || 'Display', notes:'Two Halloween hermits.' });
    addIfMissing({ id:'inv-scarlet-red-leg-hermits', name:'Scarlet red leg hermits', type:'invert', status:combinedHermits.status || 'stable', location:combinedHermits.location || 'Display', notes:'' });
    addIfMissing({ id:'inv-hawaiian-blue-leg-hermits', name:'Hawaiian blue leg hermits', type:'invert', status:combinedHermits.status || 'stable', location:combinedHermits.location || 'Display', notes:'' });
  }

  addIfMissing({ id:'inv-molly-miller-blenny', name:'Molly Miller Blenny', type:'fish', status:'stable', location:'Display', notes:'' });

  next = next.filter(i => !removeIds.has(String(i.id)));
  return next.map(normalizeInventoryItem);
}

function getInventoryItems() {
  const defaults = defaultInventoryItems();
  const saved = memoryArray('reef_inventory');
  const base = saved.length ? saved : defaults;
  const customItems = getCustomInventoryItems();
  const normalized = migrateInventoryItems(mergeInventoryItems(base, customItems));
  // Save the full display list, but keep custom entries authoritative in the v2 custom store.
  inventoryStorageWriteArray('reef_inventory', normalized);
  if (customItems.length) persistCustomInventorySubset(normalized);
  return normalized;
}

function setInventoryItems(items) {
  const compact = compactInventoryItems(items || []);
  const custom = compact.filter(item => item && !defaultInventoryIdSet().has(String(item.id || '')));
  const okFull = inventoryStorageWriteArray('reef_inventory', compact);
  const okCustom = custom.length ? setCustomInventoryItems(custom) : true;
  if (okFull || okCustom) {
    try { localStorage.removeItem('reef_inventory_last_error'); } catch(_) {}
    return true;
  }
  try { localStorage.setItem('reef_inventory_last_error', 'Could not save inventory'); } catch(_) {}
  return false;
}

function resizeInventoryImage(file, maxSize = 650, quality = 0.62) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!file.type || !file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}


const INVENTORY_PHOTO_DB = 'reef_keeper_inventory_photos_v1';
const INVENTORY_PHOTO_STORE = 'photos';

function openInventoryPhotoDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not available'));
    const req = indexedDB.open(INVENTORY_PHOTO_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INVENTORY_PHOTO_STORE)) db.createObjectStore(INVENTORY_PHOTO_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open photo storage'));
  });
}

async function saveInventoryPhotoData(photoKey, dataUrl) {
  if (!photoKey || !dataUrl) return;
  const db = await openInventoryPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INVENTORY_PHOTO_STORE, 'readwrite');
    tx.objectStore(INVENTORY_PHOTO_STORE).put(dataUrl, photoKey);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Could not save photo'));
  });
}

async function getInventoryPhotoData(photoKey) {
  if (!photoKey) return '';
  try {
    const db = await openInventoryPhotoDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(INVENTORY_PHOTO_STORE, 'readonly');
      const req = tx.objectStore(INVENTORY_PHOTO_STORE).get(photoKey);
      req.onsuccess = () => resolve(req.result || '');
      req.onerror = () => reject(req.error || new Error('Could not read photo'));
    });
  } catch(e) { return ''; }
}

async function deleteInventoryPhotoData(photoKey) {
  if (!photoKey) return;
  try {
    const db = await openInventoryPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(INVENTORY_PHOTO_STORE, 'readwrite');
      tx.objectStore(INVENTORY_PHOTO_STORE).delete(photoKey);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Could not delete photo'));
    });
  } catch(e) {}
}

function inventoryPhotoKeyFor(item) {
  if (!item) return '';
  return item.photoKey || (item.photoData ? `inventory-photo-${item.id}` : '');
}

async function hydrateInventoryImages(root = document) {
  const nodes = Array.from(root.querySelectorAll('[data-inventory-photo-key]'));
  await Promise.all(nodes.map(async node => {
    const key = node.getAttribute('data-inventory-photo-key');
    const name = node.getAttribute('data-inventory-photo-name') || 'livestock photo';
    const dataUrl = await getInventoryPhotoData(key);
    if (!dataUrl) return;
    node.innerHTML = `<img src="${dataUrl}" alt="${escapeHtml(name)}" onerror="this.parentElement.classList.add('no-photo');this.parentElement.innerHTML='<div>📷</div><span>No photo uploaded</span>'">`;
  }));
}

async function migrateInventoryPhotosToIndexedDb() {
  const raw = memoryArray('reef_inventory');
  if (!raw.length) return;
  let changed = false;
  for (const item of raw) {
    if (item.photoData) {
      const key = item.photoKey || `inventory-photo-${item.id || Date.now().toString(36)}`;
      try {
        await saveInventoryPhotoData(key, item.photoData);
        item.photoKey = key;
        item.photoUpdatedAt = item.photoUpdatedAt || new Date().toISOString();
        delete item.photoData;
        changed = true;
      } catch(e) {
        console.warn('Could not migrate inventory photo', e);
      }
    }
  }
  if (changed) {
    setInventoryItems(raw);
    renderInventory();
    renderLivestockGuide();
    renderLivestockCatalogModal();
  }
}

async function handleInventoryPhotoSelect(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    pendingInventoryPhotoData = await resizeInventoryImage(file);
    const preview = document.getElementById('inventory-photo-preview');
    if (preview) {
      preview.innerHTML = `<img src="${pendingInventoryPhotoData}" alt="Selected livestock photo"><div><strong>Photo ready.</strong><br><span style="font-size:12px;color:var(--text-mid);font-weight:700;">It will be saved with this inventory item.</span></div>`;
      preview.classList.add('visible');
    }
    showToast('📷 Photo ready');
  } catch(e) {
    showToast('⚠️ Could not use that image');
  }
}

async function uploadInventoryPhoto(id, event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    const photoData = await resizeInventoryImage(file);
    const items = getInventoryItems();
    const idx = items.findIndex(i => String(i.id) === String(id));
    if (idx < 0) return;
    const photoKey = items[idx].photoKey || `inventory-photo-${items[idx].id}`;
    await saveInventoryPhotoData(photoKey, photoData);
    items[idx] = { ...items[idx], photoKey, photoData:'', photoUpdatedAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    if (!setInventoryItems(items)) {
      showToast('⚠️ Could not save inventory item. Try exporting a backup and clearing old browser data.');
      return;
    }
    renderInventory();
    renderLivestockGuide();
    renderLivestockCatalogModal();
    showToast('📷 Guide photo saved');
  } catch(e) {
    console.error(e);
    showToast('⚠️ Could not save photo');
  } finally {
    if (event?.target) event.target.value = '';
  }
}


async function fillInventoryWithAI() {
  const nameEl = document.getElementById('inventory-name');
  const commonName = nameEl?.value.trim();
  if (!commonName) { showToast('⚠️ Enter a common name first'); return; }
  const btn = document.getElementById('inventory-ai-fill-btn');
  const originalText = btn ? btn.textContent : '';
  const requestId = ++inventoryAiFillRequestId;
  inventoryAiFillInProgress = true;
  if (btn) { btn.disabled = true; btn.textContent = '✨ Filling...'; }
  try {
    const response = await fetch('/api/livestock', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ commonName })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'AI lookup failed');

    // If the form was saved/cleared while the AI request was still running, do not
    // refill the form or show the review message afterward.
    if (requestId !== inventoryAiFillRequestId) return;

    const setValue = (id, value) => { const el = document.getElementById(id); if (el && value) el.value = value; };
    if (data.commonName && nameEl) nameEl.value = data.commonName;
    const typeEl = document.getElementById('inventory-type'); if (typeEl && data.type) typeEl.value = data.type;
    const statusEl = document.getElementById('inventory-status'); if (statusEl) statusEl.value = statusEl.value || 'stable';
    setValue('inventory-scientific', data.scientificName || '');
    setValue('inventory-range', data.naturalRange || '');
    if (Array.isArray(data.facts)) setValue('inventory-facts', data.facts.slice(0, 5).join('\n'));
    if (data.notes) setValue('inventory-notes', data.notes);
    showToast('✨ Details filled — review, then tap Save to Catalog.');
  } catch(e) {
    if (requestId === inventoryAiFillRequestId) showToast('⚠️ Could not fill details with AI');
  } finally {
    if (requestId === inventoryAiFillRequestId) inventoryAiFillInProgress = false;
    if (btn) { btn.disabled = false; btn.textContent = originalText || '✨ Fill Details with AI'; }
  }
}

async function saveInventoryItem() {
  if (inventoryAiFillInProgress) { showToast('⏳ AI is still filling details. Please wait, then save.'); return; }
  // Invalidate any stale AI-fill response so it cannot repopulate the form after saving.
  inventoryAiFillRequestId++;
  const name = document.getElementById('inventory-name')?.value.trim();
  if (!name) { showToast('⚠️ Enter a livestock/coral name'); return; }
  const type = document.getElementById('inventory-type')?.value || 'other';
  const status = document.getElementById('inventory-status')?.value || 'stable';
  const location = document.getElementById('inventory-location')?.value.trim() || '';
  const naturalRange = document.getElementById('inventory-range')?.value.trim() || '';
  const scientificName = document.getElementById('inventory-scientific')?.value.trim() || '';
  const factsText = document.getElementById('inventory-facts')?.value.trim() || '';
  const facts = factsText ? factsText.split('\n').map(x => x.trim()).filter(Boolean) : [];
  const notes = document.getElementById('inventory-notes')?.value.trim() || '';

  const items = getInventoryItems();
  const editingId = document.getElementById('inventory-edit-id')?.value || '';
  // Only update an existing inventory item when the user explicitly loaded it for editing.
  // Do NOT auto-match by name for new entries: AI fill may normalize a vague common name
  // like "shrimp" into an existing default item such as "Tiger pistol shrimp", which
  // made the app update a default item instead of saving the user's new custom item.
  let existingIndex = editingId ? items.findIndex(i => String(i.id) === String(editingId)) : -1;
  const existing = existingIndex >= 0 ? items[existingIndex] : {};
  const entryId = existing.id || `custom-inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  let photoKey = existing.photoKey || '';
  let photoUpdatedAt = existing.photoUpdatedAt || '';
  if (pendingInventoryPhotoData) {
    photoKey = photoKey || `inventory-photo-${entryId}`;
    try {
      await saveInventoryPhotoData(photoKey, pendingInventoryPhotoData);
      photoUpdatedAt = new Date().toISOString();
    } catch(e) {
      console.error(e);
      showToast('⚠️ Could not save photo. The item was not saved.');
      return;
    }
  }

  const entry = normalizeInventoryItem({
    ...existing,
    id: entryId,
    name, type, status, location, naturalRange, scientificName, facts, notes,
    photoKey,
    photoData: '',
    photoUpdatedAt,
    updatedAt:new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString()
  });

  if (existingIndex >= 0) items[existingIndex] = entry; else items.unshift(entry);

  // Save custom user-created items directly to the custom inventory store before
  // refreshing the full inventory. This prevents new livestock from disappearing
  // when the default inventory is rebuilt during tab navigation.
  const isDefaultInventoryItem = defaultInventoryIdSet().has(String(entry.id || ''));
  if (!isDefaultInventoryItem) upsertCustomInventoryItem(entry);

  const saved = setInventoryItems(items);
  if (!saved) {
    showToast('⚠️ Could not save. Try exporting a backup and clearing old browser data first.');
    return;
  }

  // Extra persistence for user-created animals/corals. This keeps custom livestock
  // from disappearing if the default inventory is later rebuilt or migrated.
  persistCustomInventorySubset(items);

  currentInventoryTab = inventoryTabGroup(entry);
  clearInventoryForm();
  renderInventory();
  renderLivestockGuide();
  renderLivestockCatalogModal();
  showToast(existingIndex >= 0 ? '✅ Inventory item updated' : '✅ Inventory item added');
}
function clearInventoryForm() {
  // Make sure any late AI-fill response cannot repopulate the fields after save/clear.
  inventoryAiFillRequestId++;
  inventoryAiFillInProgress = false;
  ['inventory-name','inventory-location','inventory-range','inventory-scientific','inventory-facts','inventory-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const type = document.getElementById('inventory-type'); if (type) type.value = 'fish';
  const status = document.getElementById('inventory-status'); if (status) status.value = 'stable';
  const file = document.getElementById('inventory-photo-file');
  if (file) file.value = '';
  const preview = document.getElementById('inventory-photo-preview');
  if (preview) { preview.innerHTML = ''; preview.classList.remove('visible'); }
  pendingInventoryPhotoData = '';
  const edit = document.getElementById('inventory-edit-id');
  if (edit) edit.value = '';
  const btn = document.getElementById('inventory-ai-fill-btn');
  if (btn) { btn.disabled = false; btn.textContent = '✨ Fill Details with AI'; }
}



async function loadInventoryItemForEdit(id) {
  const item = getInventoryItems().find(i => String(i.id) === String(id));
  if (!item) return;
  currentInventoryTab = inventoryTabGroup(item);
  document.querySelectorAll('.inventory-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.inventoryTab === currentInventoryTab));
  let editField = document.getElementById('inventory-edit-id');
  if (!editField) {
    editField = document.createElement('input');
    editField.type = 'hidden';
    editField.id = 'inventory-edit-id';
    (document.getElementById('inventory-name')?.parentElement || document.body).appendChild(editField);
  }
  editField.value = item.id || '';
  const map = {
    'inventory-name': item.name || '',
    'inventory-location': item.location || '',
    'inventory-range': item.naturalRange || '',
    'inventory-scientific': item.scientificName || '',
    'inventory-facts': (item.facts || []).join('\n'),
    'inventory-notes': item.notes || ''
  };
  Object.entries(map).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
  const type = document.getElementById('inventory-type'); if (type) type.value = item.type || 'other';
  const status = document.getElementById('inventory-status'); if (status) status.value = item.status || 'stable';
  pendingInventoryPhotoData = '';
  const preview = document.getElementById('inventory-photo-preview');
  const existingPhoto = await getInventoryPhotoData(inventoryPhotoKeyFor(item));
  if (preview && existingPhoto) {
    preview.innerHTML = `<img src="${existingPhoto}" alt="Current livestock photo"><div><strong>Current photo loaded.</strong><br><span style="font-size:12px;color:var(--text-mid);font-weight:700;">Choose a new photo to replace it, or save to keep it.</span></div>`;
    preview.classList.add('visible');
  } else if (preview) {
    preview.innerHTML = '';
    preview.classList.remove('visible');
  }
  showToast('✏️ Loaded item for editing');
}

async function deleteInventoryItem(id) {
  const item = getInventoryItems().find(i => String(i.id) === String(id));
  await deleteInventoryPhotoData(inventoryPhotoKeyFor(item));
  removeCustomInventoryItem(id);
  if (!setInventoryItems(getInventoryItems().filter(i => String(i.id) !== String(id)))) { showToast('⚠️ Could not update inventory'); return; }
  renderInventory();
  renderLivestockGuide();
  renderLivestockCatalogModal();
  showToast('🗑️ Inventory item removed');
}

async function removeInventoryPhoto(id) {
  const items = getInventoryItems();
  const idx = items.findIndex(i => String(i.id) === String(id));
  if (idx < 0) return;
  await deleteInventoryPhotoData(inventoryPhotoKeyFor(items[idx]));
  items[idx] = { ...items[idx], photoData:'', photoKey:'', photoUpdatedAt:'', updatedAt:new Date().toISOString() };
  if (!setInventoryItems(items)) { showToast('⚠️ Could not update inventory'); return; }
  renderInventory();
  renderLivestockGuide();
  renderLivestockCatalogModal();
  showToast('🗑️ Photo removed');
}

function renderInventory() {
  const el = document.getElementById('inventory-list');
  if (!el) return;
  const items = getInventoryItems().filter(i => inventoryTabGroup(i) === currentInventoryTab);
  document.querySelectorAll('.inventory-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.inventoryTab === currentInventoryTab);
  });
  const order = { stressed:0, recovering:1, watch:2, healthy:3, stable:4, 'lost/resolved':5 };
  const sorted = [...items].sort((a,b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || String(a.type).localeCompare(String(b.type)) || String(a.name).localeCompare(String(b.name)));
  if (!sorted.length) {
    const label = currentInventoryTab === 'fish' ? 'fish' : currentInventoryTab === 'coral' ? 'coral/anemone' : 'invert';
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🐠</div>No ${label} entries in this inventory tab yet.</div>`;
    return;
  }
  el.innerHTML = sorted.map(i => {
    const factsCount = Array.isArray(i.facts) ? i.facts.length : 0;
    return `<div class="inventory-item">
      <div class="inventory-photo-thumb" ${inventoryPhotoKeyFor(i) ? `data-inventory-photo-key="${escapeHtml(inventoryPhotoKeyFor(i))}" data-inventory-photo-name="${escapeHtml(i.name)}"` : ''}>🐠</div>
      <div class="inventory-main">
        <div class="inventory-name">${escapeHtml(i.name)}</div>
        ${i.scientificName ? `<div class="inventory-species">${escapeHtml(i.scientificName)}</div>` : ''}
        <div class="inventory-meta">${escapeHtml(i.type || 'other')} · ${escapeHtml(i.status || 'stable')}${i.location ? ` · ${escapeHtml(i.location)}` : ''}${factsCount ? ` · ${factsCount} facts` : ''}</div>
        ${i.notes ? `<div class="inventory-notes-text">${escapeHtml(i.notes)}</div>` : ''}
        <div class="inventory-actions">
          <label class="inventory-small-btn" for="inv-photo-${escapeHtml(i.id)}">Upload photo</label>
          <input class="inventory-photo-input" id="inv-photo-${escapeHtml(i.id)}" type="file" accept="image/*" onchange="uploadInventoryPhoto('${escapeHtml(i.id)}', event)">
          <button class="inventory-small-btn" onclick="loadInventoryItemForEdit('${escapeHtml(i.id)}')">Edit</button>
          ${inventoryPhotoKeyFor(i) ? `<button class="inventory-small-btn danger" onclick="removeInventoryPhoto('${escapeHtml(i.id)}')">Remove photo</button>` : ''}
        </div>
      </div>
      <button class="reminder-delete-small" onclick="deleteInventoryItem('${escapeHtml(i.id)}')" aria-label="Delete inventory item">×</button>
    </div>`;
  }).join('');
  hydrateInventoryImages(el);
}

function toggleLivestockGuide() {
  const panel = document.getElementById('livestock-guide-panel');
  if (!panel) return;
  panel.classList.toggle('visible');
  renderLivestockGuide();
}


let currentLivestockCatalogTab = 'fish';

function setLivestockCatalogTab(tab) {
  const allowed = ['fish', 'invert', 'coral'];
  currentLivestockCatalogTab = allowed.includes(tab) ? tab : 'fish';
  document.querySelectorAll('.catalog-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.catalogTab === currentLivestockCatalogTab);
  });
  renderLivestockCatalogModal();
}

function inventoryCatalogGroup(item) {
  const type = String(item?.type || 'other').toLowerCase();
  if (type === 'fish') return 'fish';
  if (type === 'coral' || type === 'anemone') return 'coral';
  return 'invert';
}

function livestockPhotoHtml(item) {
  const key = inventoryPhotoKeyFor(item);
  if (!key) {
    return '<div class="livestock-guide-photo no-photo"><div>📷</div><span>No photo uploaded</span></div>';
  }
  return `<div class="livestock-guide-photo" data-inventory-photo-key="${escapeHtml(key)}" data-inventory-photo-name="${escapeHtml(item.name || 'livestock photo')}"><div>📷</div><span>Loading photo...</span></div>`;
}

function getLivestockGuideHtml(filterGroup = 'all') {
  let items = getInventoryItems().filter(i => (i.status || '') !== 'lost/resolved');
  if (filterGroup !== 'all') items = items.filter(i => inventoryCatalogGroup(i) === filterGroup);
  if (!items.length) {
    const label = filterGroup === 'fish' ? 'fish' : filterGroup === 'coral' ? 'coral/anemone' : filterGroup === 'invert' ? 'invert' : 'active livestock or coral';
    return `<div class="livestock-guide-empty">No ${label} entries yet. Add items in Log → Long-Term Reef Tools → Livestock & Coral Inventory.</div>`;
  }
  const order = { fish:0, anemone:1, coral:2, invert:3, other:4 };
  const sorted = [...items].sort((a,b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || String(a.name).localeCompare(String(b.name)));
  return sorted.map((i, idx) => {
    const facts = Array.isArray(i.facts) ? i.facts : [];
    const cardId = `catalog-card-${idx}-${String(i.id || i.name || 'item').replace(/[^a-z0-9_-]/gi, '-')}`;
    return `<article class="livestock-guide-card collapsed-card" id="${escapeHtml(cardId)}">
      <button class="livestock-guide-card-head" type="button" onclick="toggleLivestockCatalogCard('${escapeHtml(cardId)}')" aria-label="Expand ${escapeHtml(i.name)} details">
        ${livestockPhotoHtml(i)}
        <div class="livestock-guide-card-title-wrap">
          <div class="livestock-guide-name">${escapeHtml(i.name)}</div>
          ${i.scientificName ? `<div class="livestock-guide-scientific">${escapeHtml(i.scientificName)}</div>` : ''}
        </div>
        <span class="catalog-chevron">⌄</span>
      </button>
      <div class="livestock-guide-card-body">
        ${i.naturalRange ? `<div class="livestock-guide-range">Natural range: ${escapeHtml(i.naturalRange)}</div>` : ''}
        ${facts.length ? `<ul class="livestock-guide-facts">${facts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
        ${i.notes ? `<div class="livestock-guide-notes"><strong>Your tank:</strong> ${escapeHtml(i.notes)}</div>` : ''}
      </div>
    </article>`;
  }).join('');
}

function renderLivestockGuide() {
  const el = document.getElementById('livestock-guide-list');
  if (!el) return;
  el.innerHTML = getLivestockGuideHtml();
  hydrateInventoryImages(el);
}

function renderLivestockCatalogModal() {
  const el = document.getElementById('livestock-catalog-list');
  if (!el) return;
  document.querySelectorAll('.catalog-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.catalogTab === currentLivestockCatalogTab);
  });
  el.innerHTML = getLivestockGuideHtml(currentLivestockCatalogTab);
  hydrateInventoryImages(el);
}

function printLivestockGuide() {
  const panel = document.getElementById('livestock-guide-panel');
  if (panel && !panel.classList.contains('visible')) panel.classList.add('visible');
  renderLivestockGuide();
  renderLivestockCatalogModal();
  setTimeout(() => {
    document.querySelectorAll('.livestock-guide-card').forEach(card => card.classList.add('expanded'));
    window.print();
  }, 150);
}

function defaultGuardrails() {
  return [
    'Do not dose kalk until calcium is below 450 and alkalinity is stable for at least 3 weeks.',
    'Do not stack multiple major changes on the same day; separate water changes, media changes, pest treatments, and dosing changes when possible.',
    'Do not chase phosphate down quickly; reduce nutrients gradually and watch alkalinity/coral response.',
    'Do not add SPS until phosphate and alkalinity trends are stable for several weeks.',
    'Treat aiptasia in sections rather than the whole tank at once.',
    'Chaeto/cheato reactor planning is cancelled unless the user explicitly reverses that later.',
    'When in doubt, log the change and observe before making the next intervention.'
  ];
}

function getGuardrails() {
  let items = memoryArray('reef_guardrails');
  if (!items.length) {
    items = defaultGuardrails().map((text, idx) => ({ id:'gr-'+idx, text, default:true }));
    try { localStorage.setItem('reef_guardrails', JSON.stringify(items)); } catch(e) {}
  }
  return items;
}

function setGuardrails(items) { try { localStorage.setItem('reef_guardrails', JSON.stringify(items)); } catch(e) {} }

function addGuardrail() {
  const input = document.getElementById('guardrail-input');
  const text = input?.value.trim();
  if (!text) { showToast('⚠️ Enter a guardrail first'); return; }
  const items = getGuardrails();
  items.unshift({ id:Date.now().toString(36)+Math.random().toString(36).slice(2), text, default:false, createdAt:new Date().toISOString() });
  setGuardrails(items);
  input.value = '';
  renderGuardrails();
  renderLongTermSummary();
  showToast('✅ Guardrail added');
}

function deleteGuardrail(id) {
  setGuardrails(getGuardrails().filter(g => g.id !== id));
  renderGuardrails();
  renderLongTermSummary();
  showToast('🗑️ Guardrail removed');
}

function renderGuardrails() {
  const el = document.getElementById('guardrails-list');
  if (!el) return;
  const items = getGuardrails();
  el.innerHTML = items.map(g => `
    <div class="strategy-item">
      <div class="strategy-dot">🧭</div>
      <div class="strategy-text">${escapeHtml(g.text)}</div>
      <button class="reminder-delete-small" onclick="deleteGuardrail('${escapeHtml(g.id)}')" aria-label="Remove guardrail">×</button>
    </div>`).join('');
}

function defaultMaintenanceIntervals() {
  return [
    'Testing: phosphate and alkalinity every 3–5 days during stabilization; weekly or as-needed once stable.',
    'Carbon: replace/check roughly every 4 weeks or sooner after chemical treatments/allelopathy concerns.',
    'GFO: judge by phosphate trend and coral response; avoid aggressive increases.',
    'Water changes: plan around days off; avoid stacking with other stressful interventions when possible.',
    'ICP: every 3–6 months, or when unexplained coral issues persist.',
    'Pumps/skimmer/UV/filter roller: inspect during days-off block; deep clean on a rotating schedule.'
  ];
}

function renderMaintenanceIntervals() {
  const el = document.getElementById('maintenance-intervals');
  if (!el) return;
  el.innerHTML = defaultMaintenanceIntervals().map(text => `<div class="interval-chip">${escapeHtml(text)}</div>`).join('');
}

function getRecentChanges(limit = 6) {
  const changes = [];
  getActionEntries().forEach(a => changes.push({ icon: actionIcon(a.category), title: a.title || 'Action', meta: `${memoryLineDate(a)} · ${a.category || 'other'}`, date: memoryDateValue(a) }));
  getCompletedHistoryEntries().forEach(h => changes.push({ icon:'✅', title:`Completed: ${h.title || 'Task'}`, meta: `${memoryLineDate(h)} · ${h.type || 'history'}`, date: memoryDateValue(h) }));
  memoryArray('reef_logs').forEach(l => changes.push({ icon:'📊', title:buildLogMemoryLine(l).replace(/^[^:]+:\s*/, ''), meta:`${memoryLineDate(l)} · parameter log`, date: memoryDateValue(l) }));
  return changes.sort((a,b) => b.date - a.date).slice(0, limit);
}

function renderRecentChangesHome() {
  const el = document.getElementById('recent-changes-home');
  if (!el) return;
  const items = getRecentChanges(5);
  if (!items.length) { el.innerHTML = '<div class="what-changed-empty">No recent changes logged yet.</div>'; return; }
  el.innerHTML = items.map(c => `
    <div class="recent-change-item">
      <div class="recent-change-icon">${escapeHtml(c.icon)}</div>
      <div><div class="recent-change-title">${escapeHtml(c.title)}</div><div class="recent-change-meta">${escapeHtml(c.meta)}</div></div>
    </div>`).join('');
}

function buildInventoryMemorySummary() {
  const items = getInventoryItems();
  const active = items.filter(i => !String(i.status || '').includes('lost'));
  const watch = items.filter(i => ['watch','recovering','stressed'].includes(i.status));
  const counts = active.reduce((acc,i) => { acc[i.type || 'other'] = (acc[i.type || 'other'] || 0) + 1; return acc; }, {});
  const countLine = Object.entries(counts).map(([k,v]) => `${v} ${k}`).join(', ') || 'No active inventory items.';
  const watchLine = watch.length ? watch.map(i => `${i.name} (${i.status}${i.notes ? ` - ${i.notes}` : ''})`).join('; ') : 'No inventory items flagged for watch/recovery/stress.';
  return `Inventory counts: ${countLine}. Items needing attention: ${watchLine}`;
}

function buildGuardrailMemorySummary() {
  return getGuardrails().slice(0, 12).map(g => `- ${g.text}`).join('\n');
}

function buildRecentChangesSummary() {
  const items = getRecentChanges(10);
  return items.length ? items.map(c => `${c.meta}: ${c.title}`).join('\n') : 'No recent changes logged yet.';
}

function renderLongTermSummary() {
  const el = document.getElementById('long-term-summary-box');
  if (!el) return;
  const logs = memorySortNewest([...getDefaultLogs(), ...memoryArray('reef_logs')]);
  const actions = memorySortNewest(memoryArray('reef_actions'));
  const completed = memorySortNewest(memoryArray('reef_completed_history'));
  const summary = [
    `Tank Mode: ${getTankMode()} — ${TANK_MODE_COPY[getTankMode()] || ''}`,
    '',
    buildLongTermTankSummary(logs, actions, completed),
    '',
    buildInventoryMemorySummary(),
    '',
    'Recent changes:',
    buildRecentChangesSummary()
  ].join('\n');
  el.textContent = summary;
}

function refreshLongTermSummary() {
  renderLongTermSummary();
  showToast('✅ Long-term summary refreshed');
}

function getMonthlyReviews() { return memoryArray('reef_monthly_reviews'); }
function setMonthlyReviews(items) { try { localStorage.setItem('reef_monthly_reviews', JSON.stringify(items)); } catch(e) {} }

async function generateMonthlyReview() {
  const box = document.getElementById('monthly-review-box');
  if (!box) return;
  box.textContent = 'Reviewing the last month…';
  const prompt = `Give me a concise monthly reef review for this tank. Focus on long-term husbandry, parameter trends, maintenance consistency, livestock/coral watch items, what changed recently, and the best focus for the next month. Do not suggest chaeto/cheato reactor tasks. Use headings and keep it practical.`;
  try {
    const result = await askOpenAI(prompt, [], getModelMode());
    const text = result.answer || 'No review returned.';
    box.textContent = text;
    const reviews = getMonthlyReviews();
    reviews.unshift({ id:Date.now().toString(36), date:new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}), isoDate:new Date().toISOString(), text });
    setMonthlyReviews(reviews.slice(0, 12));
    showToast('✅ Monthly review saved');
  } catch(e) {
    box.textContent = 'Could not generate a monthly review right now. Try again from the Ask AI tab or check the backend connection.';
  }
}

function renderMonthlyReview() {
  const box = document.getElementById('monthly-review-box');
  if (!box) return;
  const latest = getMonthlyReviews()[0];
  box.textContent = latest ? `Latest monthly review (${latest.date}):

${latest.text}` : 'No monthly review saved yet.';
}

function renderLongTermTools() {
  initTankMode();
  renderInventory();
  renderGuardrails();
  renderMaintenanceIntervals();
  renderRecentChangesHome();
  renderLongTermSummary();
  renderMonthlyReview();
  renderTankKnowledgeBase();
}


// ── Backup / restore ───────────────────────────────────────────────────────
const REEF_BACKUP_KEYS = ['reef_logs', 'reef_actions', 'reef_completed_history', 'reef_ai_reminders', 'reef_static_reminder_states', 'reef_days_off_plan_states', 'reef_hidden_static_reminders', 'reef_hidden_plan_tasks', 'reef_ai_days_off_plans', 'reef_task_schedule', 'reef_resolved_issues', 'reef_model_mode', 'reef_use_tank_context', 'reef_tank_mode', 'reef_inventory', 'reef_inventory_custom', 'reef_guardrails', 'reef_monthly_reviews', 'reef_inventory_custom_v2', 'reef_chat_conversations', 'reef_tank_knowledge_base'];

function exportReefBackup() {
  const payload = { app: 'Reef Keeper', version: 2, exportedAt: new Date().toISOString(), data: {} };
  REEF_BACKUP_KEYS.forEach(key => { payload.data[key] = localStorage.getItem(key); });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reef-keeper-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('✅ Backup exported');
}

function importReefBackup(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || '{}'));
      const data = payload.data || payload;
      REEF_BACKUP_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== null && data[key] !== undefined) {
          localStorage.setItem(key, typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]));
        }
      });
      renderLogHistory();
      renderTrendControls();
      renderTrendChart(currentTrendParam);
      renderActionHistory();
      renderCompletedHistory();
      renderTankStatus();
      renderLongTermTools();
      renderSavedReminders();
      renderReminderCenter();
      updateDaysOffDisplay();
      initStaticReminderChecks();
      initModelMode();
      initTankContextToggle();
      showToast('✅ Backup imported');
    } catch(e) {
      showToast('⚠️ Could not import backup');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ── Local AI reminders ───────────────────────────────────────────────────────
function getSavedReminders() {
  try { return JSON.parse(localStorage.getItem('reef_ai_reminders') || '[]'); } catch(e) { return []; }
}

function setSavedReminders(reminders) {
  try { localStorage.setItem('reef_ai_reminders', JSON.stringify(reminders)); } catch(e) {}
}

function formatDueDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function addReminderDays(days, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  d.setHours(8, 0, 0, 0);
  return d;
}

function getRepeatDays(repeatText, titleText = '') {
  const text = `${repeatText || ''} ${titleText || ''}`.toLowerCase();
  if (!text || text.includes('none') || text.includes('one-time') || text.includes('once')) return null;
  if (text.includes('daily') || text.includes('every day')) return 1;
  if (text.includes('every 3') || text.includes('3-5') || text.includes('3–5')) return 3;
  if (text.includes('every 4') && text.includes('week')) return 28;
  if (text.includes('monthly') || text.includes('every month')) return 30;
  if (text.includes('bi-weekly') || text.includes('biweekly') || text.includes('every 2 week') || text.includes('every two week')) return 14;
  if (text.includes('weekly') || text.includes('every week')) return 7;
  const dayMatch = text.match(/every\s+(\d+)\s+day/);
  if (dayMatch) return Number(dayMatch[1]);
  const weekMatch = text.match(/every\s+(\d+)\s+week/);
  if (weekMatch) return Number(weekMatch[1]) * 7;
  return null;
}

function getNextDueIsoFromReminder(reminder, fromDate = new Date()) {
  const repeatDays = getRepeatDays(reminder.repeat, reminder.title);
  return repeatDays ? addReminderDays(repeatDays, fromDate).toISOString() : null;
}

function normalizeSavedReminderRecurrences() {
  const now = new Date();
  let changed = false;
  const reminders = getSavedReminders().map(r => {
    if (!r || !r.completed) return r;
    const repeatDays = getRepeatDays(r.repeat, r.title);
    if (!repeatDays) return r;

    let nextDueAt = r.nextDueAt;
    if (!nextDueAt && r.completedAt) {
      nextDueAt = addReminderDays(repeatDays, new Date(r.completedAt)).toISOString();
      changed = true;
    }

    if (nextDueAt && new Date(nextDueAt).getTime() <= now.getTime()) {
      changed = true;
      return { ...r, completed: false, completedAt: null, nextDueAt: null };
    }
    return { ...r, nextDueAt };
  });
  if (changed) setSavedReminders(reminders);
  return reminders;
}

function saveSuggestedReminder(reminder) {
  const reminders = normalizeSavedReminderRecurrences();
  reminders.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    createdAt: new Date().toISOString(),
    completed: false,
    completedAt: null,
    nextDueAt: null,
    title: reminder.title || 'Reef reminder',
    notes: reminder.notes || '',
    when: reminder.when || '',
    repeat: reminder.repeat || 'none',
    priority: reminder.priority || 'normal',
    category: reminder.category || 'other',
    emoji: reminder.emoji || '⏰'
  });
  setSavedReminders(reminders.slice(0, 50));
  renderSavedReminders();
  renderReminderCenter();
}

function deleteSavedReminder(id) {
  const reminders = normalizeSavedReminderRecurrences().filter(r => r.id !== id);
  setSavedReminders(reminders);
  const schedule = getTaskSchedule();
  delete schedule[savedTaskKey(id)];
  setTaskSchedule(schedule);
  renderSavedReminders();
  renderReminderCenter();
  showToast('🗑️ Reminder deleted');
}

function toggleSavedReminderComplete(id) {
  const now = new Date();
  const reminders = normalizeSavedReminderRecurrences().map(r => {
    if (r.id !== id) return r;
    const completed = !r.completed;
    const completedAt = completed ? now.toISOString() : null;
    return { ...r, completed, completedAt, nextDueAt: completed ? getNextDueIsoFromReminder(r, now) : null };
  });
  setSavedReminders(reminders);
  const updated = reminders.find(r => r.id === id);
  if (updated && updated.completed) {
    recordCompletedHistory({
      type: 'reminder',
      source: 'AI Reminder',
      sourceId: updated.id,
      title: `${updated.emoji || '⏰'} ${updated.title}`,
      notes: [updated.when || '', updated.repeat && updated.repeat !== 'none' ? updated.repeat : '', updated.notes || ''].filter(Boolean).join(' · '),
      completedAt: updated.completedAt,
      nextDueAt: updated.nextDueAt
    });
  } else if (updated) {
    removeCompletedHistoryFor(updated.id, 'AI Reminder');
  }
  renderSavedReminders();
  renderReminderCenter();
  if (updated && updated.completed && updated.nextDueAt) {
    showToast(`✅ Checked off until ${formatDueDate(updated.nextDueAt)}`);
  } else {
    showToast(updated && updated.completed ? '✅ Reminder checked off' : '↩️ Reminder restored');
  }
}

function reminderBadgeClass(priority) {
  if (priority === 'urgent') return 'rb-urgent';
  if (priority === 'soon') return 'rb-soon';
  return 'rb-ok';
}


// ── Integrated Reef Tasks scheduling ───────────────────────────────────────
function getTaskSchedule() {
  try { return JSON.parse(localStorage.getItem('reef_task_schedule') || '{}'); } catch(e) { return {}; }
}

function setTaskSchedule(schedule) {
  try { localStorage.setItem('reef_task_schedule', JSON.stringify(schedule || {})); } catch(e) {}
}

function staticTaskKey(id) { return `static:${id}`; }
function savedTaskKey(id) { return `saved:${id}`; }

function getScheduledDayForTask(taskKey) {
  const schedule = getTaskSchedule();
  const day = Number(schedule[taskKey]);
  return day >= 1 && day <= 7 ? day : null;
}

function getScheduleOptions(selectedDay) {
  const opts = ['<option value="">Unscheduled</option>'];
  for (let i = 1; i <= 7; i++) opts.push(`<option value="${i}"${Number(selectedDay) === i ? ' selected' : ''}>Day ${i}</option>`);
  return opts.join('');
}

function scheduleTaskToDay(taskKey, day) {
  const schedule = getTaskSchedule();
  const nextDay = Number(day);
  if (!nextDay || nextDay < 1 || nextDay > 7) {
    delete schedule[taskKey];
    showToast('Task unscheduled');
  } else {
    schedule[taskKey] = nextDay;
    showToast(`Scheduled for Day ${nextDay}`);
  }
  setTaskSchedule(schedule);
  renderReminderCenter();
  renderDaysOffWorkPlan();
}

function getSuggestedDayForTaskText(text) {
  const t = String(text || '').toLowerCase();
  if (/test|retest|parameter|phosphate|alk|alkalinity|nitrate|calcium|magnesium|salinity/.test(t)) return /retest/.test(t) ? 6 : 1;
  if (/water change|mix salt|fritz|saltwater/.test(t)) return 2;
  if (/aiptasia|treat|berghia|pest/.test(t)) return 3;
  if (/carbon|gfo|media|skimmer|uv|pump|equipment|filter/.test(t)) return 4;
  if (/feed|feeding|fish|livestock|coral|mushroom|bta|anemone|observe|inspect/.test(t)) return 5;
  if (/prep|prepare|work|coverage|auto feeder|icp|mail|backup/.test(t)) return 7;
  return 4;
}

function getTaskTextForAutoSchedule(taskKey) {
  const task = getTaskRecordByKey(taskKey);
  if (task) return `${task.title || ''} ${task.detail || ''}`;
  return String(taskKey || '');
}

function autoScheduleTask(taskKey) {
  const suggested = getSuggestedDayForTaskText(getTaskTextForAutoSchedule(taskKey));
  scheduleTaskToDay(taskKey, suggested);
}

function estimateTaskWorkload(taskText) {
  const t = String(taskText || '').toLowerCase();
  if (/water change|aiptasia|deep clean|major|replace gfo|gfo media|equipment|pump|skimmer|uv|reactor|carbon/.test(t)) return 3;
  if (/test|inspect|observe|check|confirm|feed|target-feed|review|fill|prepare|ato|log|record/.test(t)) return 1;
  return 2;
}

function getAllowedDaysForTask(taskText) {
  const t = String(taskText || '').toLowerCase();
  if (/water change|saltwater|fritz/.test(t)) return [2];
  if (/aiptasia|treatment|treat/.test(t)) return [3,5];
  if (/retest|phosphate|alkalinity|nitrate|calcium|magnesium|parameter|test/.test(t)) return [1,6];
  if (/carbon|gfo|media|skimmer|uv|pump|equipment|filter/.test(t)) return [4,5];
  if (/livestock|fish|feeding|feed|wrasse|tang|coral|observe/.test(t)) return [5,7];
  if (/ato|food|prepare|prep|work block|supplies/.test(t)) return [7];
  return [1,2,3,4,5,6,7];
}

function chooseBalancedDayForTask(task, schedule, loads) {
  const text = `${task.title || ''} ${task.detail || ''}`;
  const allowed = getAllowedDaysForTask(text);
  const preferred = getSuggestedDayForTaskText(text);
  const candidates = allowed.includes(preferred) ? allowed : [preferred, ...allowed].filter((v, i, a) => a.indexOf(v) === i);
  candidates.sort((a, b) => {
    const loadDiff = (loads[a] || 0) - (loads[b] || 0);
    if (loadDiff !== 0) return loadDiff;
    return Math.abs(a - preferred) - Math.abs(b - preferred);
  });
  return candidates[0] || preferred || 1;
}

function autoScheduleActiveTasks(options = {}) {
  const schedule = getTaskSchedule();
  const tasks = getAllActiveReefTasksForPlanning();
  const loads = {1:0,2:0,3:0,4:0,5:0,6:0,7:0};

  Object.entries(schedule).forEach(([taskKey, day]) => {
    const task = getTaskRecordByKey(taskKey);
    const dayNum = Number(day);
    if (task && dayNum >= 1 && dayNum <= 7) loads[dayNum] += estimateTaskWorkload(`${task.title || ''} ${task.detail || ''}`);
  });

  let count = 0;
  tasks.forEach(task => {
    if (!task || !task.id || schedule[task.id]) return;
    const day = chooseBalancedDayForTask(task, schedule, loads);
    schedule[task.id] = day;
    loads[day] += estimateTaskWorkload(`${task.title || ''} ${task.detail || ''}`);
    count++;
  });
  setTaskSchedule(schedule);
  renderReminderCenter();
  renderDaysOffWorkPlan();
  if (!options.silent) showToast(count ? `✅ Auto-balanced ${count} task${count === 1 ? '' : 's'} into the week` : 'All active tasks are already placed');
  return count;
}

function ensureDefaultAutoScheduledTasks() {
  autoScheduleActiveTasks({ silent: true });
}

function buildTaskScheduleControl(taskKey) {
  const selectedDay = getScheduledDayForTask(taskKey);
  const dayButtons = [1,2,3,4,5,6,7].map(day => `
      <button type="button" class="task-day-btn${Number(selectedDay) === day ? ' selected' : ''}" onclick="scheduleTaskToDay('${escapeHtml(taskKey)}', ${day})" aria-label="Schedule task to Day ${day}">Day ${day}</button>`).join('');
  return `<div class="task-schedule-row">
    <span class="task-schedule-label">Adjust schedule</span>
    <div class="task-day-buttons">
      ${dayButtons}
      <button type="button" class="task-day-btn auto-place" onclick="autoScheduleTask('${escapeHtml(taskKey)}')" aria-label="Auto-place task into the plan">Auto</button>
      ${selectedDay ? `<button type="button" class="task-day-btn unschedule" onclick="scheduleTaskToDay('${escapeHtml(taskKey)}', '')" aria-label="Remove task from the plan">Remove</button>` : ''}
    </div>
    ${selectedDay ? `<span class="task-scheduled-pill">Scheduled: Day ${selectedDay}</span>` : ''}
  </div>`;
}

function getTaskRecordByKey(taskKey) {
  const [kind, ...rest] = String(taskKey || '').split(':');
  const id = rest.join(':');
  if (kind === 'static') {
    const hidden = new Set(getHiddenStaticReminders());
    const r = STATIC_REMINDER_LIBRARY.find(item => item.id === id);
    if (!r || hidden.has(id)) return null;
    const state = getStaticReminderStateById(id);
    return {
      key: taskKey, kind, id, title: r.title, detail: r.detail, emoji: r.emoji || '⏰',
      completed: Boolean(state.completed), nextDueAt: state.nextDueAt || null,
      toggle: () => toggleStaticReminder(id),
      delete: () => deleteStaticReminderFromCenter(id)
    };
  }
  if (kind === 'saved') {
    const r = normalizeSavedReminderRecurrences().find(item => item.id === id);
    if (!r) return null;
    return {
      key: taskKey, kind, id, title: r.title, detail: [r.when || '', r.repeat && r.repeat !== 'none' ? r.repeat : '', r.notes || ''].filter(Boolean).join(' · ') || 'AI-saved reminder', emoji: r.emoji || '⏰',
      completed: Boolean(r.completed), nextDueAt: r.nextDueAt || null,
      toggle: () => toggleSavedReminderComplete(id),
      delete: () => deleteSavedReminder(id)
    };
  }
  return null;
}

function getScheduledTasksForDay(dayNum) {
  const schedule = getTaskSchedule();
  return Object.entries(schedule)
    .filter(([, day]) => Number(day) === Number(dayNum))
    .map(([taskKey]) => getTaskRecordByKey(taskKey))
    .filter(task => task && !task.completed);
}

function toggleScheduledTask(taskKey) {
  const task = getTaskRecordByKey(taskKey);
  if (!task) return;
  task.toggle();
  renderDaysOffWorkPlan();
}

function deleteScheduledTask(taskKey) {
  const task = getTaskRecordByKey(taskKey);
  if (!task) return;
  task.delete();
  const schedule = getTaskSchedule();
  delete schedule[taskKey];
  setTaskSchedule(schedule);
  renderReminderCenter();
  renderDaysOffWorkPlan();
}

function renderReminderItem(r) {
  const isCompleted = Boolean(r.completed);
  const repeatDays = getRepeatDays(r.repeat, r.title);
  const checkLabel = isCompleted ? 'Restore reminder' : 'Check off reminder';
  const doneUntil = isCompleted && r.nextDueAt ? `DONE UNTIL ${formatDueDate(r.nextDueAt).toUpperCase()}` : 'DONE';
  const status = isCompleted
    ? `<div class="reminder-completed-label">${escapeHtml(doneUntil)}</div>`
    : `<div class="reminder-badge ${reminderBadgeClass(r.priority)}">${escapeHtml((r.priority || 'normal').toUpperCase())}</div>`;
  const action = `<button class="reminder-check-btn${isCompleted ? ' checked' : ''}" onclick="toggleSavedReminderComplete('${escapeHtml(r.id)}')" aria-label="${checkLabel}">${isCompleted ? '✓' : ''}</button>`;
  const repeatNote = repeatDays ? `<div class="reminder-repeats-note">Repeats every ${repeatDays === 1 ? 'day' : repeatDays + ' days'}</div>` : '';
  const nextDue = isCompleted && r.nextDueAt ? `<div class="reminder-next-due">Next due: ${escapeHtml(formatDueDate(r.nextDueAt))}</div>` : '';
  const taskKey = savedTaskKey(r.id);
  const scheduleControl = buildTaskScheduleControl(taskKey);

  return `
    <div class="reminder-card-item saved-reminder-dynamic${isCompleted ? ' completed' : ''}">
      ${action}
      <div class="reminder-icon-big ri-purple">${escapeHtml(r.emoji || '⏰')}</div>
      <div class="reminder-info">
        <div class="reminder-title">${escapeHtml(r.title)}</div>
        <div class="reminder-detail">${escapeHtml(r.when || 'No date set')}${r.repeat && r.repeat !== 'none' ? ` · ${escapeHtml(r.repeat)}` : ''}${r.notes ? `<br>${escapeHtml(r.notes)}` : ''}${repeatNote}${nextDue}</div>
        ${scheduleControl}
      </div>
      ${status}
      <button class="reminder-delete-small" onclick="deleteSavedReminder('${escapeHtml(r.id)}')" aria-label="Delete reminder">×</button>
    </div>
  `;
}

function renderSavedReminders() {
  const container = document.getElementById('saved-ai-reminders');
  if (!container) return;

  const reminders = normalizeSavedReminderRecurrences();
  if (reminders.length === 0) {
    container.innerHTML = '<div class="saved-reminder-empty">No AI reminders saved yet. When Reef Keeper suggests one, tap Save Reminder.</div>';
    return;
  }

  const activeReminders = reminders.filter(r => !r.completed);
  const completedReminders = reminders.filter(r => r.completed);

  const activeHtml = activeReminders.length
    ? activeReminders.map(renderReminderItem).join('')
    : '<div class="saved-reminder-empty">All saved AI reminders are checked off.</div>';

  const completedHtml = completedReminders.length
    ? `<div class="reminder-section-label">Completed / waiting for next due date</div>${completedReminders.map(renderReminderItem).join('')}`
    : '';

  container.innerHTML = activeHtml + completedHtml;
}


function renderStaticReminderCenterItem(r) {
  const state = getStaticReminderStateById(r.id);
  const isCompleted = Boolean(state.completed);
  const rule = STATIC_REMINDER_RULES[r.id];
  const badgeText = isCompleted && state.nextDueAt ? `DUE ${formatDueDate(state.nextDueAt).toUpperCase()}` : (r.priority === 'urgent' ? 'URGENT' : r.priority === 'soon' ? 'SOON' : 'UPCOMING');
  const badgeClass = isCompleted ? 'rb-ok' : reminderBadgeClass(r.priority);
  const repeatNote = rule ? `<div class="reminder-repeats-note">Repeats ${escapeHtml(rule.label)} after you check it off.</div>` : '';
  const nextDue = isCompleted && state.nextDueAt ? `<div class="reminder-next-due">Checked off. It will come back ${escapeHtml(formatDueDate(state.nextDueAt))}.</div>` : '';
  const taskKey = staticTaskKey(r.id);
  const scheduleControl = buildTaskScheduleControl(taskKey);
  return `<div class="reminder-card-item${isCompleted ? ' completed' : ''}" data-static-reminder-id="${escapeHtml(r.id)}">
    <button type="button" class="static-reminder-check${isCompleted ? ' checked' : ''}" onclick="toggleStaticReminder('${escapeHtml(r.id)}')" aria-label="${isCompleted ? 'Restore reminder' : 'Check off reminder'}">${isCompleted ? '✓' : ''}</button>
    <div class="reminder-icon-big ${r.priority === 'urgent' ? 'ri-orange' : r.group === 'Days-Off' ? 'ri-blue' : 'ri-green'}">${escapeHtml(r.emoji || '⏰')}</div>
    <div class="reminder-info">
      <div class="reminder-title">${escapeHtml(r.title)}</div>
      <div class="reminder-detail">${escapeHtml(r.detail)}${repeatNote}${nextDue}</div>
      ${scheduleControl}
    </div>
    <div class="reminder-badge ${badgeClass}">${escapeHtml(badgeText)}</div>
    <button class="reminder-delete-small" onclick="deleteStaticReminderFromCenter('${escapeHtml(r.id)}')" aria-label="Delete reminder">×</button>
  </div>`;
}

function renderReminderCenter() {
  const list = document.getElementById('reminder-center-list');
  const summary = document.getElementById('reminder-center-summary');
  if (!list) return;

  const hidden = new Set(getHiddenStaticReminders());
  const staticItems = STATIC_REMINDER_LIBRARY.filter(r => !hidden.has(r.id));
  const saved = normalizeSavedReminderRecurrences();
  const activeSaved = saved.filter(r => !r.completed);
  const completedSaved = saved.filter(r => r.completed);
  const activeStatic = staticItems.filter(r => !getStaticReminderStateById(r.id).completed);
  const doneStatic = staticItems.filter(r => getStaticReminderStateById(r.id).completed);
  const schedule = getTaskSchedule();

  const unscheduledSaved = activeSaved.filter(r => !schedule[savedTaskKey(r.id)]);
  const unscheduledStatic = activeStatic.filter(r => !schedule[staticTaskKey(r.id)]);
  const scheduledCount = Object.keys(schedule).filter(key => getTaskRecordByKey(key)).length;

  if (summary) {
    summary.innerHTML = `
      <span class="reminder-center-pill">${activeStatic.length + activeSaved.length} active</span>
      <span class="reminder-center-pill">${scheduledCount} placed in plan</span>
      <span class="reminder-center-pill">${unscheduledStatic.length + unscheduledSaved.length} unscheduled</span>
      <span class="reminder-center-pill">${doneStatic.length + completedSaved.length} checked off / waiting</span>
      <span class="reminder-center-pill">${getHiddenStaticReminders().length + getHiddenPlanTasks().length} hidden/removed</span>`;
  }

  const unscheduledHtml = unscheduledSaved.map(renderReminderItem).join('') + unscheduledStatic.map(renderStaticReminderCenterItem).join('');
  const doneHtml = completedSaved.map(renderReminderItem).join('') + doneStatic.map(renderStaticReminderCenterItem).join('');
  list.innerHTML = `
    <div class="reminder-center-section">Unscheduled Reef Tasks</div>
    ${unscheduledHtml || '<div class="saved-reminder-empty">All active Reef Tasks are placed in the Days-Off Plan. Use Auto-Balance Week to rebalance, or move tasks directly from each day.</div>'}
    ${doneHtml ? `<div class="reminder-center-section">Checked off / waiting for next due date</div>${doneHtml}` : ''}`;
  renderHiddenTasksPanel();
}


// ── Checkable built-in reminders ────────────────────────────────────────────
const STATIC_REMINDER_RULES = {
  'test-phosphate-alkalinity': { repeatDays: 3, label: 'every 3 days' },
  'feed-australians-in-sump': { repeatDays: 1, label: 'daily' },
  'water-change-20-gal-fritz-rpm': { repeatDays: 14, label: 'every days-off cycle' },
  'water-change-20-gallons': { repeatDays: 14, label: 'every days-off cycle' },
  'replace-gfo-media': { repeatDays: 42, label: 'about every 6 weeks' },
  'replace-rox-0-8-carbon': { repeatDays: 28, label: 'every 4 weeks' }
};


const STATIC_REMINDER_LIBRARY = [
  { id:'test-phosphate-alkalinity', title:'Test Phosphate & Alkalinity', detail:'Every 3–5 days during stabilization. Last: May 5.', emoji:'🧪', priority:'urgent', group:'Priority' },
  { id:'feed-australians-in-sump', title:'Feed Australians in Sump', detail:'Daily — cannot be skipped. Needs coverage during work weeks.', emoji:'🐟', priority:'urgent', group:'Priority' },
  { id:'aiptasia-x-treatment', title:'Aiptasia-X Treatment', detail:'Treat a small section at lights-out, preferably during a days-off block.', emoji:'🪸', priority:'soon', group:'Priority' },
  { id:'water-change-20-gallons', title:'Water Change — 20 Gallons', detail:'Mix Fritz RPM night before. Target 1.025–1.026 SG.', emoji:'💧', priority:'soon', group:'Days-Off' },
  { id:'add-rox-0-8-carbon-to-reactor', title:'Add ROX 0.8 Carbon to Reactor', detail:'Rinse in RODI water until clear before loading.', emoji:'🪨', priority:'soon', group:'Days-Off' },
  { id:'post-australians-for-rehoming', title:'Post Australians for Rehoming', detail:'Reef2Reef classifieds + local Facebook reef groups.', emoji:'🦐', priority:'soon', group:'Days-Off' },
  { id:'replace-gfo-media', title:'Replace GFO Media', detail:'BRS High Capacity GFO. ~6 weeks from install — target mid-June 2026.', emoji:'🔬', priority:'normal', group:'Upcoming' },
  { id:'replace-rox-0-8-carbon', title:'Replace ROX 0.8 Carbon', detail:'Every 4 weeks. Exhausted carbon leaches back — do not skip.', emoji:'♻️', priority:'normal', group:'Upcoming' },
  { id:'next-icp-test-fauna-marin', title:'Next ICP Test — Fauna Marin', detail:'Mail sample late June to early July 2026.', emoji:'🧫', priority:'normal', group:'Upcoming' }
];

function getHiddenStaticReminders() {
  try { return JSON.parse(localStorage.getItem('reef_hidden_static_reminders') || '[]'); } catch(e) { return []; }
}

function setHiddenStaticReminders(ids) {
  try { localStorage.setItem('reef_hidden_static_reminders', JSON.stringify(Array.from(new Set(ids)))); } catch(e) {}
}

function getHiddenPlanTasks() {
  try { return JSON.parse(localStorage.getItem('reef_hidden_plan_tasks') || '[]'); } catch(e) { return []; }
}

function setHiddenPlanTasks(ids) {
  try { localStorage.setItem('reef_hidden_plan_tasks', JSON.stringify(Array.from(new Set(ids)))); } catch(e) {}
}

function getHiddenStaticReminderDetails() {
  const libraryById = Object.fromEntries(STATIC_REMINDER_LIBRARY.map(r => [r.id, r]));
  return getHiddenStaticReminders().map(id => {
    const r = libraryById[id];
    return {
      id,
      title: r ? r.title : id.replace(/-/g, ' '),
      meta: r ? `Reef Task · ${r.group || 'Reminder'}` : 'Reef Task · custom/old task'
    };
  });
}

function getHiddenPlanTaskDetails() {
  const plan = getCurrentDaysOffPlan();
  const byId = {};
  (plan.days || []).forEach(day => {
    (day.tasks || []).forEach((task, idx) => {
      const id = `d${day.day}-t${idx}`;
      byId[id] = { title: task, meta: `Days-Off Plan · Day ${day.day}: ${day.title || 'Task'}` };
    });
  });
  return getHiddenPlanTasks().map(id => {
    const found = byId[id];
    if (found) return { id, ...found };
    const match = String(id).match(/^d(\d+)-t(\d+)$/);
    return {
      id,
      title: match ? `Hidden task ${Number(match[2]) + 1}` : id,
      meta: match ? `Days-Off Plan · Day ${match[1]}` : 'Days-Off Plan · old/custom task'
    };
  });
}

function renderHiddenTasksPanel() {
  const panel = document.getElementById('hidden-tasks-panel');
  if (!panel) return;
  const staticItems = getHiddenStaticReminderDetails();
  const planItems = getHiddenPlanTaskDetails();
  const rows = [
    ...staticItems.map(item => ({ ...item, type: 'static' })),
    ...planItems.map(item => ({ ...item, type: 'plan' }))
  ];

  if (!rows.length) {
    panel.innerHTML = '<div class="hidden-tasks-empty">No hidden tasks. Deleted or AI-removed tasks will appear here so you can restore them later.</div>';
    return;
  }

  panel.innerHTML = `
    <div class="hidden-tasks-empty">These tasks are hidden from Reef Tasks or the Days-Off Plan. Restore any item that was removed by mistake.</div>
    ${rows.map(item => `<div class="hidden-task-row">
      <div>
        <div class="hidden-task-title">${escapeHtml(item.title)}</div>
        <div class="hidden-task-meta">${escapeHtml(item.meta)}</div>
      </div>
      <button class="hidden-task-restore" onclick="restoreHiddenTask('${escapeHtml(item.type)}', '${escapeHtml(item.id)}')">Restore</button>
    </div>`).join('')}
  `;
}

function toggleHiddenTasksPanel() {
  const panel = document.getElementById('hidden-tasks-panel');
  if (!panel) return;
  panel.classList.toggle('visible');
  renderHiddenTasksPanel();
}

function restoreHiddenTask(type, id) {
  if (type === 'static') {
    setHiddenStaticReminders(getHiddenStaticReminders().filter(item => item !== id));
  } else if (type === 'plan') {
    setHiddenPlanTasks(getHiddenPlanTasks().filter(item => item !== id));
  }
  renderReminderCenter();
  renderDaysOffWorkPlan();
  initStaticReminderChecks();
  const panel = document.getElementById('hidden-tasks-panel');
  if (panel) panel.classList.add('visible');
  renderHiddenTasksPanel();
  showToast('✅ Task restored');
}

function restoreAllHiddenTasks() {
  const total = getHiddenStaticReminders().length + getHiddenPlanTasks().length;
  if (!total) {
    showToast('No hidden tasks to restore');
    return;
  }
  if (!confirm(`Restore ${total} hidden task${total === 1 ? '' : 's'}?`)) return;
  setHiddenStaticReminders([]);
  setHiddenPlanTasks([]);
  renderReminderCenter();
  renderDaysOffWorkPlan();
  initStaticReminderChecks();
  const panel = document.getElementById('hidden-tasks-panel');
  if (panel) panel.classList.add('visible');
  renderHiddenTasksPanel();
  showToast('✅ Hidden tasks restored');
}


// ── Resolved issue memory ─────────────────────────────────────────────────
function getResolvedIssues() {
  try {
    const value = JSON.parse(localStorage.getItem('reef_resolved_issues') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch(e) { return {}; }
}

function setResolvedIssue(key, value) {
  const issues = getResolvedIssues();
  if (value) issues[key] = { ...(issues[key] || {}), ...value, resolvedAt: value.resolvedAt || new Date().toISOString() };
  else delete issues[key];
  try { localStorage.setItem('reef_resolved_issues', JSON.stringify(issues)); } catch(e) {}
}

function isAustralianStripyResolved() {
  const issue = getResolvedIssues().australianStripyRehomed;
  return Boolean(issue && issue.resolvedAt);
}

function isAustralianStripyText(text) {
  return /australian|australians|stripy|stripies|stripey|sump fish/i.test(String(text || ''));
}

function isChaetoReactorCancelled() {
  const issue = getResolvedIssues().chaetoReactorCancelled;
  return Boolean(issue && issue.resolvedAt);
}

function isChaetoText(text) {
  return /chaeto|cheato|cheeto|refugium|macroalgae|macro algae/i.test(String(text || ''));
}

function shouldFilterResolvedPlanTask(text) {
  const value = String(text || '');
  if (isAustralianStripyResolved() && isAustralianStripyText(value) && /rehome|rehoming|feed|feeding|coverage|sump|australian|stripy/i.test(value)) return true;
  if (isChaetoReactorCancelled() && isChaetoText(value) && /start|inspect|harvest|reactor|chaeto|cheato|cheeto|refugium|macro/i.test(value)) return true;
  return false;
}

function getResolvedIssueMemoryLines() {
  const issues = getResolvedIssues();
  const lines = [];
  if (issues.australianStripyRehomed) {
    const when = memoryLineDate({ isoDate: issues.australianStripyRehomed.resolvedAt });
    lines.push(`Australian Stripy issue RESOLVED on ${when}: user reported finding a new home for the Australian Stripy fish. Do not include Australian Stripy feeding, sump coverage, or rehoming tasks in future plans unless the user explicitly says the fish are still present.`);
  }
  if (issues.chaetoReactorCancelled) {
    const when = memoryLineDate({ isoDate: issues.chaetoReactorCancelled.resolvedAt });
    lines.push(`Chaeto reactor plan CANCELLED on ${when}: user said they are no longer going to add a chaeto reactor. Do not include chaeto reactor startup, harvest, refugium, or macroalgae tasks unless the user explicitly reverses this.`);
  }
  return lines;
}


// ── Tank Knowledge Base ────────────────────────────────────────────────────
const REEF_TANK_KB_KEY = 'reef_tank_knowledge_base';

function defaultTankKnowledgeItems() {
  return [
    { id:'kb-australian-stripy', category:'Livestock', title:'Australian Stripy rehomed', note:'Australian Stripy fish were rehomed/resolved. Do not include Australian Stripy feeding, sump coverage, or rehoming tasks unless the user says they are back.', createdAt:'2026-05-13T12:00:00.000Z', locked:true },
    { id:'kb-chaeto-cancelled', category:'Equipment', title:'Chaeto reactor plan cancelled', note:'User is no longer going to add a chaeto/cheato reactor. Do not suggest setup, harvest, refugium, or macroalgae tasks unless the user explicitly reverses this.', createdAt:'2026-05-22T12:00:00.000Z', locked:true },
    { id:'kb-kalk-hold', category:'Dosing', title:'Hold kalk dosing', note:'Do not dose kalk until calcium is below 450 mg/L and alkalinity has been stable for at least 3 weeks.', createdAt:'2026-05-13T12:00:00.000Z', locked:true },
    { id:'kb-stability-first', category:'Strategy', title:'Stability before aggressive changes', note:'Favor stable trends over chasing single readings. Avoid stacking water changes, media changes, pest treatments, and dosing changes on the same day.', createdAt:'2026-05-13T12:00:00.000Z', locked:true },
    { id:'kb-sps-wait', category:'Coral', title:'Wait on SPS additions', note:'Avoid adding SPS until phosphate and alkalinity trends have been stable for several weeks.', createdAt:'2026-05-13T12:00:00.000Z', locked:true }
  ];
}

function normalizeKnowledgeItem(item) {
  const now = new Date().toISOString();
  return {
    id: String(item?.id || ('kb-' + Date.now() + '-' + Math.random().toString(36).slice(2,7))),
    category: String(item?.category || 'General').trim() || 'General',
    title: String(item?.title || '').trim() || 'Tank note',
    note: String(item?.note || item?.notes || '').trim(),
    createdAt: item?.createdAt || now,
    updatedAt: item?.updatedAt || item?.createdAt || now,
    locked: Boolean(item?.locked)
  };
}

function getTankKnowledgeItems() {
  let custom = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(REEF_TANK_KB_KEY) || '[]');
    custom = Array.isArray(parsed) ? parsed : [];
  } catch(e) { custom = []; }
  const byId = new Map();
  defaultTankKnowledgeItems().map(normalizeKnowledgeItem).forEach(item => byId.set(item.id, item));
  custom.map(normalizeKnowledgeItem).forEach(item => byId.set(item.id, { ...(byId.get(item.id) || {}), ...item }));
  return Array.from(byId.values()).sort((a,b) => String(a.category).localeCompare(String(b.category)) || String(a.title).localeCompare(String(b.title)));
}

function getCustomTankKnowledgeItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REEF_TANK_KB_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeKnowledgeItem) : [];
  } catch(e) { return []; }
}

function setCustomTankKnowledgeItems(items) {
  try { localStorage.setItem(REEF_TANK_KB_KEY, JSON.stringify((items || []).map(normalizeKnowledgeItem))); return true; }
  catch(e) { console.error('Could not save tank knowledge base', e); return false; }
}

function saveKnowledgeItem() {
  const titleEl = document.getElementById('kb-title');
  const noteEl = document.getElementById('kb-note');
  const catEl = document.getElementById('kb-category');
  const title = String(titleEl?.value || '').trim();
  const note = String(noteEl?.value || '').trim();
  const category = String(catEl?.value || 'General').trim() || 'General';
  if (!title || !note) return showToast('⚠️ Add a title and note');
  const items = getCustomTankKnowledgeItems();
  items.unshift(normalizeKnowledgeItem({ title, note, category, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), locked:false }));
  if (!setCustomTankKnowledgeItems(items)) return showToast('⚠️ Could not save knowledge note');
  if (titleEl) titleEl.value = '';
  if (noteEl) noteEl.value = '';
  if (catEl) catEl.value = 'General';
  renderTankKnowledgeBase();
  showToast('✅ Saved to tank knowledge base');
}

function deleteKnowledgeItem(id) {
  const defaults = new Set(defaultTankKnowledgeItems().map(i => i.id));
  if (defaults.has(id)) return showToast('Core memory stays active');
  const next = getCustomTankKnowledgeItems().filter(item => item.id !== id);
  setCustomTankKnowledgeItems(next);
  renderTankKnowledgeBase();
  showToast('Knowledge note deleted');
}

function renderTankKnowledgeBase() {
  const list = document.getElementById('kb-list');
  if (!list) return;
  const items = getTankKnowledgeItems();
  list.innerHTML = items.map(item => {
    const date = memoryLineDate({ isoDate:item.updatedAt || item.createdAt });
    return `<div class="kb-item">
      <div class="kb-meta"><span>${escapeHtml(item.category)}</span><span>${escapeHtml(date)}</span></div>
      <div class="kb-title">${escapeHtml(item.title)}</div>
      <div class="kb-note">${escapeHtml(item.note)}</div>
      ${item.locked ? '<div class="kb-pill">core memory</div>' : `<button class="kb-delete" type="button" onclick="deleteKnowledgeItem('${escapeHtml(item.id)}')">Delete</button>`}
    </div>`;
  }).join('');
}

function getTankKnowledgeMemoryLines() {
  return getTankKnowledgeItems().map(item => compactMemoryLine(`${item.category}: ${item.title} — ${item.note}`, 320));
}

function applyAustralianStripyResolvedSideEffects() {
  setResolvedIssue('australianStripyRehomed', { note: 'User reported finding a new home for the Australian Stripy fish.' });

  const hiddenStatic = new Set(getHiddenStaticReminders());
  ['feed-australians-in-sump', 'post-australians-for-rehoming'].forEach(id => {
    hiddenStatic.add(id);
    removeCompletedHistoryFor(id, 'Built-in Reminder');
  });
  setHiddenStaticReminders(Array.from(hiddenStatic));

  const schedule = getTaskSchedule();
  delete schedule[staticTaskKey('feed-australians-in-sump')];
  delete schedule[staticTaskKey('post-australians-for-rehoming')];
  setTaskSchedule(schedule);

  const hiddenPlan = new Set(getHiddenPlanTasks());
  getCurrentDaysOffPlan().days.forEach(day => {
    day.tasks.forEach((task, idx) => {
      if (isAustralianStripyText(`${day.title} ${task}`)) hiddenPlan.add(`d${day.day}-t${idx}`);
    });
  });
  setHiddenPlanTasks(Array.from(hiddenPlan));

  const actions = getActionEntries();
  const alreadyLogged = actions.some(a => isAustralianStripyText(`${a.title} ${a.notes}`) && /new home|rehomed|rehome/i.test(`${a.title} ${a.notes}`));
  if (!alreadyLogged) {
    actions.unshift({
      id: 'action-' + Date.now(),
      date: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
      isoDate: new Date().toISOString(),
      category: 'Livestock',
      title: 'Australian Stripy fish rehomed',
      notes: 'Recorded from Ask AI conversation: user found a new home, so rehoming/feeding coverage tasks should be removed from future plans.'
    });
    try { localStorage.setItem('reef_actions', JSON.stringify(actions.slice(0, 80))); } catch(e) {}
  }

  renderActionHistory();
  renderReminderCenter();
  renderDaysOffWorkPlan();
  renderCompletedHistory();
  initStaticReminderChecks();
}

function applyChaetoReactorCancelledSideEffects() {
  setResolvedIssue('chaetoReactorCancelled', { note: 'User said they are no longer going to add a chaeto reactor.' });

  const hiddenStatic = new Set(getHiddenStaticReminders());
  ['start-chaeto-reactor', 'harvest-chaeto-remove-half'].forEach(id => {
    hiddenStatic.add(id);
    removeCompletedHistoryFor(id, 'Built-in Reminder');
  });
  setHiddenStaticReminders(Array.from(hiddenStatic));

  const schedule = getTaskSchedule();
  delete schedule[staticTaskKey('start-chaeto-reactor')];
  delete schedule[staticTaskKey('harvest-chaeto-remove-half')];
  Object.keys(schedule).forEach(key => {
    const task = getTaskRecordByKey(key);
    if (task && isChaetoText(`${task.title} ${task.detail || ''}`)) delete schedule[key];
  });
  setTaskSchedule(schedule);

  const hiddenPlan = new Set(getHiddenPlanTasks());
  getCurrentDaysOffPlan().days.forEach(day => {
    day.tasks.forEach((task, idx) => {
      if (isChaetoText(`${day.title} ${task}`)) hiddenPlan.add(`d${day.day}-t${idx}`);
    });
  });
  setHiddenPlanTasks(Array.from(hiddenPlan));

  const actions = getActionEntries();
  const alreadyLogged = actions.some(a => isChaetoText(`${a.title} ${a.notes}`) && /cancel|no longer|not going|removed/i.test(`${a.title} ${a.notes}`));
  if (!alreadyLogged) {
    actions.unshift({
      id: 'action-' + Date.now(),
      date: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
      isoDate: new Date().toISOString(),
      category: 'Equipment',
      title: 'Chaeto reactor plan cancelled',
      notes: 'Recorded from user direction: no chaeto reactor setup, harvest, refugium, or macroalgae planning unless the user reverses this later.'
    });
    try { localStorage.setItem('reef_actions', JSON.stringify(actions.slice(0, 80))); } catch(e) {}
  }

  renderActionHistory();
  renderReminderCenter();
  renderDaysOffWorkPlan();
  renderCompletedHistory();
  initStaticReminderChecks();
}

function autoCaptureTankUpdateFromChat(text) {
  const normalized = normalizeManagementText(text);
  const mentionsAustralian = /(australian|australians|stripy|stripies|stripey)/.test(normalized);
  const resolvedWords = /(found|got|have|has|new home|rehomed|rehoming complete|gone|removed|adopted|picked up|took them|took it)/.test(normalized);
  const negated = /(need|still need|looking|find a new home|looking for|should i|can i|maybe|might)/.test(normalized);
  if (mentionsAustralian && resolvedWords && !negated) {
    applyAustralianStripyResolvedSideEffects();
    return { key: 'australianStripyRehomed', label: 'Australian Stripy rehoming marked resolved' };
  }
  const mentionsChaeto = /(chaeto|cheato|cheeto|refugium|macroalgae|macro algae)/.test(normalized);
  const cancelledChaeto = /(no longer|not going|cancel|cancelled|canceled|remove|removed|forget|dont|do not|won't|wont)/.test(normalized);
  if (mentionsChaeto && cancelledChaeto) {
    applyChaetoReactorCancelledSideEffects();
    return { key: 'chaetoReactorCancelled', label: 'Chaeto reactor plan marked cancelled' };
  }
  return null;
}

function deleteStaticReminderFromCenter(id) {
  if (!id) return;
  const schedule = getTaskSchedule();
  delete schedule[staticTaskKey(id)];
  setTaskSchedule(schedule);
  const hidden = new Set(getHiddenStaticReminders());
  hidden.add(id);
  setHiddenStaticReminders(Array.from(hidden));

  const states = getStaticReminderStates();
  if (states[id]) {
    delete states[id];
    setStaticReminderStates(states);
  }
  removeCompletedHistoryFor(id, 'Built-in Reminder');
  renderReminderCenter();
  initStaticReminderChecks();
  renderCompletedHistory();
  showToast('🗑️ Reminder deleted');
}

function deletePlanTaskFromReminders(blockKey, taskId) {
  if (!taskId) return;
  const hiddenPlan = new Set(getHiddenPlanTasks());
  hiddenPlan.add(taskId);
  setHiddenPlanTasks(Array.from(hiddenPlan));

  const states = getDaysOffPlanStates();
  Object.keys(states || {}).forEach(key => {
    if (states[key] && Object.prototype.hasOwnProperty.call(states[key], taskId)) {
      delete states[key][taskId];
    }
  });
  setDaysOffPlanStates(states);
  removeCompletedHistoryFor(`${blockKey}-${taskId}`, 'Days-Off Work Plan');
  removeCompletedHistoryForPlanTaskIds([taskId]);
  renderDaysOffWorkPlan();
  renderReminderCenter();
  renderCompletedHistory();
  showToast('🗑️ Plan task deleted');
}

function migrateStaticReminderStates(rawStates) {
  const migrated = {};
  Object.entries(rawStates || {}).forEach(([id, value]) => {
    if (typeof value === 'boolean') {
      migrated[id] = { completed: value, completedAt: value ? new Date().toISOString() : null, nextDueAt: null };
    } else if (value && typeof value === 'object') {
      migrated[id] = value;
    }
  });
  return migrated;
}

function normalizeStaticReminderStates(states = getStaticReminderStates()) {
  const now = new Date();
  let changed = false;
  const next = migrateStaticReminderStates(states);
  Object.entries(next).forEach(([id, state]) => {
    if (!state || !state.completed) return;
    const rule = STATIC_REMINDER_RULES[id];
    if (!rule || !rule.repeatDays) return;

    if (!state.nextDueAt && state.completedAt) {
      state.nextDueAt = addReminderDays(rule.repeatDays, new Date(state.completedAt)).toISOString();
      changed = true;
    }

    if (state.nextDueAt && new Date(state.nextDueAt).getTime() <= now.getTime()) {
      next[id] = { completed: false, completedAt: null, nextDueAt: null };
      changed = true;
    }
  });
  if (changed) setStaticReminderStates(next);
  return next;
}

function getStaticReminderStates() {
  try { return normalizeStaticReminderStates(JSON.parse(localStorage.getItem('reef_static_reminder_states') || '{}')); } catch(e) { return {}; }
}

function setStaticReminderStates(states) {
  try { localStorage.setItem('reef_static_reminder_states', JSON.stringify(states)); } catch(e) {}
}

function normalizeReminderId(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || ('reminder-' + Math.random().toString(36).slice(2));
}

function getStaticReminderTitle(el) {
  const titleEl = el.querySelector('.reminder-title') || el.querySelector('.reminder-text');
  return titleEl ? titleEl.textContent.trim() : el.textContent.trim();
}

function getStaticReminderStateById(id) {
  const states = getStaticReminderStates();
  const state = states[id];
  return state && typeof state === 'object' ? state : { completed: Boolean(state), completedAt: null, nextDueAt: null };
}

function applyStaticReminderState(el, stateOrCompleted) {
  const id = el.getAttribute('data-static-reminder-id');
  const state = typeof stateOrCompleted === 'object' ? stateOrCompleted : { completed: Boolean(stateOrCompleted) };
  const completed = Boolean(state.completed);
  const btn = el.querySelector('.static-reminder-check');
  const dueText = state.nextDueAt ? formatDueDate(state.nextDueAt) : '';

  el.classList.toggle('completed', completed);
  if (btn) {
    btn.classList.toggle('checked', completed);
    btn.textContent = completed ? '✓' : '';
    btn.setAttribute('aria-label', completed ? 'Restore reminder' : 'Check off reminder');
  }

  const badge = el.querySelector('.reminder-badge, .reminder-when');
  if (badge) {
    if (!badge.dataset.originalText) badge.dataset.originalText = badge.textContent;
    if (completed && dueText && STATIC_REMINDER_RULES[id]) {
      badge.textContent = `Due ${dueText}`;
      badge.classList.remove('rb-urgent', 'reminder-urgent');
      badge.classList.add('rb-ok');
    } else if (!completed) {
      badge.textContent = badge.dataset.originalText;
      if (badge.dataset.originalClass) badge.className = badge.dataset.originalClass;
    }
  }

  let note = el.querySelector('.static-reminder-next-due');
  if (completed && dueText && STATIC_REMINDER_RULES[id]) {
    if (!note) {
      note = document.createElement('div');
      note.className = 'reminder-next-due static-reminder-next-due';
      const info = el.querySelector('.reminder-info') || el;
      info.appendChild(note);
    }
    note.textContent = `Checked off. It will come back ${dueText}.`;
  } else if (note) {
    note.remove();
  }
}

function toggleStaticReminder(id) {
  const states = getStaticReminderStates();
  const current = getStaticReminderStateById(id);
  const completed = !current.completed;
  const now = new Date();
  const rule = STATIC_REMINDER_RULES[id];

  states[id] = {
    completed,
    completedAt: completed ? now.toISOString() : null,
    nextDueAt: completed && rule && rule.repeatDays ? addReminderDays(rule.repeatDays, now).toISOString() : null
  };

  setStaticReminderStates(states);
  const firstReminderEl = document.querySelector(`[data-static-reminder-id="${CSS.escape(id)}"]`);
  const title = firstReminderEl ? getStaticReminderTitle(firstReminderEl) : id.replace(/-/g, ' ');
  if (states[id].completed) {
    const ruleLabel = rule && rule.label ? `Repeats ${rule.label}` : '';
    recordCompletedHistory({
      type: 'reminder',
      source: 'Built-in Reminder',
      sourceId: id,
      title,
      notes: ruleLabel,
      completedAt: states[id].completedAt,
      nextDueAt: states[id].nextDueAt
    });
  } else {
    removeCompletedHistoryFor(id, 'Built-in Reminder');
  }
  document.querySelectorAll(`[data-static-reminder-id="${CSS.escape(id)}"]`).forEach(el => applyStaticReminderState(el, states[id]));
  renderReminderCenter();

  if (states[id].completed && states[id].nextDueAt) {
    showToast(`✅ Checked off until ${formatDueDate(states[id].nextDueAt)}`);
  } else {
    showToast(states[id].completed ? '✅ Reminder checked off' : '↩️ Reminder restored');
  }
}

function initStaticReminderChecks() {
  const states = getStaticReminderStates();
  const staticReminders = document.querySelectorAll('.reminder-item, #page-reminders .reminder-card-item:not(.saved-reminder-dynamic)');

  staticReminders.forEach(el => {
    if (el.closest('#saved-ai-reminders')) return;

    const title = getStaticReminderTitle(el);
    const id = normalizeReminderId(title);
    el.setAttribute('data-static-reminder-id', id);
    if (getHiddenStaticReminders().includes(id)) {
      el.style.display = 'none';
      return;
    } else {
      el.style.display = '';
    }

    const badge = el.querySelector('.reminder-badge, .reminder-when');
    if (badge && !badge.dataset.originalClass) badge.dataset.originalClass = badge.className;

    let btn = el.querySelector('.static-reminder-check');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'static-reminder-check';
      btn.addEventListener('click', () => toggleStaticReminder(id));
      el.insertBefore(btn, el.firstChild);
    }

    const rule = STATIC_REMINDER_RULES[id];
    const detailEl = el.querySelector('.reminder-detail');
    if (rule && detailEl && !detailEl.querySelector('.static-repeat-note')) {
      detailEl.insertAdjacentHTML('beforeend', `<div class="reminder-repeats-note static-repeat-note">Repeats ${escapeHtml(rule.label)} after you check it off.</div>`);
    }

    applyStaticReminderState(el, getStaticReminderStateById(id));
  });
}

// ── A-watch days-off rotation ───────────────────────────────────────────────
const DAYS_OFF_ANCHOR = '2026-05-13'; // Jorge's first day off in this app version.
const DAYS_OFF_LENGTH = 7;
const WORK_BLOCK_LENGTH = 7;
const ROTATION_LENGTH = DAYS_OFF_LENGTH + WORK_BLOCK_LENGTH;

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((startOfLocalDay(end) - startOfLocalDay(start)) / msPerDay);
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDaysOffInfo(today = new Date()) {
  const anchor = parseLocalDate(DAYS_OFF_ANCHOR);
  const diff = daysBetween(anchor, today);
  const normalized = ((diff % ROTATION_LENGTH) + ROTATION_LENGTH) % ROTATION_LENGTH;

  let currentStart;
  let nextStart;
  let isOff;

  if (diff < 0) {
    currentStart = anchor;
    nextStart = anchor;
    isOff = false;
  } else if (normalized < DAYS_OFF_LENGTH) {
    currentStart = addDays(anchor, diff - normalized);
    nextStart = currentStart;
    isOff = true;
  } else {
    const currentCycleStart = addDays(anchor, diff - normalized);
    nextStart = addDays(currentCycleStart, ROTATION_LENGTH);
    currentStart = nextStart;
    isOff = false;
  }

  const blockEnd = addDays(nextStart, DAYS_OFF_LENGTH - 1);
  const daysUntil = Math.max(0, daysBetween(today, nextStart));

  return { isOff, nextStart, blockEnd, daysUntil };
}

function updateDaysOffDisplay() {
  const info = getDaysOffInfo();
  const range = `${formatShortDate(info.nextStart)}–${formatShortDate(info.blockEnd)}`;
  const label = info.isOff ? `Now · ${range}` : `${formatShortDate(info.nextStart)}`;
  const summary = document.getElementById('days-off-summary');

  if (summary) {
    summary.innerHTML = info.isOff
      ? `You are currently in your days-off block: ${range}.<small>Based on A-watch: 7 nights on / 7 days off, anchored to May 13, 2026.</small>`
      : `Next days-off block starts ${formatShortDate(info.nextStart)} and runs ${range}.<small>${info.daysUntil} day${info.daysUntil === 1 ? '' : 's'} away · based on A-watch 7 on / 7 off.</small>`;
  }

  document.querySelectorAll('.days-off-label').forEach(el => { el.textContent = label; });
  document.querySelectorAll('.days-off-badge').forEach(el => { el.textContent = info.isOff ? 'NOW' : formatShortDate(info.nextStart).toUpperCase(); });
  renderDaysOffWorkPlan();
}



// ── Tank status summary ─────────────────────────────────────────────────────
function getLatestLogForStatus() {
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem('reef_logs') || '[]'); } catch(e) {}
  const all = [...getDefaultLogs(), ...logs].filter(Boolean).sort((a, b) => {
    const da = new Date(a.isoDate || a.date || 0).getTime();
    const db = new Date(b.isoDate || b.date || 0).getTime();
    return db - da;
  });
  return all[0] || null;
}

function classifyStatusValue(key, raw) {
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  if (key === 'po4') return v > 0.50 ? 'critical' : v > 0.10 ? 'warn' : 'good';
  if (key === 'alk') return v > 11 || v < 7.8 ? 'critical' : v > 9.5 || v < 8.2 ? 'warn' : 'good';
  if (key === 'no3') return v > 25 ? 'critical' : v > 10 ? 'warn' : 'good';
  if (key === 'ca') return v > 470 || v < 380 ? 'warn' : 'good';
  if (key === 'mg') return v > 1450 || v < 1250 ? 'warn' : 'good';
  if (key === 'ph') return v < 8.0 || v > 8.7 ? 'critical' : v < 8.2 ? 'warn' : 'good';
  if (key === 'sal') return v < 1.024 || v > 1.027 ? 'warn' : 'good';
  return 'good';
}

function getTrendDelta(key) {
  const points = getAllLogsForCharts()
    .map(log => parseFloat(log[key]))
    .filter(v => Number.isFinite(v));
  if (points.length < 2) return null;
  return points[points.length - 1] - points[points.length - 2];
}

function renderTankStatus() {
  const container = document.getElementById('tank-status-content');
  if (!container) return;
  const latest = getLatestLogForStatus();
  if (!latest) {
    container.innerHTML = '<div class="tank-status-text">Log your first readings and Reef Keeper will summarize the tank status here.</div>';
    return;
  }

  const po4 = parseFloat(latest.po4);
  const alk = parseFloat(latest.alk);
  const ca = parseFloat(latest.ca);
  const no3 = parseFloat(latest.no3);
  const mg = parseFloat(latest.mg);
  const po4Delta = getTrendDelta('po4');
  const alkDelta = getTrendDelta('alk');

  const states = [
    classifyStatusValue('po4', latest.po4),
    classifyStatusValue('alk', latest.alk),
    classifyStatusValue('no3', latest.no3),
    classifyStatusValue('ca', latest.ca),
    classifyStatusValue('mg', latest.mg),
    classifyStatusValue('ph', latest.ph),
    classifyStatusValue('sal', latest.sal)
  ].filter(Boolean);

  let level = states.includes('critical') ? 'critical' : states.includes('warn') ? 'recovery' : 'good';
  let badge = level === 'critical' ? 'High Priority' : level === 'recovery' ? 'Recovery Mode' : 'Stable';
  const activeMode = getTankMode();
  if (activeMode && activeMode !== 'recovery') badge = activeMode.charAt(0).toUpperCase() + activeMode.slice(1);
  let concern = 'No major concern from the latest logged values. Keep logging and avoid sudden changes.';
  let dont = 'Do not make multiple major changes on the same day.';
  let next = 'Keep the regular testing rhythm and record any maintenance actions.';

  if (Number.isFinite(po4) && po4 > 0.10) {
    concern = `Phosphate is still elevated at ${po4} ppm${po4Delta !== null ? (po4Delta < 0 ? ', but it is trending down.' : ', and it is not trending down yet.') : '.'}`;
    dont = 'Do not increase GFO aggressively or chase phosphate too fast.';
    next = 'Retest phosphate and alkalinity in 3–5 days before changing the removal plan.';
  }
  if (Number.isFinite(alk) && (alk > 9.5 || alk < 8.2) && (!Number.isFinite(po4) || po4 <= 0.10)) {
    concern = `Alkalinity is ${alk} dKH${alkDelta !== null ? ` (${alkDelta > 0 ? 'up' : 'down'} ${Math.abs(alkDelta).toFixed(1)} since the last logged reading).` : '.'}`;
    dont = 'Do not dose kalk or make aggressive nutrient changes while alkalinity is moving.';
    next = 'Prioritize alkalinity stability; confirm with another test before changing dosing or media.';
  } else if (Number.isFinite(alk) && (alk > 9.5 || alk < 8.2)) {
    dont = 'Do not dose kalk or make aggressive nutrient changes while alkalinity is outside the target window.';
  }
  if (Number.isFinite(ca) && ca > 450) {
    dont = 'Do not dose kalk yet. Calcium is still above the normal target range.';
  }
  if (Number.isFinite(no3) && no3 > 20 && (!Number.isFinite(po4) || po4 <= 0.10)) {
    concern = `Nitrate is elevated at ${no3} ppm. Lower it gradually; avoid stripping nutrients suddenly.`;
    next = 'Use water changes, export, and feeding review rather than a sudden large correction.';
  }
  if (Number.isFinite(mg) && (mg < 1250 || mg > 1450)) {
    concern = `Magnesium is ${mg} mg/L, outside the usual working range. Recheck before dosing.`;
  }

  const pills = [
    latest.po4 ? { label: `PO₄ ${latest.po4}`, state: classifyStatusValue('po4', latest.po4) } : null,
    latest.alk ? { label: `Alk ${latest.alk}`, state: classifyStatusValue('alk', latest.alk) } : null,
    latest.no3 ? { label: `NO₃ ${latest.no3}`, state: classifyStatusValue('no3', latest.no3) } : null,
    latest.ca ? { label: `Ca ${latest.ca}`, state: classifyStatusValue('ca', latest.ca) } : null,
    latest.mg ? { label: `Mg ${latest.mg}`, state: classifyStatusValue('mg', latest.mg) } : null,
    latest.ph ? { label: `pH ${latest.ph}`, state: classifyStatusValue('ph', latest.ph) } : null,
    latest.sal ? { label: `SG ${latest.sal}`, state: classifyStatusValue('sal', latest.sal) } : null,
  ].filter(Boolean);

  container.innerHTML = `
    <div class="tank-status-head">
      <div>
        <div class="tank-status-title">${escapeHtml(level === 'good' ? 'Looking steady' : level === 'critical' ? 'Needs attention' : 'Improving, but go slow')}</div>
        <div class="tank-status-subtitle">Latest log: ${escapeHtml(latest.date || 'recent reading')}</div>
      </div>
      <div class="tank-status-badge ${level}">${escapeHtml(badge)}</div>
    </div>
    <div class="tank-status-grid">
      <div class="tank-status-row"><div class="tank-status-label">Main concern</div><div class="tank-status-text">${escapeHtml(concern)}</div></div>
      <div class="tank-status-row"><div class="tank-status-label">Do not</div><div class="tank-status-text">${escapeHtml(dont)}</div></div>
      <div class="tank-status-row"><div class="tank-status-label">Next best action</div><div class="tank-status-text">${escapeHtml(next)}</div></div>
    </div>
    <div class="tank-status-metric-line">
      ${pills.map(p => `<span class="tank-mini-pill ${p.state}">${escapeHtml(p.label)}</span>`).join('')}
    </div>
  `;
}

// ── Days-off work plan ──────────────────────────────────────────────────────
const DAYS_OFF_PLAN_TEMPLATE = [
  { day: 1, title: 'Test and inspect', tasks: ['Test phosphate, alkalinity, nitrate, calcium, magnesium, pH, and salinity.', 'Inspect Duncan, hammers, mushrooms, BTAs, and visible aiptasia before making changes.'] },
  { day: 2, title: 'Water-change day', tasks: ['Do the planned 20 gallon Fritz RPM water change if saltwater is mixed and matched.', 'Record salinity, temperature, and any coral reaction in Action History.'] },
  { day: 3, title: 'Aiptasia control', tasks: ['Treat a small section with Aiptasia-X at lights-out rather than the whole tank at once.', 'Run/confirm carbon and watch nearby corals the next day.'] },
  { day: 4, title: 'Export and equipment', tasks: ['Check GFO/carbon flow and avoid increasing phosphate removal too aggressively.', 'Inspect skimmer, UV, return pumps, and filter roller for normal operation.'] },
  { day: 5, title: 'Livestock and feeding', tasks: ['Target-feed wrasses if tangs dominate the auto feeder.', 'Observe livestock behavior and note any aggression, appetite changes, or coral irritation.'] },
  { day: 6, title: 'Retest checkpoint', tasks: ['Retest phosphate and alkalinity after the earlier work.', 'If alkalinity moved more than about 0.5 dKH, avoid adding another major change.'] },
  { day: 7, title: 'Prepare for work block', tasks: ['Fill/check ATO reservoir, food, test kits, towels, and saltwater supplies.', 'Review reminders for anything that cannot wait until the next days-off block.'] }
];

function getPlanBlockKey() {
  const info = getDaysOffInfo();
  return info.nextStart.toISOString().slice(0, 10);
}

function getAiDaysOffPlans() {
  try { return JSON.parse(localStorage.getItem('reef_ai_days_off_plans') || '{}'); } catch(e) { return {}; }
}

function setAiDaysOffPlans(plans) {
  try { localStorage.setItem('reef_ai_days_off_plans', JSON.stringify(plans || {})); } catch(e) {}
}

function normalizeDaysOffPlan(plan) {
  if (!plan || !Array.isArray(plan.days)) return null;
  const days = plan.days.slice(0, 7).map((day, idx) => {
    const dayNum = Number(day.day) || idx + 1;
    return {
      day: Math.max(1, Math.min(7, dayNum)),
      title: String(day.title || DAYS_OFF_PLAN_TEMPLATE[idx]?.title || `Day ${idx + 1}`).slice(0, 70),
      tasks: Array.isArray(day.tasks)
        ? day.tasks.map(t => String(t || '').trim()).filter(Boolean).filter(t => !shouldFilterResolvedPlanTask(t)).slice(0, 8)
        : []
    };
  }).filter(day => day.tasks.length);

  if (!days.length) return null;
  return {
    summary: String(plan.summary || 'AI-generated plan for this days-off block.').slice(0, 260),
    generatedAt: plan.generatedAt || new Date().toISOString(),
    days
  };
}

function getCurrentDaysOffPlan() {
  const blockKey = getPlanBlockKey();
  const plans = getAiDaysOffPlans();
  const aiPlan = normalizeDaysOffPlan(plans[blockKey]);
  if (aiPlan) return aiPlan;
  const templateDays = DAYS_OFF_PLAN_TEMPLATE.map(day => ({
    ...day,
    tasks: day.tasks.filter(task => !shouldFilterResolvedPlanTask(`${day.title} ${task}`))
  })).filter(day => day.tasks.length);
  return { summary: '', generatedAt: null, days: templateDays, isTemplate: true };
}

function saveAiDaysOffPlanForCurrentBlock(plan) {
  const blockKey = getPlanBlockKey();
  const plans = getAiDaysOffPlans();
  plans[blockKey] = normalizeDaysOffPlan({ ...plan, generatedAt: plan.generatedAt || new Date().toISOString() });
  setAiDaysOffPlans(plans);
}

function saveEditableDaysOffPlanForCurrentBlock(plan, summaryText) {
  const blockKey = getPlanBlockKey();
  const plans = getAiDaysOffPlans();
  const normalized = normalizeDaysOffPlan({
    summary: summaryText || plan.summary || 'Custom edited plan for this days-off block.',
    generatedAt: plan.generatedAt || new Date().toISOString(),
    days: plan.days
  });
  if (!normalized) return false;
  plans[blockKey] = normalized;
  setAiDaysOffPlans(plans);
  return true;
}

function useTemplateDaysOffPlan() {
  const blockKey = getPlanBlockKey();
  const plans = getAiDaysOffPlans();
  delete plans[blockKey];
  setAiDaysOffPlans(plans);
  const states = getDaysOffPlanStates();
  if (states[blockKey]) delete states[blockKey];
  setDaysOffPlanStates(states);
  renderDaysOffWorkPlan();
  renderReminderCenter();
  showToast('Template plan restored');
}

function getDaysOffPlanStates() {
  try { return JSON.parse(localStorage.getItem('reef_days_off_plan_states') || '{}'); } catch(e) { return {}; }
}

function setDaysOffPlanStates(states) {
  try { localStorage.setItem('reef_days_off_plan_states', JSON.stringify(states)); } catch(e) {}
}

function isPlanTaskDone(blockKey, taskId) {
  const states = getDaysOffPlanStates();
  return Boolean(states[blockKey] && states[blockKey][taskId]);
}

function getPlanTaskMeta(taskId) {
  const match = String(taskId || '').match(/^d(\d+)-t(\d+)$/);
  if (!match) return null;
  const day = getCurrentDaysOffPlan().days.find(d => d.day === Number(match[1]));
  if (!day) return null;
  const task = day.tasks[Number(match[2])];
  if (!task) return null;
  return { day: day.day, dayTitle: day.title, task };
}

function getAllActiveReefTasksForPlanning() {
  const hidden = new Set(getHiddenStaticReminders());
  const staticTasks = STATIC_REMINDER_LIBRARY
    .filter(r => !hidden.has(r.id) && !getStaticReminderStateById(r.id).completed && !shouldFilterResolvedPlanTask(`${r.title} ${r.detail}`))
    .map(r => ({ id: staticTaskKey(r.id), title: r.title, detail: r.detail, scheduledDay: getScheduledDayForTask(staticTaskKey(r.id)) }));
  const savedTasks = normalizeSavedReminderRecurrences()
    .filter(r => !r.completed && !shouldFilterResolvedPlanTask(`${r.title} ${r.notes} ${r.when} ${r.repeat}`))
    .map(r => ({ id: savedTaskKey(r.id), title: r.title, detail: [r.when || '', r.repeat || '', r.notes || ''].filter(Boolean).join(' · '), scheduledDay: getScheduledDayForTask(savedTaskKey(r.id)) }));
  return [...staticTasks, ...savedTasks].slice(0, 30);
}

function getCurrentPlanPromptContext() {
  const latest = getLatestLogForStatus();
  const info = getDaysOffInfo();
  const range = `${formatShortDate(info.nextStart)}–${formatShortDate(info.blockEnd)}`;
  const currentPlan = getCurrentDaysOffPlan();
  return {
    blockStart: info.nextStart.toISOString().slice(0, 10),
    blockEnd: info.blockEnd.toISOString().slice(0, 10),
    range,
    isCurrentlyOff: info.isOff,
    latestLog: latest || null,
    localMemory: getLocalTankMemorySummary('days off work plan'),
    resolvedIssues: getResolvedIssues(),
    currentPlan: currentPlan.isTemplate ? null : currentPlan,
    activeReefTasks: getAllActiveReefTasksForPlanning()
  };
}

function updateAiPlanButtonLabel(plan) {
  const btn = document.getElementById('ai-plan-btn');
  if (!btn) return;
  const currentPlan = plan || getCurrentDaysOffPlan();
  btn.textContent = currentPlan.isTemplate ? '✨ Generate AI Plan' : '🔄 Regenerate AI Plan';
  btn.setAttribute('aria-label', currentPlan.isTemplate ? 'Generate AI days-off plan' : 'Regenerate AI days-off plan');
}

function handleAiPlanButton() {
  const plan = getCurrentDaysOffPlan();
  generateAiDaysOffPlan(!plan.isTemplate);
}

async function generateAiDaysOffPlan(forceRegenerate) {
  const btn = document.getElementById('ai-plan-btn');
  const status = document.getElementById('days-off-plan-status');
  if (btn) btn.disabled = true;
  if (status) status.innerHTML = '<div class="plan-status-note"><span class="spinner"></span>Building a custom days-off plan from your latest logs, reminders, and recovery goals...</div>';

  try {
    const selectedSystem = getUseTankContext() ? `${TANK_CONTEXT}${getLocalTankMemorySummary('days off work plan')}` : GENERAL_REEF_CONTEXT;
    const response = await fetch(PLAN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: selectedSystem,
        modelMode: getModelMode(),
        forceRegenerate: Boolean(forceRegenerate),
        planContext: getCurrentPlanPromptContext()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Backend error ${response.status}`);
    const normalized = normalizeDaysOffPlan(data.plan);
    if (!normalized) throw new Error('AI did not return a usable plan.');
    saveAiDaysOffPlanForCurrentBlock(normalized);

    const blockKey = getPlanBlockKey();
    const states = getDaysOffPlanStates();
    states[blockKey] = {};
    setDaysOffPlanStates(states);

    renderDaysOffWorkPlan();
    renderReminderCenter();
    showToast('✅ AI days-off plan saved');
  } catch(e) {
    console.error(e);
    if (status) status.innerHTML = `<div class="plan-status-note">⚠️ Could not generate the AI plan. ${escapeHtml(e.message || 'Try again later.')}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function togglePlanTask(blockKey, taskId) {
  const states = getDaysOffPlanStates();
  if (!states[blockKey]) states[blockKey] = {};
  const completed = !states[blockKey][taskId];
  states[blockKey][taskId] = completed;
  setDaysOffPlanStates(states);
  if (completed) {
    const meta = getPlanTaskMeta(taskId);
    recordCompletedHistory({
      type: 'days-off',
      source: 'Days-Off Work Plan',
      sourceId: `${blockKey}-${taskId}`,
      title: meta ? `Day ${meta.day}: ${meta.dayTitle}` : 'Days-off task',
      notes: meta ? meta.task : '',
      completedAt: new Date().toISOString(),
      blockKey
    });
  } else {
    removeCompletedHistoryFor(`${blockKey}-${taskId}`, 'Days-Off Work Plan');
  }
  renderDaysOffWorkPlan();
  renderReminderCenter();
}

let draggedPlanTask = null;

function copyCurrentPlanForEditing() {
  const plan = getCurrentDaysOffPlan();
  return {
    summary: plan.isTemplate ? 'Custom edited plan for this days-off block.' : plan.summary,
    generatedAt: plan.generatedAt || new Date().toISOString(),
    days: plan.days.map(day => ({
      day: day.day,
      title: day.title,
      tasks: [...day.tasks]
    }))
  };
}

function movePlanTask(blockKey, fromTaskId, toDay) {
  toDay = Number(toDay);
  if (!toDay || toDay < 1 || toDay > 7) return;

  const match = String(fromTaskId || '').match(/^d(\d+)-t(\d+)$/);
  if (!match) return;
  const fromDay = Number(match[1]);
  const fromIndex = Number(match[2]);
  if (fromDay === toDay) return;

  const editablePlan = copyCurrentPlanForEditing();
  const sourceDay = editablePlan.days.find(d => d.day === fromDay);
  let targetDay = editablePlan.days.find(d => d.day === toDay);
  if (!sourceDay || !sourceDay.tasks[fromIndex]) return;

  if (!targetDay) {
    const templateDay = DAYS_OFF_PLAN_TEMPLATE.find(d => d.day === toDay);
    targetDay = { day: toDay, title: templateDay ? templateDay.title : `Day ${toDay}`, tasks: [] };
    editablePlan.days.push(targetDay);
    editablePlan.days.sort((a, b) => a.day - b.day);
  }

  const [task] = sourceDay.tasks.splice(fromIndex, 1);
  targetDay.tasks.push(task);
  editablePlan.days = editablePlan.days.filter(d => d.tasks.length > 0).sort((a, b) => a.day - b.day);

  const states = getDaysOffPlanStates();
  const wasDone = Boolean(states[blockKey] && states[blockKey][fromTaskId]);
  if (states[blockKey]) {
    delete states[blockKey][fromTaskId];
  }

  const targetIndex = targetDay.tasks.length - 1;
  const newTaskId = `d${toDay}-t${targetIndex}`;
  if (wasDone) {
    if (!states[blockKey]) states[blockKey] = {};
    states[blockKey][newTaskId] = true;
    removeCompletedHistoryFor(`${blockKey}-${fromTaskId}`, 'Days-Off Work Plan');
    const metaTitle = targetDay.title;
    recordCompletedHistory({
      type: 'days-off',
      source: 'Days-Off Work Plan',
      sourceId: `${blockKey}-${newTaskId}`,
      title: `Day ${toDay}: ${metaTitle}`,
      notes: task,
      completedAt: new Date().toISOString(),
      blockKey
    });
  }
  setDaysOffPlanStates(states);

  const label = editablePlan.summary && editablePlan.summary.includes('AI-generated')
    ? editablePlan.summary + ' Edited by moving tasks between days.'
    : editablePlan.summary || 'Custom edited plan for this days-off block.';
  saveEditableDaysOffPlanForCurrentBlock(editablePlan, label.slice(0, 260));
  renderDaysOffWorkPlan();
  renderReminderCenter();
  showToast(`Moved task to Day ${toDay}`);
}

function startPlanTaskDrag(event, blockKey, taskId) {
  draggedPlanTask = { blockKey, taskId };
  event.currentTarget.classList.add('dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
  }
}

function endPlanTaskDrag(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.plan-day-card.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function allowPlanTaskDrop(event) {
  event.preventDefault();
  const card = event.currentTarget;
  if (card) card.classList.add('drag-over');
}

function leavePlanTaskDrop(event) {
  event.currentTarget.classList.remove('drag-over');
}

function dropPlanTask(event, blockKey, toDay) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const taskId = draggedPlanTask?.taskId || (event.dataTransfer && event.dataTransfer.getData('text/plain'));
  if (!taskId) return;
  movePlanTask(blockKey, taskId, toDay);
  draggedPlanTask = null;
}

function renderDaysOffWorkPlan() {
  const summary = document.getElementById('days-off-plan-summary');
  const status = document.getElementById('days-off-plan-status');
  const container = document.getElementById('days-off-plan');
  if (!summary || !container) return;

  const info = getDaysOffInfo();
  const blockKey = getPlanBlockKey();
  const range = `${formatShortDate(info.nextStart)}–${formatShortDate(info.blockEnd)}`;
  const plan = getCurrentDaysOffPlan();

  summary.innerHTML = info.isOff
    ? `This plan is for your current days-off block: ${range}.<small>${plan.isTemplate ? 'Template plan shown. Generate an AI plan to tailor it to the latest tank status.' : 'AI-generated from your current reef status and recent history.'}</small>`
    : `Next days-off work plan: ${range}.<small>${plan.isTemplate ? 'Template plan shown until you generate a custom AI plan.' : 'Custom AI plan saved for this next block.'}</small>`;

  if (status) {
    status.innerHTML = plan.isTemplate
      ? ''
      : `<div class="plan-status-note">AI plan active: ${escapeHtml(plan.summary)}<br><small>Generated ${new Date(plan.generatedAt).toLocaleString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}</small></div>`;
  }
  updateAiPlanButtonLabel(plan);

  container.innerHTML = plan.days.map(day => {
    const date = addDays(info.nextStart, day.day - 1);
    const hiddenTasks = new Set(getHiddenPlanTasks());
    const planTaskHtml = day.tasks.map((task, idx) => {
      const taskId = `d${day.day}-t${idx}`;
      if (hiddenTasks.has(taskId)) return '';
      const done = isPlanTaskDone(blockKey, taskId);
      if (done) return '';
      const moveOptions = [1,2,3,4,5,6,7].map(dayNum => `<option value="${dayNum}"${dayNum === day.day ? ' selected' : ''}>Day ${dayNum}</option>`).join('');
      return `<div class="plan-task" draggable="true" ondragstart="startPlanTaskDrag(event, '${blockKey}', '${taskId}')" ondragend="endPlanTaskDrag(event)">
        <button class="plan-task-check" onclick="togglePlanTask('${blockKey}', '${taskId}')" aria-label="Check off task"></button>
        <div class="plan-task-body">
          <div class="plan-task-text">${escapeHtml(task)}</div>
          <div class="plan-task-move-row">
            <span class="plan-task-move-label">Move to</span>
            <select class="plan-task-move-select" onchange="movePlanTask('${blockKey}', '${taskId}', this.value); this.value='${day.day}';" aria-label="Move task to another day">
              ${moveOptions}
            </select>
            <span class="plan-task-drag-hint">or drag</span>
          </div>
        </div>
        <button class="plan-task-delete" onclick="deletePlanTaskFromReminders('${blockKey}', '${taskId}')" aria-label="Delete plan task">×</button>
      </div>`;
    }).join('');

    const scheduledForDay = getScheduledTasksForDay(day.day);
    const scheduledHtml = scheduledForDay.length ? `
      <div class="plan-day-linked-label">Scheduled reef tasks</div>
      ${scheduledForDay.map(task => {
        const moveOptions = getScheduleOptions(day.day);
        return `<div class="plan-task plan-task-linked">
          <button class="plan-task-check" onclick="toggleScheduledTask('${escapeHtml(task.key)}')" aria-label="Check off scheduled task"></button>
          <div class="plan-task-body">
            <div class="plan-task-text">${escapeHtml(task.emoji)} ${escapeHtml(task.title)}</div>
            <div class="plan-task-source">From Reef Tasks</div>
            <div class="plan-task-move-row">
              <span class="plan-task-move-label">Move to</span>
              <select class="plan-task-move-select" onchange="scheduleTaskToDay('${escapeHtml(task.key)}', this.value)" aria-label="Move scheduled task">
                ${moveOptions}
              </select>
            </div>
          </div>
          <button class="plan-task-delete" onclick="deleteScheduledTask('${escapeHtml(task.key)}')" aria-label="Delete scheduled task">×</button>
        </div>`;
      }).join('')}` : '';

    const tasks = (planTaskHtml + scheduledHtml) || '<div class="plan-task plan-task-empty"><div class="plan-task-text">All tasks for this day are complete.</div></div>';
    return `<div class="plan-day-card" ondragover="allowPlanTaskDrop(event)" ondragleave="leavePlanTaskDrop(event)" ondrop="dropPlanTask(event, '${blockKey}', ${day.day})">
      <div class="plan-day-head">
        <div class="plan-day-title">Day ${day.day}: ${escapeHtml(day.title)}</div>
        <div class="plan-day-date">${formatShortDate(date)}</div>
      </div>
      ${tasks}
    </div>`;
  }).join('');
}



// ── Help overlay ─────────────────────────────────────────────────────────────
const HELP_CONTENT = {
  home: {
    title: 'Home tab help',
    html: `
      <div class="help-section"><h4>What this tab is for</h4><p>Home is the quick tank snapshot: tank mode, tank status, latest parameters, recent changes, and any compact long-term status cards.</p></div>
      <div class="help-section"><h4>Tank Mode</h4><p>Tank Mode changes how Reef Keeper thinks about the system: Recovery, Stabilizing, Maintenance, Growth, or Troubleshooting. It helps the AI avoid giving recovery-style advice forever once the tank improves.</p></div>
      <div class="help-section"><h4>Parameter cards</h4><p>These pull from your saved parameter logs. If you only log one value, the app keeps the newest available values for the other cards instead of wiping them out.</p></div>
      <div class="help-section"><h4>Recent changes</h4><p>This is a compact timeline of recent tests, actions, and completed tasks so you can quickly see what changed before making another reef decision.</p></div>`
  },
  chat: {
    title: 'Ask AI tab help',
    html: `
      <div class="help-section"><h4>What this tab is for</h4><p>Use Ask AI for reef questions, tank updates, and task-management commands. Important updates entered here can influence future plans and AI context.</p></div>
      <div class="help-section"><h4>Question ideas</h4><p>The suggestions refresh automatically when you open this tab. They use your tank context and stable mixed-reef best practices to suggest useful questions you may not have thought to ask.</p></div>
      <div class="help-section"><h4>Answer style</h4><p>The answer selector changes how the backend asks the model to respond: quick, balanced, deep reasoning, or simple explanation.</p></div>
      <div class="help-section"><h4>Tank context toggle</h4><p>When tank context is on, the AI uses your logs, reef tasks, days-off plan, livestock inventory, guardrails, and long-term memory. Turn it off for general reef advice.</p></div>`
  },
  log: {
    title: 'Log tab help',
    html: `
      <div class="help-section"><h4>Parameter logs</h4><p>Use this for test results such as phosphate, alkalinity, nitrate, calcium, magnesium, pH, and salinity. These feed charts, trends, Tank Status, and AI context.</p></div>
      <div class="help-section"><h4>Maintenance / Action History</h4><p>Use this for things you did: water changes, media changes, livestock changes, treatments, equipment work, feeding changes, or observations.</p></div>
      <div class="help-section"><h4>Completed History</h4><p>Checked-off tasks and days-off plan items are recorded here with timestamps. Restoring a task removes the matching completion record.</p></div>
      <div class="help-section"><h4>Long-Term Reef Tools</h4><p>This is where inventory, guardrails, maintenance intervals, monthly reviews, and long-term summaries live without adding more tabs.</p></div>
      <div class="help-section"><h4>Backup</h4><p>Export your backup regularly. Your app data is stored in this browser unless you later add cloud sync.</p></div>`
  },
  reminders: {
    title: 'Reef Task Planner help',
    html: `
      <div class="help-section"><h4>Main idea</h4><p>Reef Tasks are what needs doing. The Days-Off Work Plan is when those tasks should be done during your off week.</p></div>
      <div class="help-section"><h4>Auto-Balance Week</h4><p>This places active tasks into the week by estimated effort and reef-stability risk. It tries not to stack stressful work like water changes, pest treatment, and media changes on the same day.</p></div>
      <div class="help-section"><h4>Generate AI Plan</h4><p>This asks the AI to build a custom 7-day plan from your latest logs, recent actions, active tasks, tank mode, and guardrails.</p></div>
      <div class="help-section"><h4>Use Template</h4><p>This resets the block to a standard checklist. It is useful as a fallback, but it is less tailored than an AI plan.</p></div>
      <div class="help-section"><h4>Hidden / removed tasks</h4><p>Deleted or AI-removed tasks are hidden so they do not keep coming back. Use Manage Hidden Tasks to review or restore them.</p></div>`
  }
};

function openHelp(topic) {
  const item = HELP_CONTENT[topic] || HELP_CONTENT.home;
  const overlay = document.getElementById('help-overlay');
  const title = document.getElementById('help-title');
  const content = document.getElementById('help-content');
  if (!overlay || !title || !content) return;
  title.textContent = item.title;
  content.innerHTML = item.html;
  overlay.classList.add('visible');
}

function closeHelp() {
  const overlay = document.getElementById('help-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function handleHelpOverlayClick(event) {
  if (event.target && event.target.id === 'help-overlay') closeHelp();
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeHelp(); closeChatHistory(); closeLivestockCatalog(); closeLongTermTool('inventory'); closeLongTermTool('strategy'); closeLongTermTool('summary'); }
});

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Init ─────────────────────────────────────────────────────────────────────
renderQuickQuestions();
if (isAustralianStripyResolved()) applyAustralianStripyResolvedSideEffects();
if (!isChaetoReactorCancelled()) applyChaetoReactorCancelledSideEffects();
ensureDefaultAutoScheduledTasks();
renderLogHistory();
renderTrendControls();
renderTrendChart(currentTrendParam);
renderTankStatus();
renderLongTermTools();
migrateInventoryPhotosToIndexedDb();
updateHomeChips();
renderActionHistory();
renderCompletedHistory();
initModelMode();
initTankContextToggle();
renderSavedReminders();
renderReminderCenter();
renderHiddenTasksPanel();
updateDaysOffDisplay();
initStaticReminderChecks();

// Safety: keep floating scroll button out of the Ask AI input area.
try { updateGlobalScrollTopVisibility(); } catch(e) {}


// Ensure the Reef Keeper title always scrolls the current view to the top, including Ask AI.
(function ensureHeaderScrollToTop(){
  function bindHeader(){
    const header = document.querySelector('.app-header');
    if (!header || header.dataset.scrollBound === 'true') return;
    header.dataset.scrollBound = 'true';
    header.addEventListener('click', scrollActivePageToTop);
    header.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ') scrollActivePageToTop(e);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindHeader);
  else bindHeader();
})();

// ── Reef Library + improved iPhone add/document handling ───────────────────
const REEF_LIBRARY_KEY = 'reef_library_docs';

function getReefLibraryDocs() {
  try {
    const docs = JSON.parse(localStorage.getItem(REEF_LIBRARY_KEY) || '[]');
    return Array.isArray(docs) ? docs : [];
  } catch(e) { return []; }
}

function setReefLibraryDocs(docs) {
  try {
    localStorage.setItem(REEF_LIBRARY_KEY, JSON.stringify((docs || []).slice(0, 80)));
    return true;
  } catch(e) {
    console.warn('Could not save Reef Library', e);
    return false;
  }
}

function reefLibraryDateLabel(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return 'Recent';
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function normalizeLibraryDoc(doc) {
  return {
    id: doc?.id || `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,
    title: String(doc?.title || doc?.fileName || 'Untitled document').trim(),
    fileName: String(doc?.fileName || doc?.title || 'document').trim(),
    category: String(doc?.category || 'Other Documents').trim(),
    type: String(doc?.type || '').trim(),
    text: String(doc?.text || '').replace(/\u0000/g, '').slice(0, 65000),
    createdAt: doc?.createdAt || new Date().toISOString(),
    updatedAt: doc?.updatedAt || doc?.createdAt || new Date().toISOString()
  };
}

function saveReefLibraryDoc(doc) {
  const normalized = normalizeLibraryDoc(doc);
  const docs = getReefLibraryDocs().filter(d => d.id !== normalized.id);
  docs.unshift(normalized);
  if (!setReefLibraryDocs(docs)) {
    showToast('⚠️ Could not save document. Storage may be full.');
    return null;
  }
  try { renderReefLibrary(); } catch(e) {}
  return normalized;
}

function deleteReefLibraryDoc(id) {
  setReefLibraryDocs(getReefLibraryDocs().filter(d => d.id !== id));
  renderReefLibrary();
  showToast('Document removed');
}

function textLooksReadable(text) {
  const s = String(text || '').slice(0, 500);
  if (!s.trim()) return false;
  const printable = (s.match(/[\x09\x0A\x0D\x20-\x7E]/g) || []).length;
  return printable / Math.max(1, s.length) > 0.75;
}

function isTextLikeFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return type.startsWith('text/') || /\.(txt|md|csv|json|html?|xml|log)$/i.test(name);
}

async function readFileAsTextSafe(file) {
  const text = await file.text();
  return String(text || '').replace(/\u0000/g, '').slice(0, 65000);
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error('PDF reader is not loaded yet. Try again in a few seconds.');
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  } catch(e) {}
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pageTexts = [];
  const maxPages = Math.min(pdf.numPages || 0, 40);
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = (content.items || []).map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    if (pageText) pageTexts.push(`Page ${pageNum}: ${pageText}`);
  }
  const text = pageTexts.join('\n\n').slice(0, 65000);
  if (!text.trim()) throw new Error('No readable text was found in this PDF. It may be a scanned image PDF.');
  return text;
}

async function readDocumentForReefKeeper(file) {
  const name = String(file?.name || 'document');
  const type = String(file?.type || '');
  if (/\.pdf$/i.test(name) || type === 'application/pdf') {
    const text = await extractPdfText(file);
    return { name, type: type || 'application/pdf', text, extracted: true, method: 'pdf' };
  }
  if (isTextLikeFile(file)) {
    const text = await readFileAsTextSafe(file);
    return { name, type, text, extracted: textLooksReadable(text), method: 'text' };
  }
  return { name, type, text: `Attached document: ${name}\nType: ${type || 'unknown'}\nThe app saved the file reference, but cannot extract this file type yet.`, extracted: false, method: 'reference' };
}

function openAddMenu(event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const overlay = document.getElementById('add-menu-overlay');
  if (overlay) overlay.classList.add('visible');
}
function closeAddMenu() {
  const overlay = document.getElementById('add-menu-overlay');
  if (overlay) overlay.classList.remove('visible');
}
function handleAddMenuOverlayClick(event) {
  if (event.target && event.target.id === 'add-menu-overlay') closeAddMenu();
}
function chooseCameraPhoto() {
  closeAddMenu();
  const input = document.getElementById('camera-input');
  if (input) input.click();
}
function choosePhotoLibrary() {
  closeAddMenu();
  const input = document.getElementById('photo-library-input');
  if (input) input.click();
}
function chooseDocumentUpload() {
  closeAddMenu();
  const input = document.getElementById('file-input');
  if (input) input.click();
}

async function handlePhotoLibraryUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  attachedFileContext = {
    name: file.name || 'reef photo',
    text: `Attached photo reference: ${file.name || 'reef photo'}. The app can store and reference the image name, but this text-only AI endpoint does not analyze the image pixels yet. Add a short note describing what you want reviewed.`,
    type: file.type || 'image/*'
  };
  updateAttachmentStatus();
  showToast('🖼 Photo attached');
  event.target.value = '';
}

handleFileUpload = async function(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    showToast('Reading document…');
    const doc = await readDocumentForReefKeeper(file);
    attachedFileContext = {
      name: doc.name,
      text: doc.extracted ? doc.text.slice(0, 45000) : doc.text,
      type: doc.type,
      method: doc.method
    };
    updateAttachmentStatus();
    if (doc.extracted) {
      saveReefLibraryDoc({ title: doc.name.replace(/\.[^.]+$/, ''), fileName: doc.name, category: 'Other Documents', type: doc.type, text: doc.text });
      showToast('📄 Document attached and saved to Reef Library');
    } else {
      showToast('📎 Document attached as reference');
    }
  } catch(e) {
    console.warn('Document read failed', e);
    attachedFileContext = { name: file.name, text: `Attached document: ${file.name}. The app could not extract readable text from this file. Error: ${e.message || e}` };
    updateAttachmentStatus();
    showToast('⚠️ Attached, but could not extract text');
  } finally {
    event.target.value = '';
  }
};

async function uploadReefLibraryDocument(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  const category = document.getElementById('library-category')?.value || 'Other Documents';
  try {
    showToast('Reading document…');
    const doc = await readDocumentForReefKeeper(file);
    saveReefLibraryDoc({ title: doc.name.replace(/\.[^.]+$/, ''), fileName: doc.name, category, type: doc.type, text: doc.text });
    showToast(doc.extracted ? '✅ Document added to Reef Library' : '📎 Document reference added');
  } catch(e) {
    saveReefLibraryDoc({ title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, category, type: file.type || '', text: `Could not extract readable text. Error: ${e.message || e}` });
    showToast('⚠️ Saved document reference only');
  } finally {
    event.target.value = '';
  }
}

function renderReefLibrary() {
  const box = document.getElementById('reef-library-list');
  if (!box) return;
  const q = String(document.getElementById('library-search')?.value || '').toLowerCase().trim();
  let docs = getReefLibraryDocs();
  if (q) {
    docs = docs.filter(doc => `${doc.title} ${doc.fileName} ${doc.category} ${doc.text}`.toLowerCase().includes(q));
  }
  if (!docs.length) {
    box.innerHTML = '<div class="library-empty">No documents saved yet. Upload a protocol, ICP report, equipment manual, or other reef document.</div>';
    return;
  }
  box.innerHTML = docs.map(doc => {
    const excerpt = compactMemoryLine(doc.text || 'No readable text extracted.', 360);
    return `<div class="library-doc-card">
      <div class="library-doc-head">
        <div>
          <div class="library-doc-title">${escapeHtml(doc.title || doc.fileName)}</div>
          <div class="library-doc-meta">${escapeHtml(doc.category)} · ${escapeHtml(reefLibraryDateLabel(doc.createdAt))}</div>
        </div>
        <button class="library-delete-btn" type="button" onclick="deleteReefLibraryDoc('${escapeHtml(doc.id)}')">Delete</button>
      </div>
      <div class="library-doc-text">${escapeHtml(excerpt)}</div>
    </div>`;
  }).join('');
}

function reefLibraryScore(text, terms) {
  const hay = String(text || '').toLowerCase();
  return terms.reduce((score, term) => score + (hay.includes(term) ? 1 : 0), 0);
}

function getReefLibraryMemoryLines(userMsg = '') {
  const docs = getReefLibraryDocs();
  if (!docs.length) return [];
  const terms = getMemorySearchTerms(userMsg);
  const ranked = docs.map(doc => {
    const hay = `${doc.title} ${doc.fileName} ${doc.category} ${doc.text}`;
    const score = terms.length ? reefLibraryScore(hay, terms) : 0;
    return { ...doc, score };
  }).sort((a, b) => (b.score - a.score) || (memoryDateValue(b) - memoryDateValue(a)));
  const selected = ranked.filter(d => d.score > 0).slice(0, 4);
  const fallback = selected.length ? selected : ranked.slice(0, 2);
  return fallback.map(doc => {
    const text = compactMemoryLine(doc.text || 'No readable text extracted.', 1800);
    return `${doc.category}: ${doc.title || doc.fileName} (${reefLibraryDateLabel(doc.createdAt)})\n${text}`;
  });
}

// Patch Long-Term Tool open behavior to refresh the Reef Library.
const __rkOriginalOpenLongTermTool = typeof openLongTermTool === 'function' ? openLongTermTool : null;
openLongTermTool = function(tool) {
  if (__rkOriginalOpenLongTermTool) __rkOriginalOpenLongTermTool(tool);
  if (tool === 'library') { renderReefLibrary(); setTimeout(() => scrollToolToTop('library'), 20); }
};

// Patch local tank memory to include Reef Library search results.
const __rkOriginalGetLocalTankMemorySummary = typeof getLocalTankMemorySummary === 'function' ? getLocalTankMemorySummary : null;
getLocalTankMemorySummary = function(userMsg = '') {
  const base = __rkOriginalGetLocalTankMemorySummary ? __rkOriginalGetLocalTankMemorySummary(userMsg) : '';
  const libraryLines = getReefLibraryMemoryLines(userMsg);
  return `${base}\n\nREEF LIBRARY DOCUMENTS RELEVANT TO THIS QUESTION:\n${libraryLines.length ? libraryLines.join('\n\n') : 'No relevant Reef Library documents found for this question.'}`;
};

// Ensure library is in backup list even if this build's constant was defined earlier.
try {
  if (Array.isArray(REEF_BACKUP_KEYS) && !REEF_BACKUP_KEYS.includes(REEF_LIBRARY_KEY)) REEF_BACKUP_KEYS.push(REEF_LIBRARY_KEY);
} catch(e) {}

// Close new overlays on Escape too.
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeAddMenu(); closeLongTermTool('library'); }
});

try { renderReefLibrary(); } catch(e) {}

// ── Report Center: true PDF/DOCX/HTML export ───────────────────────────────
const REPORT_TYPES = {
  monthly: 'Monthly Reef Report',
  livestock: 'Livestock Catalog',
  timeline: 'Tank Timeline',
  equipment: 'Equipment Guide',
  emergency: 'Emergency Binder',
  custom: 'Custom Report'
};

const __rkReportOpenLongTermTool = typeof openLongTermTool === 'function' ? openLongTermTool : null;
openLongTermTool = function(tool) {
  if (__rkReportOpenLongTermTool) __rkReportOpenLongTermTool(tool);
  if (tool === 'report') setTimeout(() => previewSelectedReport(), 60);
};

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeLongTermTool('report');
});

function rkDateLabel(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value || 'Unknown date');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function rkNowFileStamp() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}

function rkSafeFilename(text) {
  return String(text || 'reef-report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,80) || 'reef-report';
}

function rkDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

function rkTextLines(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function rkWrapText(text, max = 92) {
  const out = [];
  rkTextLines(text).forEach(line => {
    let s = line.trimEnd();
    if (!s) { out.push(''); return; }
    while (s.length > max) {
      let cut = s.lastIndexOf(' ', max);
      if (cut < 30) cut = max;
      out.push(s.slice(0, cut).trimEnd());
      s = s.slice(cut).trimStart();
    }
    out.push(s);
  });
  return out;
}

function rkGetLogsNewest() {
  try { return memorySortNewest([...getDefaultLogs(), ...memoryArray('reef_logs')]); } catch(e) { return []; }
}
function rkGetActionsNewest() {
  try { return memorySortNewest(getActionEntries()); } catch(e) { return []; }
}
function rkGetCompletedNewest() {
  try { return memorySortNewest(memoryArray('reef_completed_history')); } catch(e) { return []; }
}
function rkGetInventoryForReports() {
  try { return getInventoryItems().filter(i => (i.status || '') !== 'lost/resolved'); } catch(e) { return []; }
}
function rkGetKnowledgeForReports() {
  try { return getTankKnowledgeItems(); } catch(e) { return []; }
}
function rkGetLibraryDocsForReports() {
  try { return getReefLibraryDocs ? getReefLibraryDocs() : []; } catch(e) { return []; }
}

function rkFormatLogLine(log) {
  const parts = [];
  if (log.po4 !== undefined && log.po4 !== '') parts.push(`PO₄ ${log.po4} ppm`);
  if (log.alk !== undefined && log.alk !== '') parts.push(`Alk ${log.alk} dKH`);
  if (log.ca !== undefined && log.ca !== '') parts.push(`Ca ${log.ca}`);
  if (log.mg !== undefined && log.mg !== '') parts.push(`Mg ${log.mg}`);
  if (log.no3 !== undefined && log.no3 !== '') parts.push(`NO₃ ${log.no3} ppm`);
  if (log.ph !== undefined && log.ph !== '') parts.push(`pH ${log.ph}`);
  if (log.sal !== undefined && log.sal !== '') parts.push(`Salinity ${log.sal}`);
  return `${rkDateLabel(log.date || log.createdAt)} — ${parts.join(' · ') || 'Reading logged'}`;
}

function rkTrendSummaryForReports(logs) {
  try { return buildParameterTrendSummary(logs || rkGetLogsNewest()); } catch(e) { return 'Trend summary unavailable.'; }
}

function rkInventoryLine(item) {
  const facts = String(item.facts || '').split('\n').filter(Boolean).slice(0, 4).map(f => `  - ${f.trim()}`).join('\n');
  return `${item.name || 'Unnamed'}${item.scientific ? ` (${item.scientific})` : ''}\nType/status: ${item.type || 'unknown'} · ${item.status || 'unknown'}${item.location ? `\nTank location: ${item.location}` : ''}${item.range ? `\nNatural range: ${item.range}` : ''}${facts ? `\nFacts:\n${facts}` : ''}${item.notes ? `\nNotes: ${item.notes}` : ''}`;
}

function rkBuildTimelineEvents() {
  const events = [];
  rkGetLogsNewest().forEach(log => events.push({ date: new Date(log.date || log.createdAt || Date.now()), kind: 'Parameter log', text: rkFormatLogLine(log) }));
  rkGetActionsNewest().forEach(a => events.push({ date: new Date(a.date || a.createdAt || Date.now()), kind: 'Action', text: `${rkDateLabel(a.date || a.createdAt)} — ${a.title || 'Action'}${a.category ? ` (${a.category})` : ''}${a.notes ? ` — ${a.notes}` : ''}` }));
  rkGetCompletedNewest().forEach(c => events.push({ date: new Date(c.date || c.completedAt || c.createdAt || Date.now()), kind: 'Completed task', text: `${rkDateLabel(c.date || c.completedAt || c.createdAt)} — Completed: ${c.title || c.text || 'Task'}` }));
  rkGetKnowledgeForReports().forEach(k => events.push({ date: new Date(k.createdAt || Date.now()), kind: 'Knowledge', text: `${rkDateLabel(k.createdAt)} — ${k.category || 'Knowledge'}: ${k.title || ''} — ${k.note || ''}` }));
  return events.filter(e => !Number.isNaN(e.date.getTime())).sort((a,b) => a.date - b.date);
}

function rkBuildReport(type, customPrompt = '') {
  const title = REPORT_TYPES[type] || 'Reef Keeper Report';
  const logs = rkGetLogsNewest();
  const actions = rkGetActionsNewest();
  const completed = rkGetCompletedNewest();
  const inventory = rkGetInventoryForReports();
  const knowledge = rkGetKnowledgeForReports();
  const docs = rkGetLibraryDocsForReports();
  const mode = (typeof getTankMode === 'function' ? getTankMode() : 'unknown');
  const lines = [];
  const heading = (h) => { lines.push('', h.toUpperCase(), '-'.repeat(Math.min(48, h.length + 6))); };
  lines.push(title);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Tank mode: ${mode}`);
  lines.push('Reef Keeper');

  if (type === 'monthly') {
    heading('Executive Summary');
    lines.push(rkTrendSummaryForReports(logs));
    heading('Latest Parameter Readings');
    logs.slice(0, 8).forEach(l => lines.push(`- ${rkFormatLogLine(l)}`));
    heading('What Changed Recently');
    actions.slice(0, 12).forEach(a => lines.push(`- ${rkDateLabel(a.date || a.createdAt)}: ${a.title || 'Action'}${a.notes ? ` — ${a.notes}` : ''}`));
    completed.slice(0, 10).forEach(c => lines.push(`- ${rkDateLabel(c.date || c.completedAt || c.createdAt)}: completed ${c.title || c.text || 'task'}`));
    heading('Risks / Watch Items');
    knowledge.slice(0, 10).forEach(k => lines.push(`- ${k.title || k.category}: ${k.note || ''}`));
    heading('Recommended Focus');
    lines.push('- Keep changes gradual and avoid stacking major interventions.');
    lines.push('- Use trends and coral response before making nutrient/export changes.');
    lines.push('- Continue documenting livestock, treatment, and equipment changes.');
  } else if (type === 'livestock') {
    heading('Fish');
    inventory.filter(i => (i.type || '').toLowerCase() === 'fish').forEach(i => lines.push(rkInventoryLine(i), ''));
    heading('Invertebrates');
    inventory.filter(i => ['invert','invertebrate'].includes((i.type || '').toLowerCase())).forEach(i => lines.push(rkInventoryLine(i), ''));
    heading('Coral & Anemones');
    inventory.filter(i => ['coral','anemone'].includes((i.type || '').toLowerCase())).forEach(i => lines.push(rkInventoryLine(i), ''));
  } else if (type === 'timeline') {
    heading('Chronological Tank Timeline');
    rkBuildTimelineEvents().forEach(e => lines.push(`- ${e.text}`));
    heading('Timeline Notes');
    lines.push('Use this timeline to look for cause-and-effect relationships after water changes, media changes, treatments, livestock additions, and parameter swings.');
  } else if (type === 'equipment') {
    heading('System Overview');
    lines.push('120 gallon SCA display with 50 gallon Red Sea Reefer sump. Neptune Apex controller.');
    heading('Equipment List');
    ['2 Jebao MDP Smart DC return pumps','2 Hygger 802 titanium heaters','Bubble Magus filter roller','Simplicity 240 DC protein skimmer with outdoor air intake','27W IceCap UV sterilizer','IceCap GFO reactor / DIY reactor path','ROX 0.8 carbon / GFO media as used','4 A8se 11 Max lights','2 MP40 powerheads + 1 Jebao DMP20','Useek smart ATO with 10 gallon reservoir','5-stage RODI with booster pump','55 gallon Brute saltwater mixing can'].forEach(x => lines.push(`- ${x}`));
    heading('Maintenance Rules');
    try { getMaintenanceIntervals().forEach(x => lines.push(`- ${x}`)); } catch(e) { lines.push('- Review and clean pumps, skimmer, roller, UV, RODI, and reactors on regular intervals.'); }
  } else if (type === 'emergency') {
    heading('Tank Overview');
    lines.push('120 gallon reef display with 50 gallon sump. Keep temperature, salinity, oxygenation, and circulation stable first.');
    heading('Power Outage');
    lines.push('- Prioritize water movement and oxygenation.');
    lines.push('- Keep temperature stable.');
    lines.push('- Avoid feeding during prolonged outages.');
    heading('Overheating');
    lines.push('- Verify heaters are on AUTO, not ON.');
    lines.push('- Increase surface agitation and room ventilation.');
    lines.push('- Cool slowly; avoid abrupt temperature swings.');
    heading('Parameter Crash or Spike');
    lines.push('- Retest before reacting.');
    lines.push('- Make one correction at a time.');
    lines.push('- Avoid stacking water change, GFO/carbon changes, and pest treatments on the same day unless urgent.');
    heading('Known Guardrails');
    knowledge.forEach(k => lines.push(`- ${k.title || k.category}: ${k.note || ''}`));
  } else {
    heading('Custom Request');
    lines.push(customPrompt || 'Custom report requested.');
    heading('Relevant Tank Snapshot');
    lines.push(rkTrendSummaryForReports(logs));
    heading('Recent Logs');
    logs.slice(0, 12).forEach(l => lines.push(`- ${rkFormatLogLine(l)}`));
    heading('Recent Actions');
    actions.slice(0, 15).forEach(a => lines.push(`- ${rkDateLabel(a.date || a.createdAt)}: ${a.title || 'Action'}${a.notes ? ` — ${a.notes}` : ''}`));
    heading('Knowledge Base');
    knowledge.slice(0, 20).forEach(k => lines.push(`- ${k.title || k.category}: ${k.note || ''}`));
  }

  heading('Reef Library Documents on File');
  if (docs.length) docs.slice(0, 20).forEach(d => lines.push(`- ${d.category || 'Document'}: ${d.title || d.fileName} (${rkDateLabel(d.createdAt)})${d.extracted ? ' — text searchable' : ' — reference only'}`));
  else lines.push('No Reef Library documents saved yet.');
  return { title, text: lines.join('\n').replace(/\n{3,}/g, '\n\n') };
}

function getSelectedReport() {
  const type = document.getElementById('report-type')?.value || 'monthly';
  const custom = document.getElementById('report-custom-prompt')?.value || '';
  return rkBuildReport(type, custom);
}

function previewSelectedReport() {
  const box = document.getElementById('report-preview');
  if (!box) return;
  const report = getSelectedReport();
  box.textContent = report.text;
}

function downloadSelectedReportHTML() {
  const report = getSelectedReport();
  const body = escapeHtml(report.text).replace(/\n/g, '<br>');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font-family:Arial,sans-serif;line-height:1.5;margin:40px;color:#123}h1{color:#0077b6}div{white-space:normal}</style></head><body><h1>${escapeHtml(report.title)}</h1><div>${body}</div></body></html>`;
  rkDownloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${rkSafeFilename(report.title)}-${rkNowFileStamp()}.html`);
}

function pdfEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function rkCreateSimplePDF(title, text) {
  const wrapped = rkWrapText(`${title}\n\n${text}`, 88);
  const pages = [];
  for (let i=0; i<wrapped.length; i+=44) pages.push(wrapped.slice(i, i+44));
  if (!pages.length) pages.push(['']);
  const objs = [];
  function add(s){ objs.push(s); return objs.length; }
  const fontObj = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageObjs = [];
  pages.forEach(lines => {
    const content = `BT\n/F1 10 Tf\n50 780 Td\n14 TL\n${lines.map(l => `(${pdfEscape(l)}) Tj T*`).join('\n')}\nET`;
    const streamObj = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageObj = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${streamObj} 0 R >>`);
    pageObjs.push(pageObj);
  });
  const pagesObjIndex = objs.length + 1;
  pageObjs.forEach(n => { objs[n-1] = objs[n-1].replace('/Parent 0 0 R', `/Parent ${pagesObjIndex} 0 R`); });
  const pagesObj = add(`<< /Type /Pages /Kids [${pageObjs.map(n => `${n} 0 R`).join(' ')}] /Count ${pageObjs.length} >>`);
  const catalogObj = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length+1}\n0000000000 65535 f \n` + offsets.slice(1).map(o => String(o).padStart(10,'0') + ' 00000 n ').join('\n') + '\n';
  pdf += `trailer\n<< /Size ${objs.length+1} /Root ${catalogObj} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadSelectedReportPDF() {
  const report = getSelectedReport();
  const blob = rkCreateSimplePDF(report.title, report.text);
  rkDownloadBlob(blob, `${rkSafeFilename(report.title)}-${rkNowFileStamp()}.pdf`);
}

// Minimal DOCX generator with uncompressed ZIP package.
const rkCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n=0; n<256; n++) {
    let c=n;
    for (let k=0; k<8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n]=c>>>0;
  }
  return table;
})();
function rkCrc32(bytes) {
  let c = 0xffffffff;
  for (let i=0; i<bytes.length; i++) c = rkCrcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function rkU16(n){ return [n & 255, (n>>>8)&255]; }
function rkU32(n){ return [n & 255, (n>>>8)&255, (n>>>16)&255, (n>>>24)&255]; }
function rkConcat(arrays){ const len=arrays.reduce((s,a)=>s+a.length,0); const out=new Uint8Array(len); let o=0; arrays.forEach(a=>{out.set(a,o);o+=a.length;}); return out; }
function rkZipStore(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = enc.encode(name);
    const data = content instanceof Uint8Array ? content : enc.encode(String(content));
    const crc = rkCrc32(data);
    const local = new Uint8Array([0x50,0x4b,0x03,0x04, ...rkU16(20), ...rkU16(0), ...rkU16(0), ...rkU16(0), ...rkU16(0), ...rkU32(crc), ...rkU32(data.length), ...rkU32(data.length), ...rkU16(nameBytes.length), ...rkU16(0)]);
    locals.push(local, nameBytes, data);
    const central = new Uint8Array([0x50,0x4b,0x01,0x02, ...rkU16(20), ...rkU16(20), ...rkU16(0), ...rkU16(0), ...rkU16(0), ...rkU16(0), ...rkU32(crc), ...rkU32(data.length), ...rkU32(data.length), ...rkU16(nameBytes.length), ...rkU16(0), ...rkU16(0), ...rkU16(0), ...rkU16(0), ...rkU32(0), ...rkU32(offset)]);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  });
  const centralStart = offset;
  const centralBytes = rkConcat(centrals);
  const end = new Uint8Array([0x50,0x4b,0x05,0x06, ...rkU16(0), ...rkU16(0), ...rkU16(Object.keys(files).length), ...rkU16(Object.keys(files).length), ...rkU32(centralBytes.length), ...rkU32(centralStart), ...rkU16(0)]);
  return rkConcat([...locals, centralBytes, end]);
}
function wordXmlEscape(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function rkDocxParagraph(text, bold=false) {
  const style = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p><w:r>${style}<w:t xml:space="preserve">${wordXmlEscape(text || ' ')}</w:t></w:r></w:p>`;
}
function rkCreateSimpleDOCX(title, text) {
  const paragraphs = [];
  paragraphs.push(rkDocxParagraph(title, true));
  rkTextLines(text).forEach(line => {
    const isHeading = line && line === line.toUpperCase() && line.length < 70 && !line.startsWith('-') && !line.match(/^[-]+$/);
    if (!line.match(/^[-]+$/)) paragraphs.push(rkDocxParagraph(line, isHeading));
  });
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': documentXml
  };
  return new Blob([rkZipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
function downloadSelectedReportDOCX() {
  const report = getSelectedReport();
  const blob = rkCreateSimpleDOCX(report.title, report.text);
  rkDownloadBlob(blob, `${rkSafeFilename(report.title)}-${rkNowFileStamp()}.docx`);
}
