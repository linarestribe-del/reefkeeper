// Reef Keeper Maintenance 9A — Integration Core
// One structured tank-event stream shared by maintenance, parameters, Observer,
// timeline, reports, recent changes, and Ask AI. Existing source records remain
// untouched and continue to serve as backward-compatible storage.
(function installReefKeeperIntegrationCore(global) {
  'use strict';

  const EVENT_STORE_KEY = 'reef_tank_events_v1';
  const EVENT_META_KEY = 'reef_tank_events_meta_v1';
  const FILTER_ROLL_STATE_KEY = 'reef_observer_filter_roll_state_v1';
  const SCHEMA_VERSION = 1;
  const MAX_EVENTS = 1500;
  const MAX_COMPLETED_ROLLS = 24;
  const MAX_MEASUREMENTS_PER_ROLL = 180;

  function nowIso() { return new Date().toISOString(); }

  function safeParse(key, fallback) {
    try {
      const raw = global.localStorage?.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      global.localStorage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function cleanText(value, fallback = '') {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  function validIso(value, fallback = nowIso()) {
    const d = new Date(value || '');
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((out, key) => {
        if (value[key] !== undefined) out[key] = stableValue(value[key]);
        return out;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    try { return JSON.stringify(stableValue(value)); }
    catch (_) { return String(value ?? ''); }
  }

  function hashText(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function canonicalLegacyId(storageKey, record, index = 0) {
    const explicit = cleanText(record?.id || record?.eventId || record?.uuid || '');
    if (explicit) return explicit;
    const date = record?.isoDate || record?.completedAt || record?.createdAt || record?.date || '';
    return `legacy-${hashText(`${storageKey}|${date}|${stableStringify(record)}`)}`;
  }

  function eventIdFor(input) {
    const sourceKey = cleanText(input?.source?.key || input?.sourceKey || 'reefkeeper');
    const sourceId = cleanText(input?.source?.recordId || input?.sourceId || '');
    const type = cleanText(input?.eventType || 'tank.event');
    const occurredAt = validIso(input?.occurredAt || input?.createdAt || nowIso());
    const identity = sourceId || hashText(stableStringify(input?.data || input?.details || input?.summary || occurredAt));
    return `rkevt-${hashText(`${sourceKey}|${identity}|${type}`)}`;
  }

  function normalizeEvent(input) {
    const occurredAt = validIso(input?.occurredAt || input?.createdAt || input?.date || nowIso());
    const eventType = cleanText(input?.eventType, 'tank.event');
    const source = {
      system: cleanText(input?.source?.system || input?.sourceSystem, 'reefkeeper'),
      key: cleanText(input?.source?.key || input?.sourceKey, 'reefkeeper'),
      recordId: cleanText(input?.source?.recordId || input?.sourceId || '')
    };
    const event = {
      schemaVersion: SCHEMA_VERSION,
      id: cleanText(input?.id) || eventIdFor({ ...input, eventType, occurredAt, source }),
      eventType,
      occurredAt,
      recordedAt: validIso(input?.recordedAt || nowIso()),
      source,
      entity: input?.entity && typeof input.entity === 'object' ? {
        type: cleanText(input.entity.type),
        id: cleanText(input.entity.id),
        name: cleanText(input.entity.name)
      } : null,
      summary: cleanText(input?.summary, eventType),
      details: cleanText(input?.details),
      data: input?.data && typeof input.data === 'object' ? input.data : {},
      tags: Array.from(new Set((Array.isArray(input?.tags) ? input.tags : [])
        .map(tag => cleanText(tag).toLowerCase())
        .filter(Boolean))).slice(0, 20),
      confidence: cleanText(input?.confidence),
      version: Number.isFinite(Number(input?.version)) ? Number(input.version) : 1
    };
    if (!event.entity?.type && !event.entity?.id && !event.entity?.name) event.entity = null;
    return event;
  }

  function readEvents() {
    const value = safeParse(EVENT_STORE_KEY, []);
    return Array.isArray(value) ? value.filter(Boolean).map(normalizeEvent) : [];
  }

  function writeEvents(events) {
    const normalized = (Array.isArray(events) ? events : [])
      .map(normalizeEvent)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, MAX_EVENTS);
    const ok = safeWrite(EVENT_STORE_KEY, normalized);
    if (ok) {
      safeWrite(EVENT_META_KEY, {
        schemaVersion: SCHEMA_VERSION,
        count: normalized.length,
        updatedAt: nowIso(),
        latestEventAt: normalized[0]?.occurredAt || null
      });
    }
    return ok;
  }

  function dispatchEvent(event) {
    try {
      if (typeof global.dispatchEvent !== 'function' || typeof global.CustomEvent !== 'function') return;
      global.dispatchEvent(new global.CustomEvent('reefkeeper:event', { detail: event }));
    } catch (_) {}
  }

  function upsertEvent(input, options = {}) {
    const event = normalizeEvent(input);
    const events = readEvents();
    let existingIndex = events.findIndex(item => item.id === event.id);
    if (existingIndex < 0 && event.source?.recordId) {
      existingIndex = events.findIndex(item => item.source?.key === event.source.key && item.source?.recordId === event.source.recordId);
    }
    if (existingIndex >= 0) {
      const existing = events[existingIndex];
      events[existingIndex] = normalizeEvent({
        ...existing,
        ...event,
        recordedAt: existing.recordedAt || event.recordedAt,
        version: Math.max(Number(existing.version || 1), Number(event.version || 1))
      });
    } else {
      events.unshift(event);
    }
    writeEvents(events);
    if (!options.silent) dispatchEvent(event);
    return event;
  }

  function removeEventsBySource(sourceKey, recordId = '') {
    const key = cleanText(sourceKey);
    const id = cleanText(recordId);
    if (!key) return 0;
    const events = readEvents();
    const filtered = events.filter(event => {
      if (event.source?.key !== key) return true;
      if (id && event.source?.recordId !== id) return true;
      return false;
    });
    const removed = events.length - filtered.length;
    if (removed) {
      writeEvents(filtered);
      if (key === 'reef_actions') reconcileFilterRollCyclesFromEvents();
      renderFilterRollIntegrationStatus();
    }
    return removed;
  }

  function listEvents(options = {}) {
    const types = Array.isArray(options.eventTypes) ? new Set(options.eventTypes) : null;
    const tags = Array.isArray(options.tags) ? options.tags.map(tag => cleanText(tag).toLowerCase()).filter(Boolean) : [];
    const since = options.since ? new Date(options.since).getTime() : null;
    const entityId = cleanText(options.entityId);
    const limit = Math.max(1, Math.min(MAX_EVENTS, Number(options.limit || MAX_EVENTS)));

    return readEvents().filter(event => {
      if (types && !types.has(event.eventType)) return false;
      if (tags.length && !tags.every(tag => event.tags.includes(tag))) return false;
      if (Number.isFinite(since) && new Date(event.occurredAt).getTime() < since) return false;
      if (entityId && event.entity?.id !== entityId) return false;
      return true;
    }).slice(0, limit);
  }

  function parameterSummary(log) {
    const parts = [];
    if (log?.po4 !== '' && log?.po4 !== undefined) parts.push(`PO₄ ${log.po4}`);
    if (log?.alk !== '' && log?.alk !== undefined) parts.push(`Alk ${log.alk}`);
    if (log?.no3 !== '' && log?.no3 !== undefined) parts.push(`NO₃ ${log.no3}`);
    if (log?.ca !== '' && log?.ca !== undefined) parts.push(`Ca ${log.ca}`);
    if (log?.mg !== '' && log?.mg !== undefined) parts.push(`Mg ${log.mg}`);
    if (log?.ph !== '' && log?.ph !== undefined) parts.push(`pH ${log.ph}`);
    if (log?.sal !== '' && log?.sal !== undefined) parts.push(`SG ${log.sal}`);
    return parts.length ? parts.join(' · ') : 'Water test saved';
  }

  function recordParameterLog(log, options = {}) {
    if (!log || typeof log !== 'object') return null;
    const recordId = canonicalLegacyId('reef_logs', log, options.index || 0);
    return upsertEvent({
      eventType: 'parameter.test.recorded',
      occurredAt: log.isoDate || log.createdAt || log.date,
      source: { system:'parameter-log', key:'reef_logs', recordId },
      entity: { type:'tank', id:'primary-tank', name:'Display system' },
      summary: parameterSummary(log),
      details: 'Manual reef parameter test recorded.',
      data: {
        po4: log.po4 ?? '', alk: log.alk ?? '', no3: log.no3 ?? '', ca: log.ca ?? '',
        mg: log.mg ?? '', ph: log.ph ?? '', sal: log.sal ?? ''
      },
      tags: ['parameter', 'water-test', 'manual-log']
    }, options);
  }

  function classifyAction(action) {
    const title = cleanText(action?.title || action?.name || action?.type, 'Maintenance action');
    const notes = cleanText(action?.notes || action?.detail || action?.description);
    const category = cleanText(action?.category, 'other').toLowerCase();
    const explicitCode = cleanText(action?.actionCode || action?.structuredAction || '').toLowerCase();
    const explicitEquipmentId = cleanText(action?.equipmentId || '').toLowerCase();
    const explicitEquipmentName = cleanText(action?.equipmentName || action?.equipment || '');
    const haystack = `${title} ${notes} ${category} ${explicitCode} ${explicitEquipmentId} ${explicitEquipmentName}`.toLowerCase();

    const mentionsFilterRoller = /\b(filter\s*roller|roller\s*filter|fleece|filter\s*fleece|roller\s*mat)\b/i.test(haystack)
      || explicitEquipmentId === 'filter-roller';
    const replacement = /\b(replac(?:e|ed|ing)|chang(?:e|ed|ing)|new\s+roll|installed?\s+(?:a\s+)?(?:new\s+)?roll|swapp?ed)\b/i.test(haystack);
    const filterRollReplacement = explicitCode === 'filter_roller.fleece_replaced' || (mentionsFilterRoller && replacement);

    if (filterRollReplacement) {
      return {
        eventType: 'maintenance.filter_roller.fleece_replaced',
        actionCode: 'filter_roller.fleece_replaced',
        entity: { type:'equipment', id:'filter-roller', name: explicitEquipmentName || 'Filter Roller' },
        tags: ['maintenance', 'equipment', 'filter-roller', 'fleece', 'replacement']
      };
    }

    const waterChange = explicitCode === 'water_change.completed' || /\bwater\s+change\b/i.test(haystack);
    if (waterChange) {
      return {
        eventType: 'maintenance.water_change.completed',
        actionCode: 'water_change.completed',
        entity: { type:'tank', id:'primary-tank', name:'Display system' },
        tags: ['maintenance', 'water-change']
      };
    }

    return {
      eventType: 'maintenance.action.recorded',
      actionCode: explicitCode || 'maintenance.action.recorded',
      entity: explicitEquipmentId || explicitEquipmentName
        ? { type:'equipment', id: explicitEquipmentId || `equipment-${hashText(explicitEquipmentName)}`, name: explicitEquipmentName }
        : null,
      tags: ['maintenance', category].filter(Boolean)
    };
  }

  function emptyFilterRollState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: null,
      sampling: {
        measurementsPerDay: 3,
        suggestedLocalHours: [8, 14, 20],
        note: 'One to three measurements per day is sufficient for a roll that lasts about a month.'
      },
      currentCycle: null,
      completedCycles: []
    };
  }

  function normalizeMeasurement(input) {
    const nullableClamp = (value, min, max) => value === null || value === undefined || value === '' ? null : clamp(value, min, max);
    const remainingPct = nullableClamp(input?.remainingPct, 0, 100);
    const outerRadius = nullableClamp(input?.apparentOuterRadius, 0, 100000);
    const coreRadius = nullableClamp(input?.apparentCoreRadius, 0, 100000);
    const confidence = nullableClamp(input?.confidence, 0, 1);
    return {
      id: cleanText(input?.id) || `roll-measure-${hashText(`${input?.captureAt || nowIso()}|${remainingPct}|${outerRadius}|${coreRadius}`)}`,
      captureAt: validIso(input?.captureAt || input?.measuredAt || nowIso()),
      remainingPct,
      apparentOuterRadius: outerRadius,
      apparentCoreRadius: coreRadius,
      confidence,
      cameraId: cleanText(input?.cameraId, 'overview'),
      sourceImageId: cleanText(input?.sourceImageId),
      notes: cleanText(input?.notes),
      referenceOnly: input?.referenceOnly === true
    };
  }

  function readFilterRollState() {
    const raw = safeParse(FILTER_ROLL_STATE_KEY, emptyFilterRollState());
    const state = raw && typeof raw === 'object' ? raw : emptyFilterRollState();
    state.schemaVersion = SCHEMA_VERSION;
    state.sampling = { ...emptyFilterRollState().sampling, ...(state.sampling || {}) };
    state.completedCycles = Array.isArray(state.completedCycles) ? state.completedCycles : [];
    if (state.currentCycle && typeof state.currentCycle === 'object') {
      state.currentCycle.measurements = Array.isArray(state.currentCycle.measurements)
        ? state.currentCycle.measurements.map(normalizeMeasurement)
        : [];
      const referenceMeasurementId = cleanText(state.currentCycle.calibration?.referenceMeasurementId);
      if (referenceMeasurementId) state.currentCycle.measurements.forEach(item => { if (item.id === referenceMeasurementId) item.referenceOnly = true; });
    }
    return state;
  }

  function writeFilterRollState(state) {
    const next = {
      ...emptyFilterRollState(),
      ...(state || {}),
      schemaVersion: SCHEMA_VERSION,
      updatedAt: nowIso(),
      completedCycles: (Array.isArray(state?.completedCycles) ? state.completedCycles : []).slice(0, MAX_COMPLETED_ROLLS)
    };
    safeWrite(FILTER_ROLL_STATE_KEY, next);
    return next;
  }

  function summarizeCycle(cycle) {
    const measurements = (Array.isArray(cycle?.measurements) ? cycle.measurements : [])
      .filter(item => Number.isFinite(item.remainingPct) && item.referenceOnly !== true)
      .sort((a, b) => new Date(a.captureAt).getTime() - new Date(b.captureAt).getTime());
    if (!measurements.length) {
      return { measurementCount:0, firstRemainingPct:null, lastRemainingPct:null, observedDays:0, usagePctPerDay:null };
    }
    const first = measurements[0];
    const last = measurements[measurements.length - 1];
    const days = Math.max(0, (new Date(last.captureAt).getTime() - new Date(first.captureAt).getTime()) / 86400000);
    const used = Number(first.remainingPct) - Number(last.remainingPct);
    const usagePctPerDay = days >= 1 && used > 0 ? used / days : null;
    return {
      measurementCount: measurements.length,
      firstRemainingPct: first.remainingPct,
      lastRemainingPct: last.remainingPct,
      observedDays: Number(days.toFixed(2)),
      usagePctPerDay: Number.isFinite(usagePctPerDay) ? Number(usagePctPerDay.toFixed(3)) : null
    };
  }

  function startFilterRollCycle(event) {
    const state = readFilterRollState();
    const eventId = cleanText(event?.id);
    if (state.currentCycle?.replacementEventId === eventId) return state.currentCycle;

    if (state.currentCycle) {
      const closedAt = validIso(event?.occurredAt || nowIso());
      const summary = summarizeCycle(state.currentCycle);
      state.completedCycles.unshift({
        ...state.currentCycle,
        endedAt: closedAt,
        closeReason: 'replacement logged',
        summary
      });
    }

    state.currentCycle = {
      id: `filter-roll-${hashText(eventId || event?.occurredAt || nowIso())}`,
      replacementEventId: eventId,
      startedAt: validIso(event?.occurredAt || nowIso()),
      baselinePending: true,
      cameraReferencePending: true,
      partialCycle: false,
      baselineCaptureAfter: validIso(event?.occurredAt || nowIso()),
      measurements: [],
      calibration: {
        mode:'new-roll',
        fullDiameterMm:100,
        coreDiameterMm:46,
        startingRemainingPct:100,
        apparentFullRadius:null,
        apparentCoreRadius:null,
        referenceMeasurementId:null
      },
      source: 'maintenance-event'
    };
    writeFilterRollState(state);
    return state.currentCycle;
  }

  function recordAction(action, options = {}) {
    if (!action || typeof action !== 'object') return null;
    const classification = classifyAction(action);
    const recordId = canonicalLegacyId('reef_actions', action, options.index || 0);
    const event = upsertEvent({
      eventType: classification.eventType,
      occurredAt: action.isoDate || action.completedAt || action.createdAt || action.date,
      source: { system:'maintenance-log', key:'reef_actions', recordId },
      entity: classification.entity,
      summary: cleanText(action.title || action.name || action.type, 'Maintenance action'),
      details: cleanText(action.notes || action.detail || action.description),
      data: {
        category: cleanText(action.category, 'other'),
        actionCode: classification.actionCode,
        equipmentId: cleanText(action.equipmentId || classification.entity?.id),
        equipmentName: cleanText(action.equipmentName || classification.entity?.name)
      },
      tags: classification.tags
    }, options);

    if (classification.eventType === 'maintenance.filter_roller.fleece_replaced' && !options.suppressSideEffects) {
      startFilterRollCycle(event);
      renderFilterRollIntegrationStatus();
    }
    return event;
  }


  function logFilterRollReplacementFromObserver(options = {}) {
    const confirmed = options.confirmed === true || typeof global.confirm !== 'function' || global.confirm('Log a fleece roll replacement now? This closes the current filter-roll cycle and starts a new 100% roll.');
    if (!confirmed) return { ok:false, cancelled:true };
    const occurredAt = validIso(options.occurredAt || nowIso());
    const id = cleanText(options.id) || `filter-roll-replaced-${hashText(occurredAt)}`;
    const action = {
      id,
      title: cleanText(options.title, 'Replaced filter roller fleece'),
      category: 'equipment',
      notes: cleanText(options.notes, 'Logged from Aquarium Observer filter-roll status.'),
      equipmentId: 'filter-roller',
      equipmentName: 'Filter Roller',
      actionCode: 'filter_roller.fleece_replaced',
      date: new Date(occurredAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
      isoDate: occurredAt
    };
    const actions = safeParse('reef_actions', []);
    const list = Array.isArray(actions) ? actions.filter(item => item && item.id !== id) : [];
    safeWrite('reef_actions', [action, ...list].slice(0, 80));
    const event = recordAction(action);
    try { global.renderActionHistory?.(); } catch (_) {}
    try { global.renderRecentChangesHome?.(); } catch (_) {}
    try { global.renderLongTermSummary?.(); } catch (_) {}
    try { global.ReefKeeperRefreshFilterRollStatus?.(); } catch (_) {}
    try { if (typeof global.showToast === 'function') global.showToast('✅ Fleece replacement logged'); } catch (_) {}
    return { ok:true, action, event, cycle:readFilterRollState().currentCycle };
  }

  function recordCompletedTask(item, options = {}) {
    if (!item || typeof item !== 'object') return null;
    const recordId = canonicalLegacyId('reef_completed_history', item, options.index || 0);
    return upsertEvent({
      eventType: 'task.completed',
      occurredAt: item.completedAt || item.isoDate || item.createdAt || item.date,
      source: { system:'task-history', key:'reef_completed_history', recordId },
      entity: { type:'task', id: cleanText(item.sourceId || item.id || recordId), name: cleanText(item.title, 'Completed task') },
      summary: `Completed: ${cleanText(item.title, 'Task')}`,
      details: cleanText(item.notes || item.detail),
      data: {
        taskType: cleanText(item.type),
        source: cleanText(item.source),
        nextDueAt: item.nextDueAt || null
      },
      tags: ['task', 'completed']
    }, options);
  }

  function recordObserverEvent(input, options = {}) {
    const code = cleanText(input?.code || input?.eventCode, 'observer.event').toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    return upsertEvent({
      eventType: code.startsWith('observer.') ? code : `observer.${code}`,
      occurredAt: input?.occurredAt || input?.createdAt || input?.timestamp,
      source: {
        system:'aquarium-observer',
        key: cleanText(input?.sourceKey, 'observer'),
        recordId: cleanText(input?.id || input?.sourceId || hashText(stableStringify(input)))
      },
      entity: { type:'camera', id: cleanText(input?.cameraId, 'overview'), name: cleanText(input?.cameraName, 'Aquarium Observer') },
      summary: cleanText(input?.summary || input?.title, 'Observer event'),
      details: cleanText(input?.details || input?.message),
      data: input?.data && typeof input.data === 'object' ? input.data : {},
      tags: ['observer', cleanText(input?.cameraId, 'overview')],
      confidence: cleanText(input?.confidence)
    }, options);
  }

  function reconcileFilterRollCyclesFromEvents() {
    const replacements = listEvents({ eventTypes:['maintenance.filter_roller.fleece_replaced'], limit:MAX_EVENTS })
      .slice()
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    const existing = readFilterRollState();
    if (!replacements.length) {
      const manualCurrent = existing.currentCycle?.source === 'manual-existing-roll' ? existing.currentCycle : null;
      const manualCompleted = (Array.isArray(existing.completedCycles) ? existing.completedCycles : [])
        .filter(cycle => !cleanText(cycle?.replacementEventId));
      return writeFilterRollState({ ...existing, currentCycle:manualCurrent, completedCycles:manualCompleted });
    }

    const preserved = new Map();
    const allExisting = [
      ...(Array.isArray(existing.completedCycles) ? existing.completedCycles : []),
      ...(existing.currentCycle ? [existing.currentCycle] : [])
    ];
    allExisting.forEach(cycle => {
      if (cycle?.replacementEventId) preserved.set(cycle.replacementEventId, cycle);
    });

    const cycles = replacements.map((event, index) => {
      const prior = preserved.get(event.id) || {};
      const nextEvent = replacements[index + 1] || null;
      const cycle = {
        ...prior,
        id: prior.id || `filter-roll-${hashText(event.id)}`,
        replacementEventId: event.id,
        startedAt: event.occurredAt,
        baselinePending: Array.isArray(prior.measurements) && prior.measurements.length ? false : true,
        cameraReferencePending: prior.cameraReferencePending !== false,
        partialCycle: prior.partialCycle === true,
        baselineCaptureAfter: prior.baselineCaptureAfter || event.occurredAt,
        measurements: Array.isArray(prior.measurements) ? prior.measurements.map(normalizeMeasurement) : [],
        calibration: prior.calibration && typeof prior.calibration === 'object' ? prior.calibration : {
          mode:'new-roll', fullDiameterMm:100, coreDiameterMm:46, startingRemainingPct:100,
          apparentFullRadius:null, apparentCoreRadius:null, referenceMeasurementId:null
        },
        source:'maintenance-event'
      };
      if (nextEvent) {
        cycle.endedAt = nextEvent.occurredAt;
        cycle.closeReason = 'replacement logged';
        cycle.summary = summarizeCycle(cycle);
      } else {
        delete cycle.endedAt;
        delete cycle.closeReason;
        delete cycle.summary;
      }
      return cycle;
    });

    return writeFilterRollState({
      ...existing,
      currentCycle: cycles[cycles.length - 1],
      completedCycles: [
        ...cycles.slice(0, -1).reverse(),
        ...(Array.isArray(existing.completedCycles) ? existing.completedCycles.filter(cycle => !cleanText(cycle?.replacementEventId)) : [])
      ].slice(0, MAX_COMPLETED_ROLLS)
    });
  }

  function syncLegacySources() {
    const counts = { parameters:0, actions:0, completed:0, pruned:0 };
    const sourceIds = {
      reef_logs: new Set(),
      reef_actions: new Set(),
      reef_completed_history: new Set()
    };
    const logs = safeParse('reef_logs', []);
    if (Array.isArray(logs)) logs.forEach((item, index) => {
      sourceIds.reef_logs.add(canonicalLegacyId('reef_logs', item, index));
      if (recordParameterLog(item, { silent:true, index })) counts.parameters += 1;
    });
    const actions = safeParse('reef_actions', []);
    if (Array.isArray(actions)) actions.forEach((item, index) => {
      sourceIds.reef_actions.add(canonicalLegacyId('reef_actions', item, index));
      if (recordAction(item, { silent:true, index, suppressSideEffects:true })) counts.actions += 1;
    });
    const completed = safeParse('reef_completed_history', []);
    if (Array.isArray(completed)) completed.forEach((item, index) => {
      sourceIds.reef_completed_history.add(canonicalLegacyId('reef_completed_history', item, index));
      if (recordCompletedTask(item, { silent:true, index })) counts.completed += 1;
    });

    const before = readEvents();
    const after = before.filter(event => {
      const ids = sourceIds[event.source?.key];
      return !ids || ids.has(event.source?.recordId);
    });
    counts.pruned = before.length - after.length;
    if (counts.pruned) writeEvents(after);
    reconcileFilterRollCyclesFromEvents();
    renderFilterRollIntegrationStatus();
    return { ...counts, eventCount: readEvents().length, syncedAt: nowIso() };
  }

  function eventPresentation(event) {
    const type = event?.eventType || '';
    if (type === 'parameter.test.recorded') return { integrationKind:'parameter', type:'params', filter:'params', icon:'🧪' };
    if (type === 'task.completed') return { integrationKind:'completed', type:'completed', filter:'completed', icon:'✅' };
    if (type.startsWith('maintenance.')) return { integrationKind:'maintenance', type:'maintenance', filter:'maintenance', icon:type.includes('filter_roller') ? '🧻' : '🛠️' };
    if (type.startsWith('observer.')) return { integrationKind:'observer', type:'observer', filter:'observer', icon:'📹' };
    return { integrationKind:'event', type:'event', filter:'event', icon:'🔗' };
  }

  function getTimelineEvents(options = {}) {
    return listEvents({ limit: options.limit || MAX_EVENTS }).map(event => {
      const view = eventPresentation(event);
      return {
        ...view,
        id: event.id,
        title: event.summary,
        detail: event.details || cleanText(event.data?.actionCode || event.eventType),
        date: event.occurredAt,
        createdAt: event.recordedAt,
        search: `${event.eventType} ${event.summary} ${event.details} ${stableStringify(event.data)} ${event.tags.join(' ')}`,
        sourceKey: event.source?.key || '',
        sourceRecordId: event.source?.recordId || '',
        eventType: event.eventType,
        integrationEvent: true
      };
    });
  }

  function getRecentChanges(limit = 6) {
    return listEvents({ limit: Math.max(1, Number(limit || 6)) }).map(event => {
      const view = eventPresentation(event);
      const date = new Date(event.occurredAt);
      const label = Number.isNaN(date.getTime()) ? 'Recent' : date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
      return {
        id: event.id,
        icon: view.icon,
        title: event.summary,
        meta: `${label} · ${event.eventType.replace(/[._]/g, ' ')}`,
        date: Number.isNaN(date.getTime()) ? 0 : date.getTime(),
        eventType: event.eventType
      };
    });
  }

  function eventRelevanceScore(event, terms) {
    const haystack = `${event.eventType} ${event.summary} ${event.details} ${event.tags.join(' ')} ${stableStringify(event.data)}`.toLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  }

  function getFilterRollLearningSummary() {
    const state = readFilterRollState();
    const cycles = [
      ...(state.currentCycle ? [{ ...state.currentCycle, current:true }] : []),
      ...state.completedCycles.map(cycle => ({ ...cycle, current:false }))
    ];
    const usable = cycles.map(cycle => ({ cycle, summary:summarizeCycle(cycle) }))
      .filter(item => Number.isFinite(item.summary.usagePctPerDay) && item.summary.usagePctPerDay > 0);
    const completedUsable = usable.filter(item => !item.cycle.current);
    const currentSummary = state.currentCycle ? summarizeCycle(state.currentCycle) : null;

    let weightedRate = null;
    if (usable.length) {
      let numerator = 0;
      let denominator = 0;
      usable.forEach((item, index) => {
        const recencyWeight = item.cycle.current ? 2 : Math.max(0.6, 1.4 - index * 0.12);
        const sampleWeight = Math.max(1, Math.min(8, item.summary.measurementCount / 3));
        const weight = recencyWeight * sampleWeight;
        numerator += item.summary.usagePctPerDay * weight;
        denominator += weight;
      });
      weightedRate = denominator ? numerator / denominator : null;
    }

    const currentRemaining = currentSummary?.lastRemainingPct ?? null;
    const estimatedDaysRemaining = Number.isFinite(weightedRate) && weightedRate > 0 && Number.isFinite(currentRemaining)
      ? currentRemaining / weightedRate
      : null;
    const completedRollCount = state.completedCycles.length;
    const stage = completedRollCount >= 2 && usable.length >= 2
      ? 'established'
      : completedRollCount >= 1 || (currentSummary?.measurementCount || 0) >= 10
        ? 'preliminary'
        : 'learning';

    return {
      stage,
      completedRollCount,
      completedRollsWithUsableRate: completedUsable.length,
      currentCycleId: state.currentCycle?.id || null,
      currentMeasurementCount: currentSummary?.measurementCount || 0,
      currentRemainingPct: Number.isFinite(currentRemaining) ? Number(currentRemaining.toFixed(1)) : null,
      usagePctPerDay: Number.isFinite(weightedRate) ? Number(weightedRate.toFixed(3)) : null,
      estimatedDaysRemaining: Number.isFinite(estimatedDaysRemaining) ? Number(estimatedDaysRemaining.toFixed(1)) : null,
      baselinePending: Boolean(state.currentCycle?.baselinePending),
      cameraReferencePending: Boolean(state.currentCycle?.cameraReferencePending),
      partialCycle: Boolean(state.currentCycle?.partialCycle),
      initializationMode: cleanText(state.currentCycle?.calibration?.mode),
      startingRemainingPct: Number.isFinite(Number(state.currentCycle?.calibration?.startingRemainingPct))
        ? Number(Number(state.currentCycle.calibration.startingRemainingPct).toFixed(1)) : null,
      currentDiameterMm: Number.isFinite(Number(state.currentCycle?.calibration?.currentDiameterMm))
        ? Number(state.currentCycle.calibration.currentDiameterMm) : null,
      measurementsPerDay: Number(state.sampling?.measurementsPerDay || 3),
      note: state.currentCycle?.cameraReferencePending
        ? 'The physical starting amount is saved; Observer is waiting for its first outer-edge camera reference.'
        : stage === 'established'
          ? 'Estimate uses the current roll plus prior completed roll cycles.'
          : stage === 'preliminary'
            ? 'Estimate is preliminary and will improve after more completed rolls.'
            : 'Observer is collecting roll measurements; no dependable usage forecast yet.'
    };
  }

  function filterRollRemainingFromDiameters(currentDiameterMm, fullDiameterMm = 100, coreDiameterMm = 46) {
    const current = Number(currentDiameterMm);
    const full = Number(fullDiameterMm);
    const core = Number(coreDiameterMm);
    if (!Number.isFinite(current) || !Number.isFinite(full) || !Number.isFinite(core)) return null;
    if (core <= 0 || full <= core || current <= core || current > full) return null;
    const denominator = (full * full) - (core * core);
    return denominator > 0 ? clamp((((current * current) - (core * core)) / denominator) * 100, 0, 100) : null;
  }

  function remainingFromOuterRadius(outerRadius, calibration) {
    const outer = outerRadius === null || outerRadius === undefined || outerRadius === '' ? null : Number(outerRadius);
    const fullRadius = calibration?.apparentFullRadius === null || calibration?.apparentFullRadius === undefined || calibration?.apparentFullRadius === '' ? null : Number(calibration.apparentFullRadius);
    const coreRadius = calibration?.apparentCoreRadius === null || calibration?.apparentCoreRadius === undefined || calibration?.apparentCoreRadius === '' ? null : Number(calibration.apparentCoreRadius);
    if (![outer, fullRadius, coreRadius].every(Number.isFinite)) return null;
    if (fullRadius <= coreRadius || outer <= 0) return null;
    const denominator = (fullRadius * fullRadius) - (coreRadius * coreRadius);
    return denominator > 0 ? clamp((((outer * outer) - (coreRadius * coreRadius)) / denominator) * 100, 0, 100) : null;
  }

  function initializeExistingFilterRoll(input = {}) {
    const currentDiameterMm = Number(input.currentDiameterMm);
    const fullDiameterMm = Number(input.fullDiameterMm || 100);
    const coreDiameterMm = Number(input.coreDiameterMm || 46);
    const measuredAt = validIso(input.measuredAt || nowIso());
    const startingRemainingPct = filterRollRemainingFromDiameters(currentDiameterMm, fullDiameterMm, coreDiameterMm);
    if (!Number.isFinite(startingRemainingPct)) {
      return { ok:false, error:'Current diameter must be larger than the core and no larger than the full roll.' };
    }

    const state = readFilterRollState();
    if (!state.currentCycle) {
      state.currentCycle = {
        id:`filter-roll-manual-${hashText(measuredAt)}`,
        replacementEventId:'',
        startedAt:measuredAt,
        baselineCaptureAfter:measuredAt,
        measurements:[],
        source:'manual-existing-roll'
      };
    }
    const cycle = state.currentCycle;
    cycle.partialCycle = true;
    cycle.baselinePending = false;
    cycle.cameraReferencePending = true;
    cycle.source = cycle.source || 'manual-existing-roll';
    cycle.calibration = {
      mode:'manual-existing-roll',
      currentDiameterMm:Number(currentDiameterMm.toFixed(2)),
      fullDiameterMm:Number(fullDiameterMm.toFixed(2)),
      coreDiameterMm:Number(coreDiameterMm.toFixed(2)),
      startingRemainingPct:Number(startingRemainingPct.toFixed(3)),
      measuredAt,
      apparentFullRadius:null,
      apparentCoreRadius:null,
      referenceMeasurementId:null
    };

    const manualMeasurement = normalizeMeasurement({
      id:`filter-roll-manual-${hashText(`${cycle.id}|${measuredAt}|${currentDiameterMm}`)}`,
      captureAt:measuredAt,
      remainingPct:startingRemainingPct,
      confidence:1,
      cameraId:'manual',
      notes:`Physical roll diameter ${currentDiameterMm} mm; full ${fullDiameterMm} mm; core ${coreDiameterMm} mm.`
    });
    // Manual re-initialization invalidates any earlier camera baseline for this cycle.
    cycle.measurements = [manualMeasurement];
    cycle.lastMeasurementAt = measuredAt;
    writeFilterRollState(state);

    const event = upsertEvent({
      eventType:'observer.filter_roller.manual_initialized',
      occurredAt:measuredAt,
      source:{ system:'reefkeeper', key:'filter-roll-manual-initialization', recordId:manualMeasurement.id },
      entity:{ type:'equipment', id:'filter-roller', name:'Filter Roller' },
      summary:`Existing filter roll initialized at ${startingRemainingPct.toFixed(1)}% remaining`,
      details:`Physical outside diameter ${currentDiameterMm} mm; full roll ${fullDiameterMm} mm; core ${coreDiameterMm} mm.`,
      data:{ currentDiameterMm, fullDiameterMm, coreDiameterMm, startingRemainingPct, cycleId:cycle.id, partialCycle:true },
      tags:['observer','filter-roller','manual-initialization','partial-cycle']
    });
    const learning = getFilterRollLearningSummary();
    renderFilterRollIntegrationStatus();
    return { ok:true, startingRemainingPct:Number(startingRemainingPct.toFixed(1)), cycle, event, learning };
  }

  function recordFilterRollMeasurement(input) {
    const state = readFilterRollState();
    if (!state.currentCycle) {
      return { ok:false, error:'No active filter-roll cycle. Log a fleece replacement or initialize an existing roll first.' };
    }
    const measurement = normalizeMeasurement(input || {});
    if (!Number.isFinite(measurement.remainingPct) && !Number.isFinite(measurement.apparentOuterRadius)) {
      return { ok:false, error:'A remaining percentage or apparent outer radius measurement is required.' };
    }

    const cycle = state.currentCycle;
    const calibration = cycle.calibration && typeof cycle.calibration === 'object'
      ? cycle.calibration
      : { mode:'new-roll', fullDiameterMm:100, coreDiameterMm:46, startingRemainingPct:100 };
    const outer = measurement.apparentOuterRadius === null || measurement.apparentOuterRadius === undefined ? null : Number(measurement.apparentOuterRadius);
    const existingFullRadius = calibration.apparentFullRadius === null || calibration.apparentFullRadius === undefined || calibration.apparentFullRadius === '' ? null : Number(calibration.apparentFullRadius);
    if (Number.isFinite(outer) && !Number.isFinite(existingFullRadius)) {
      const fullDiameter = Number(calibration.fullDiameterMm || 100);
      const coreDiameter = Number(calibration.coreDiameterMm || 46);
      const currentDiameter = calibration.mode === 'manual-existing-roll'
        ? Number(calibration.currentDiameterMm)
        : fullDiameter;
      const diameterRatio = Number.isFinite(currentDiameter) && fullDiameter > 0 ? currentDiameter / fullDiameter : 1;
      if (diameterRatio > 0) {
        calibration.apparentFullRadius = outer / diameterRatio;
        calibration.apparentCoreRadius = calibration.apparentFullRadius * (coreDiameter / fullDiameter);
        calibration.referenceMeasurementId = measurement.id;
        measurement.referenceOnly = true;
        calibration.referenceCapturedAt = measurement.captureAt;
        cycle.cameraReferencePending = false;
      }
    }
    if (!Number.isFinite(measurement.remainingPct) && Number.isFinite(outer)) {
      measurement.remainingPct = remainingFromOuterRadius(outer, calibration);
    }
    cycle.calibration = calibration;

    const list = Array.isArray(cycle.measurements) ? cycle.measurements.slice() : [];
    const index = list.findIndex(item => item.id === measurement.id || item.captureAt === measurement.captureAt);
    if (index >= 0) list[index] = measurement;
    else list.push(measurement);
    list.sort((a, b) => new Date(a.captureAt).getTime() - new Date(b.captureAt).getTime());
    cycle.measurements = list.slice(-MAX_MEASUREMENTS_PER_ROLL);
    cycle.baselinePending = false;
    cycle.lastMeasurementAt = measurement.captureAt;
    writeFilterRollState(state);

    const event = upsertEvent({
      eventType:'observer.filter_roller.measurement_recorded',
      occurredAt: measurement.captureAt,
      source: { system:'aquarium-observer', key:'filter-roll-measurements', recordId:measurement.id },
      entity: { type:'equipment', id:'filter-roller', name:'Filter Roller' },
      summary: Number.isFinite(measurement.remainingPct)
        ? `Filter roller measured at ${measurement.remainingPct.toFixed(1)}% remaining`
        : 'Filter roller outer-edge measurement recorded',
      details: 'Scheduled low-frequency overview-camera outer-edge measurement.',
      data: { ...measurement, cycleId:cycle.id, calibrationMode:calibration.mode },
      tags: ['observer', 'filter-roller', 'measurement', 'outer-edge']
    });

    const learning = getFilterRollLearningSummary();
    renderFilterRollIntegrationStatus();
    return { ok:true, measurement, event, learning };
  }

  function buildAiContext(question = '', limit = 24) {
    const words = cleanText(question).toLowerCase().match(/[a-z0-9]+/g) || [];
    const stop = new Set(['the','and','for','with','this','that','what','when','where','why','how','tank','reef','should','could','would','about']);
    const terms = Array.from(new Set(words.filter(word => word.length >= 3 && !stop.has(word))));
    const all = listEvents({ limit:120 });
    const selected = all
      .map(event => ({ event, score:eventRelevanceScore(event, terms) }))
      .sort((a, b) => (b.score - a.score) || (new Date(b.event.occurredAt) - new Date(a.event.occurredAt)))
      .slice(0, Math.max(1, Math.min(40, Number(limit || 24))))
      .map(item => item.event);
    const roll = getFilterRollLearningSummary();
    const lines = selected.map(event => {
      const date = new Date(event.occurredAt);
      const label = Number.isNaN(date.getTime()) ? 'Recent' : date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
      return `${label}: ${event.summary}${event.details ? ` — ${event.details}` : ''} [${event.eventType}]`;
    });
    return [
      'SHARED REEF KEEPER EVENT STREAM:',
      'These events are the cross-feature source of truth. A maintenance fact entered once may drive Observer cycles, Timeline, reports, recent changes, and AI context.',
      ...(lines.length ? lines : ['No structured tank events recorded yet.']),
      '',
      `FILTER ROLLER LEARNING: ${roll.stage}; completed rolls ${roll.completedRollCount}; current measurements ${roll.currentMeasurementCount}; remaining ${roll.currentRemainingPct ?? 'unknown'}%; usage/day ${roll.usagePctPerDay ?? 'unknown'}%; estimated days remaining ${roll.estimatedDaysRemaining ?? 'unknown'}. ${roll.note}`
    ].join('\n');
  }

  function formatDisplayDate(value) {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }

  function setElementText(id, value) {
    try {
      const element = global.document?.getElementById(id);
      if (element) element.textContent = String(value ?? '—');
    } catch (_) {}
  }

  function renderFilterRollIntegrationStatus() {
    const state = readFilterRollState();
    const learning = getFilterRollLearningSummary();
    const badge = global.document?.getElementById?.('observer-filter-roll-badge');
    const current = state.currentCycle;

    if (!current) {
      setElementText('observer-filter-roll-summary', 'No active roll cycle yet. Maintenance and Observer are ready to connect.');
      setElementText('observer-filter-roll-started', 'Not logged');
      setElementText('observer-filter-roll-measurements', '0');
      setElementText('observer-filter-roll-sampling', `${learning.measurementsPerDay} per day`);
      setElementText('observer-filter-roll-forecast', 'Waiting');
      setElementText('observer-filter-roll-note', 'Log Filter Roller → Fleece roll replaced in Maintenance to start a connected roll cycle.');
      if (badge) { badge.textContent = 'Waiting'; badge.className = 'observer-health-badge pending'; }
      return learning;
    }

    const remaining = learning.currentRemainingPct === null ? 'Not measured' : `${learning.currentRemainingPct}% remaining`;
    const forecast = learning.estimatedDaysRemaining === null ? learning.stage : `About ${Math.round(learning.estimatedDaysRemaining)} days`;
    const manualLabel = learning.partialCycle && learning.startingRemainingPct !== null
      ? `Physical starting estimate ${learning.startingRemainingPct}%` : '';
    setElementText('observer-filter-roll-summary', learning.cameraReferencePending
      ? `${manualLabel || 'Roll cycle is ready'}. Waiting for the first outer-edge camera reference.`
      : current.baselinePending
        ? 'Replacement received from Maintenance. Waiting for the first overview-camera measurement.'
        : `${remaining} · ${learning.note}`);
    setElementText('observer-filter-roll-started', formatDisplayDate(current.startedAt));
    setElementText('observer-filter-roll-measurements', learning.currentMeasurementCount);
    setElementText('observer-filter-roll-sampling', `${learning.measurementsPerDay} per day`);
    setElementText('observer-filter-roll-forecast', forecast);
    setElementText('observer-filter-roll-note', learning.cameraReferencePending
      ? `Manual initialization saved${learning.currentDiameterMm ? ` from a ${learning.currentDiameterMm} mm outside diameter` : ''}. The current roll is marked as a partial cycle.`
      : current.baselinePending
        ? 'The next scheduled outer-edge analysis will establish the new-roll visual baseline.'
        : `Learning stage: ${learning.stage}. ${learning.completedRollCount} completed roll${learning.completedRollCount === 1 ? '' : 's'} available.`);
    if (badge) {
      badge.textContent = learning.cameraReferencePending ? 'Camera reference pending' : (current.baselinePending ? 'Baseline pending' : (learning.stage === 'established' ? 'Established' : 'Learning'));
      badge.className = `observer-health-badge ${(learning.cameraReferencePending || current.baselinePending) ? 'pending' : 'healthy'}`;
    }
    const setupResult = global.document?.getElementById?.('observer-filter-roll-init-result');
    if (setupResult && learning.startingRemainingPct !== null) {
      setupResult.textContent = `Saved starting estimate: ${learning.startingRemainingPct}% remaining${learning.partialCycle ? ' · partial cycle' : ''}.`;
    }
    return learning;
  }

  function initializeExistingFilterRollFromForm(event) {
    event?.preventDefault?.();
    const current = Number(global.document?.getElementById?.('observer-filter-roll-current-diameter')?.value);
    const full = Number(global.document?.getElementById?.('observer-filter-roll-full-diameter')?.value || 100);
    const core = Number(global.document?.getElementById?.('observer-filter-roll-core-diameter')?.value || 46);
    const result = initializeExistingFilterRoll({ currentDiameterMm:current, fullDiameterMm:full, coreDiameterMm:core });
    const output = global.document?.getElementById?.('observer-filter-roll-init-result');
    if (output) output.textContent = result.ok
      ? `Saved starting estimate: ${result.startingRemainingPct}% remaining · partial cycle.`
      : result.error;
    try { if (typeof global.showToast === 'function') global.showToast(result.ok ? `Filter roll initialized at ${result.startingRemainingPct}%` : result.error); } catch (_) {}
    return result;
  }

  function applyConnectedMaintenancePreset() {
    try {
      const equipment = global.document?.getElementById('action-equipment');
      const actionCode = global.document?.getElementById('action-code');
      const title = global.document?.getElementById('action-title');
      const category = global.document?.getElementById('action-category');
      if (!equipment || !actionCode) return;
      if (actionCode.value === 'filter_roller.fleece_replaced') {
        equipment.value = 'filter-roller';
        if (category) category.value = 'equipment';
        if (title && !title.value.trim()) title.value = 'Replaced filter roller fleece';
      } else if (actionCode.value === 'water_change.completed') {
        if (category) category.value = 'maintenance';
        if (title && !title.value.trim()) title.value = 'Completed water change';
      }
    } catch (_) {}
  }

  function getSystemSnapshot() {
    const events = readEvents();
    const meta = safeParse(EVENT_META_KEY, {});
    return {
      schemaVersion: SCHEMA_VERSION,
      eventCount: events.length,
      latestEvent: events[0] || null,
      updatedAt: meta.updatedAt || null,
      filterRoll: getFilterRollLearningSummary()
    };
  }

  const api = {
    version:'9C.1',
    schemaVersion:SCHEMA_VERSION,
    keys: {
      events:EVENT_STORE_KEY,
      meta:EVENT_META_KEY,
      filterRoll:FILTER_ROLL_STATE_KEY
    },
    upsertEvent,
    removeEventsBySource,
    getLegacyRecordId:canonicalLegacyId,
    listEvents,
    readEvents,
    recordParameterLog,
    recordAction,
    recordCompletedTask,
    recordObserverEvent,
    syncLegacySources,
    getTimelineEvents,
    getRecentChanges,
    buildAiContext,
    getSystemSnapshot,
    getFilterRollState:readFilterRollState,
    getFilterRollLearningSummary,
    filterRollRemainingFromDiameters,
    initializeExistingFilterRoll,
    initializeExistingFilterRollFromForm,
    recordFilterRollMeasurement,
    startFilterRollCycle,
    logFilterRollReplacementFromObserver,
    reconcileFilterRollCyclesFromEvents,
    renderFilterRollIntegrationStatus,
    applyConnectedMaintenancePreset
  };

  global.ReefKeeperIntegration = api;
  global.applyConnectedMaintenancePreset = applyConnectedMaintenancePreset;
  global.initializeExistingFilterRollFromForm = initializeExistingFilterRollFromForm;
  global.logFilterRollReplacementFromObserver = logFilterRollReplacementFromObserver;

  try {
    global.addEventListener?.('reefkeeper:event', renderFilterRollIntegrationStatus);
    global.document?.addEventListener?.('DOMContentLoaded', () => setTimeout(renderFilterRollIntegrationStatus, 0));
  } catch (_) {}

  // Idempotent synchronization. Legacy records are never changed or deleted.
  syncLegacySources();
  renderFilterRollIntegrationStatus();
})(typeof window !== 'undefined' ? window : globalThis);
