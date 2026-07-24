import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('integration-core.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

class LocalStorageMock {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

const originalLogs = [{ id:'p1', isoDate:'2026-07-20T12:00:00.000Z', po4:'0.10', alk:'9.0' }];
const originalActions = [{ id:'a1', isoDate:'2026-07-21T12:00:00.000Z', title:'Replaced filter roller fleece', category:'equipment', equipmentId:'filter-roller', equipmentName:'Filter Roller', actionCode:'filter_roller.fleece_replaced' }];
const originalCompleted = [{ id:'c1', completedAt:'2026-07-22T12:00:00.000Z', title:'Clean skimmer', type:'reminder' }];
const storage = new LocalStorageMock({
  reef_logs: JSON.stringify(originalLogs),
  reef_actions: JSON.stringify(originalActions),
  reef_completed_history: JSON.stringify(originalCompleted)
});

const dispatched = [];
class CustomEventMock { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
const context = {
  console,
  localStorage: storage,
  CustomEvent: CustomEventMock,
  dispatchEvent(event) { dispatched.push(event); },
  document: { getElementById() { return null; } },
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Map,
  Set
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename:'integration-core.js' });

const api = context.ReefKeeperIntegration;
assert.ok(api, 'Integration Core must install a global API.');
assert.equal(api.version, '9B.1');
assert.equal(api.schemaVersion, 1);

const events = api.listEvents();
assert.equal(events.length, 3, 'Legacy logs, actions, and completed tasks should migrate exactly once.');
assert.ok(events.some(event => event.eventType === 'parameter.test.recorded'));
assert.ok(events.some(event => event.eventType === 'maintenance.filter_roller.fleece_replaced'));
assert.ok(events.some(event => event.eventType === 'task.completed'));
assert.deepEqual(JSON.parse(storage.getItem('reef_logs')), originalLogs, 'Migration must not rewrite parameter source records.');
assert.deepEqual(JSON.parse(storage.getItem('reef_actions')), originalActions, 'Migration must not rewrite maintenance source records.');

const initialRoll = api.getFilterRollState();
assert.equal(initialRoll.currentCycle.replacementEventId, events.find(event => event.eventType === 'maintenance.filter_roller.fleece_replaced').id);
assert.equal(initialRoll.currentCycle.baselinePending, true);
assert.equal(initialRoll.sampling.measurementsPerDay, 3);

const measurement = api.recordFilterRollMeasurement({
  captureAt:'2026-07-22T20:00:00.000Z',
  apparentOuterRadius:120,
  apparentCoreRadius:36,
  confidence:0.86,
  cameraId:'overview'
});
assert.equal(measurement.ok, true);
assert.equal(Math.round(measurement.measurement.remainingPct), 100);
const followup = api.recordFilterRollMeasurement({
  captureAt:'2026-07-23T20:00:00.000Z',
  apparentOuterRadius:108,
  apparentCoreRadius:36,
  confidence:0.88,
  cameraId:'overview'
});
assert.equal(followup.ok, true);
assert.equal(Math.round(followup.measurement.remainingPct), 86);
assert.equal(api.getFilterRollLearningSummary().currentMeasurementCount, 2);
assert.equal(api.getFilterRollLearningSummary().stage, 'learning');

api.syncLegacySources();
api.syncLegacySources();
assert.equal(api.listEvents().filter(event => event.eventType === 'maintenance.filter_roller.fleece_replaced').length, 1, 'Repeated synchronization must not duplicate replacement events.');
assert.equal(api.getFilterRollState().completedCycles.length, 0, 'Repeated synchronization must not create fake completed rolls.');

const second = api.recordAction({
  id:'a2',
  isoDate:'2026-08-20T12:00:00.000Z',
  title:'Changed the fleece roll',
  category:'maintenance'
});
assert.equal(second.eventType, 'maintenance.filter_roller.fleece_replaced', 'Free-text maintenance should still connect to Observer.');
assert.equal(api.getFilterRollState().completedCycles.length, 1, 'A real replacement should close the previous cycle.');
assert.equal(api.getFilterRollState().currentCycle.replacementEventId, second.id);
assert.equal(api.removeEventsBySource('reef_actions', 'a2'), 1, 'Deleting a source action should remove its mirrored event.');
assert.equal(api.getFilterRollState().completedCycles.length, 0, 'Deleting a replacement must reconcile roll cycles.');
assert.notEqual(api.getFilterRollState().currentCycle?.replacementEventId, second.id);

const timeline = api.getTimelineEvents();
assert.ok(timeline.some(event => event.integrationKind === 'parameter'));
assert.ok(timeline.some(event => event.integrationKind === 'maintenance'));
assert.ok(timeline.some(event => event.integrationKind === 'completed'));
assert.match(api.buildAiContext('filter roller usage'), /SHARED REEF KEEPER EVENT STREAM/);
assert.match(api.buildAiContext('filter roller usage'), /FILTER ROLLER LEARNING/);

assert.ok(html.includes('integration-core.js?v=20260724-maintenance-9b-filter-roll'));
assert.ok(html.includes('id="action-equipment"'));
assert.ok(html.includes('id="action-code"'));
assert.ok(html.includes('id="observer-filter-roll-card"'));
assert.ok(html.includes('id="observer-filter-roll-badge"'));
assert.ok(html.includes("window.ReefKeeperIntegration?.getTimelineEvents"));
assert.ok(app.includes("window.ReefKeeperIntegration?.recordParameterLog?.(entry)"));
assert.ok(app.includes("window.ReefKeeperIntegration?.recordAction?.(entry)"));
assert.ok(app.includes("window.ReefKeeperIntegration?.recordCompletedTask?.(historyEntry)"));
assert.ok(app.includes("'reef_tank_events_v1'"));
assert.ok(app.includes("'reef_observer_filter_roll_state_v1'"));

console.log('Integration Core event, migration, filter-roll, and cross-feature safeguards passed.');
