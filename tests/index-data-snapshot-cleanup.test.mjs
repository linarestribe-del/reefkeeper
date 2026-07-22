import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');

assert.ok(html.includes('function filteredEvents(allEvents = buildEvents())'), 'Timeline filtering must accept a prebuilt event snapshot.');
assert.ok(html.includes('const allEvents = buildEvents();\n    const events = filteredEvents(allEvents);'), 'Timeline render must build one event snapshot.');
assert.ok(html.includes('renderIntelligence(allEvents);'), 'Timeline intelligence must reuse the full event snapshot.');
assert.ok(html.includes('renderMilestones(allEvents);'), 'Timeline milestones must reuse the full event snapshot.');

const intelligenceStart = html.indexOf('function renderIntelligence(allEvents)');
const milestonesStart = html.indexOf('function renderMilestones(allEvents)', intelligenceStart);
const timelineStart = html.indexOf('function renderTimeline()', milestonesStart);
const resizeStart = html.indexOf('function resizeImage(', timelineStart);
assert.ok(intelligenceStart >= 0 && milestonesStart > intelligenceStart && timelineStart > milestonesStart && resizeStart > timelineStart, 'Timeline functions must remain in canonical order.');
assert.ok(!html.slice(intelligenceStart, milestonesStart).includes('buildEvents()'), 'Timeline intelligence must not rebuild events.');
assert.ok(!html.slice(milestonesStart, timelineStart).includes('buildEvents()'), 'Timeline milestones must not rebuild events.');
assert.equal((html.slice(timelineStart, resizeStart).match(/buildEvents\(\)/g) || []).length, 1, 'Timeline render must build events exactly once.');
assert.ok(html.includes('function buildEvents(source = {})'), 'Timeline builder must accept an optional preloaded source snapshot.');
assert.ok(html.includes("const logs = Array.isArray(source.logs) ? source.logs : readJson('reef_logs', []);"), 'Timeline builder must reuse preloaded logs when supplied.');
assert.ok(html.includes("const actions = Array.isArray(source.actions) ? source.actions : readJson('reef_actions', []);"), 'Timeline builder must reuse preloaded actions when supplied.');
assert.ok(html.includes("const completed = Array.isArray(source.completed) ? source.completed : readJson('reef_completed_history', []);"), 'Timeline builder must reuse preloaded completed tasks when supplied.');

assert.ok(html.includes('function rkReportLatestLogSummary(sourceLogs = rkReportGetLogs())'), 'Report summary must accept an existing log snapshot.');
assert.equal((html.match(/rkReportLatestLogSummary\(d\.logs\)/g) || []).length, 3, 'Monthly, emergency, and custom reports must reuse their loaded logs.');
assert.equal((html.match(/rkReportLatestLogSummary\(\)/g) || []).length, 0, 'Report builders must not reread logs after loading base data.');
assert.ok(html.includes('data.timeline = rkReportGetTimelineEvents({'), 'Report base data must pass its loaded snapshot into Timeline.');
assert.ok(html.includes('logs: data.logs,\n      actions: data.actions,\n      completed: data.completed'), 'Report Timeline handoff must reuse logs, actions, and completed tasks.');

function extractIife(marker) {
  const markerIndex = html.indexOf(marker);
  assert.ok(markerIndex >= 0, `Missing script marker: ${marker}`);
  const scriptStart = html.lastIndexOf('<script>', markerIndex);
  const scriptEnd = html.indexOf('</script>', markerIndex);
  assert.ok(scriptStart >= 0 && scriptEnd > markerIndex, `Could not isolate script for ${marker}`);
  return html.slice(scriptStart + '<script>'.length, scriptEnd);
}

function makeStorage(data) {
  const reads = new Map();
  return {
    reads,
    getItem(key) {
      reads.set(key, (reads.get(key) || 0) + 1);
      return Object.prototype.hasOwnProperty.call(data, key) ? JSON.stringify(data[key]) : null;
    },
    setItem() {},
    removeItem() {}
  };
}

function makeDocument(nodes) {
  return {
    getElementById(id) { return nodes[id] || null; },
    addEventListener() {},
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        id: '',
        textContent: '',
        innerHTML: '',
        dataset: {},
        style: {},
        classList: { add() {}, remove() {} },
        addEventListener() {},
        appendChild() {},
        remove() {},
        click() {}
      };
    },
    head: {
      appendChild(node) {
        if (node?.id) nodes[node.id] = node;
      }
    },
    body: {
      appendChild() {},
      classList: { add() {}, remove() {} }
    }
  };
}

const timelineNodes = {
  'reef-timeline-search': { value: '' },
  'reef-timeline-filter': { value: 'all' },
  'tank-history-list': { innerHTML: '' },
  'reef-timeline-count': { textContent: '' },
  'reef-timeline-intelligence': { innerHTML: '' },
  'reef-timeline-milestones': { innerHTML: '' }
};
const timelineStorage = makeStorage({
  reef_tank_history_photos_v1: [{ title: 'Full tank', notes: 'Clear water', createdAt: '2026-07-21T12:00:00Z' }],
  reef_logs: [{ po4: '0.10', isoDate: '2026-07-20T12:00:00Z' }],
  reef_actions: [{ title: 'Cleaned skimmer', isoDate: '2026-07-19T12:00:00Z' }],
  reef_completed_history: [{ title: 'Changed carbon', completedAt: '2026-07-18T12:00:00Z' }],
  reef_inventory_custom_v2: [{ id: 'fish-1', name: 'Clownfish', type: 'Fish', createdAt: '2026-07-17T12:00:00Z' }],
  reef_inventory_custom: [],
  reef_inventory: []
});
const timelineSandbox = {
  console,
  localStorage: timelineStorage,
  document: makeDocument(timelineNodes),
  setTimeout() {},
  clearTimeout() {},
  FileReader: class {},
  Image: class {},
  Date,
  JSON,
  Number,
  String,
  Array,
  Object,
  Math,
  Set
};
timelineSandbox.window = timelineSandbox;
vm.runInNewContext(extractIife("const PHOTO_KEY = 'reef_tank_history_photos_v1';"), timelineSandbox, { filename: 'timeline-inline.js' });
timelineSandbox.window.ReefKeeperTimeline.render();

for (const key of [
  'reef_tank_history_photos_v1',
  'reef_logs',
  'reef_actions',
  'reef_completed_history',
  'reef_inventory_custom_v2',
  'reef_inventory_custom',
  'reef_inventory'
]) {
  assert.equal(timelineStorage.reads.get(key), 1, `Timeline must read ${key} once per render.`);
}
assert.equal(timelineNodes['reef-timeline-count'].textContent, '5 events');
assert.match(timelineNodes['reef-timeline-intelligence'].innerHTML, /Tracking 5 reef events/);
assert.match(timelineNodes['reef-timeline-milestones'].innerHTML, /Latest:/);
assert.match(timelineNodes['tank-history-list'].innerHTML, /Full tank/);
assert.match(timelineNodes['tank-history-list'].innerHTML, /Clownfish/);

const reportNodes = {
  'report-type': { value: 'monthly' },
  'report-custom-prompt': { value: 'Summarize stability' },
  'report-preview': { innerHTML: '', dataset: {} }
};
const reportStorage = makeStorage({
  reef_tank_history_photos_v1: [],
  reef_logs: [{ po4: '0.10', alk: '9.0', isoDate: '2026-07-20T12:00:00Z' }],
  reef_actions: [],
  reef_completed_history: [],
  reef_inventory_custom_v2: [],
  reef_inventory_custom: [],
  reef_inventory: [],
  reef_tank_memory_v1: [],
  reef_tank_memory: [],
  reef_long_term_memory: [],
  reef_knowledge_base_v1: [],
  reef_kb_items_v1: [],
  reef_equipment_v1: [],
  reef_equipment: [],
  reef_equipment_items: []
});
const reportSandbox = {
  console,
  localStorage: reportStorage,
  document: makeDocument(reportNodes),
  setTimeout() {},
  clearTimeout() {},
  addEventListener() {},
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  Blob: class {},
  FileReader: class {},
  Image: class {},
  Date,
  JSON,
  Number,
  String,
  Array,
  Object,
  Math,
  Set
};
reportSandbox.window = reportSandbox;
vm.runInNewContext(extractIife("const PHOTO_KEY = 'reef_tank_history_photos_v1';"), reportSandbox, { filename: 'timeline-report-inline.js' });
vm.runInNewContext(extractIife('function rkReportEsc(value)'), reportSandbox, { filename: 'report-inline.js' });

for (const type of ['monthly', 'emergency', 'custom']) {
  reportStorage.reads.clear();
  reportNodes['report-type'].value = type;
  reportNodes['report-preview'].dataset = {};
  reportSandbox.window.previewSelectedReport();
  assert.equal(reportStorage.reads.get('reef_logs'), 1, `${type} report must read parameter logs once.`);
  assert.equal(reportStorage.reads.get('reef_actions'), 1, `${type} report must read actions once.`);
  assert.equal(reportStorage.reads.get('reef_completed_history'), 1, `${type} report must read completed tasks once.`);
  assert.match(reportNodes['report-preview'].dataset.reportText, /PO₄ 0\.10/);
}

console.log('Index data snapshot cleanup regression tests passed.');
