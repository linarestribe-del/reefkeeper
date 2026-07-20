/* Reef Keeper Build 1B — Structured Context and Evidence
 * Browser-safe, dependency-free normalization layer.
 * It reads copies of app data supplied by app.js and never mutates user records.
 */
(function initReefKeeperEvidenceEngine(global) {
  'use strict';

  const SCHEMA_VERSION = '1.0';
  const DAY_MS = 86400000;
  const VALID_SOURCE_CLASSES = new Set([
    'verified_tank_data', 'repeated_tank_outcome', 'peer_reviewed', 'expert',
    'manufacturer', 'community_expert', 'community', 'anecdote', 'user_rule',
    'unknown'
  ]);
  const VALID_SOURCE_STATUS = new Set([
    'current', 'review_due', 'superseded', 'historical', 'retracted', 'unknown'
  ]);

  const SOURCE_WEIGHTS = Object.freeze({
    verified_tank_data: 0.96,
    repeated_tank_outcome: 0.88,
    peer_reviewed: 0.96,
    expert: 0.88,
    manufacturer: 0.86,
    community_expert: 0.68,
    community: 0.48,
    anecdote: 0.24,
    user_rule: 0.90,
    unknown: 0.30
  });

  const PARAMS = Object.freeze({
    temp: { label: 'Temperature', unit: '°F', aliases: ['temperature', 'temp', 'heat', 'cooling'] },
    ph: { label: 'pH', unit: '', aliases: ['ph', 'co2', 'carbon dioxide'] },
    orp: { label: 'ORP', unit: 'mV', aliases: ['orp', 'oxidation', 'redox'] },
    po4: { label: 'Phosphate', unit: 'ppm', aliases: ['phosphate', 'po4', 'gfo', 'algae', 'nutrient'] },
    alk: { label: 'Alkalinity', unit: 'dKH', aliases: ['alkalinity', 'alk', 'dkh', 'kalk', 'carbonate'] },
    no3: { label: 'Nitrate', unit: 'ppm', aliases: ['nitrate', 'no3', 'nutrient'] },
    ca: { label: 'Calcium', unit: 'mg/L', aliases: ['calcium', 'ca', 'kalk', 'calcification'] },
    mg: { label: 'Magnesium', unit: 'mg/L', aliases: ['magnesium', 'mg'] },
    sal: { label: 'Salinity', unit: 'SG', aliases: ['salinity', 'specific gravity', 'sg', 'salt'] }
  });

  const TOPIC_GROUPS = Object.freeze({
    equipment: ['equipment', 'pump', 'skimmer', 'heater', 'apex', 'ato', 'roller', 'reactor', 'uv', 'light', 'camera'],
    maintenance: ['maintenance', 'clean', 'replace', 'service', 'water change', 'carbon', 'gfo'],
    livestock: ['fish', 'coral', 'invert', 'anemone', 'livestock', 'acropora', 'hammer', 'wrasse', 'tang'],
    disease: ['disease', 'infection', 'bacterial', 'parasite', 'pest', 'aiptasia', 'tissue', 'recession'],
    dosing: ['dose', 'dosing', 'kalk', 'two part', 'supplement'],
    icp: ['icp', 'trace element', 'iodine', 'tin', 'copper', 'molybdenum', 'barium'],
    visual: ['photo', 'image', 'camera', 'looks', 'algae', 'color', 'polyp', 'clarity']
  });

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function cleanText(value, max = 600) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function parseDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isoDate(value) {
    const d = parseDate(value);
    return d ? d.toISOString() : null;
  }

  function recordTimestamp(item) {
    return isoDate(item && (item.isoDate || item.completedAt || item.updatedAt || item.createdAt || item.date || item.timestamp));
  }

  function stableId(prefix, parts) {
    const source = parts.map(value => String(value == null ? '' : value)).join('|');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(36)}`;
  }

  function ageMs(timestamp, nowMs) {
    const d = parseDate(timestamp);
    return d ? Math.max(0, nowMs - d.getTime()) : null;
  }

  function freshnessFor(kind, timestamp, nowMs) {
    const age = ageMs(timestamp, nowMs);
    if (age === null) return { score: 0.42, label: 'unknown', ageMs: null };

    let currentMs = 14 * DAY_MS;
    let recentMs = 45 * DAY_MS;
    let staleScore = 0.38;

    if (kind === 'apex') {
      currentMs = 5 * 60 * 1000;
      recentMs = 30 * 60 * 1000;
      staleScore = 0.22;
    } else if (kind === 'action' || kind === 'task') {
      currentMs = 30 * DAY_MS;
      recentMs = 120 * DAY_MS;
    } else if (kind === 'inventory' || kind === 'equipment' || kind === 'user_rule') {
      currentMs = 365 * DAY_MS;
      recentMs = 3 * 365 * DAY_MS;
      staleScore = 0.58;
    } else if (kind === 'library') {
      currentMs = 365 * DAY_MS;
      recentMs = 3 * 365 * DAY_MS;
      staleScore = 0.45;
    }

    if (age <= currentMs) return { score: 0.98, label: 'current', ageMs: age };
    if (age <= recentMs) return { score: 0.74, label: 'recent', ageMs: age };
    return { score: staleScore, label: 'stale', ageMs: age };
  }

  function containsTopicTerm(hay, term) {
    const value = String(term || '').toLowerCase();
    if (!value) return false;
    if (/^[a-z0-9]{1,3}$/.test(value)) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(hay);
    }
    return hay.includes(value);
  }

  function detectTopics(text) {
    const hay = cleanText(text, 5000).toLowerCase();
    const topics = new Set();
    Object.entries(PARAMS).forEach(([key, def]) => {
      if (def.aliases.some(alias => containsTopicTerm(hay, alias))) topics.add(key);
    });
    Object.entries(TOPIC_GROUPS).forEach(([topic, terms]) => {
      if (terms.some(term => containsTopicTerm(hay, term))) topics.add(topic);
    });
    return Array.from(topics);
  }

  function relevanceFor(recordTopics, questionTopics) {
    if (!questionTopics.length) return 0.66;
    const matches = (recordTopics || []).filter(topic => questionTopics.includes(topic)).length;
    if (!matches) return 0.22;
    return Math.min(1, 0.58 + (matches * 0.18));
  }

  function sourceWeight(sourceClass) {
    return SOURCE_WEIGHTS[sourceClass] || SOURCE_WEIGHTS.unknown;
  }

  function makeObservation(input, nowMs) {
    const timestamp = isoDate(input.timestamp);
    const freshness = freshnessFor(input.freshnessKind || input.kind || 'manual', timestamp, nowMs);
    const sourceClass = VALID_SOURCE_CLASSES.has(input.sourceClass) ? input.sourceClass : 'unknown';
    const reliability = Number.isFinite(input.reliability) ? input.reliability : sourceWeight(sourceClass);
    const topics = Array.from(new Set([...(input.topics || []), ...detectTopics(`${input.metric || ''} ${input.label || ''} ${input.notes || ''}`)]));
    const id = input.id || stableId('obs', [input.kind, input.metric, timestamp, input.sourceId, input.value, input.label]);
    return {
      id,
      kind: input.kind || 'tank_observation',
      metric: input.metric || null,
      label: cleanText(input.label || (input.metric && PARAMS[input.metric] && PARAMS[input.metric].label) || 'Observation', 120),
      value: input.value == null ? null : input.value,
      unit: input.unit || '',
      timestamp,
      sourceId: input.sourceId || 'local_app',
      sourceClass,
      authority: Number.isFinite(input.authority) ? input.authority : reliability,
      reliability,
      freshness: freshness.score,
      freshnessLabel: freshness.label,
      dataQuality: input.dataQuality || (timestamp ? 'confirmed' : 'timestamp_missing'),
      topics,
      notes: cleanText(input.notes || '', 500),
      status: input.status || 'active'
    };
  }

  function makeEvidence(observation, questionTopics, overrides) {
    const relevance = Number.isFinite(overrides && overrides.relevance)
      ? overrides.relevance
      : relevanceFor(observation.topics, questionTopics);
    const applicability = Number.isFinite(overrides && overrides.applicability) ? overrides.applicability : 0.90;
    const reliability = Number.isFinite(overrides && overrides.reliability) ? overrides.reliability : observation.reliability;
    const effectiveWeight = Math.max(0, Math.min(1, relevance * reliability * observation.freshness * applicability));
    const valueText = observation.value == null ? '' : ` ${observation.value}${observation.unit ? ` ${observation.unit}` : ''}`;
    return {
      id: stableId('ev', [observation.id, questionTopics.join(',')]),
      claim: cleanText((overrides && overrides.claim) || `${observation.label}:${valueText || ` ${observation.notes || 'recorded'}`}`, 360),
      kind: (overrides && overrides.kind) || (observation.kind === 'derived_trend' ? 'derived_trend' : 'tank_observation'),
      direction: (overrides && overrides.direction) || 'neutral',
      sourceId: observation.sourceId,
      observationId: observation.id,
      relevance: Number(relevance.toFixed(3)),
      reliability: Number(reliability.toFixed(3)),
      freshness: Number(observation.freshness.toFixed(3)),
      applicability: Number(applicability.toFixed(3)),
      independenceGroup: (overrides && overrides.independenceGroup) || observation.id,
      limitations: Array.from(new Set([
        ...(overrides && overrides.limitations ? overrides.limitations : []),
        ...(observation.dataQuality === 'timestamp_missing' ? ['Timestamp is missing or unreadable'] : []),
        ...(observation.freshnessLabel === 'stale' ? ['Record is stale for current-state decisions'] : [])
      ])),
      effectiveWeight: Number(effectiveWeight.toFixed(3))
    };
  }

  function normalizeLibrarySource(doc, nowMs) {
    const sourceClass = VALID_SOURCE_CLASSES.has(doc && doc.sourceClass) ? doc.sourceClass : 'unknown';
    const status = VALID_SOURCE_STATUS.has(doc && doc.status) ? doc.status : 'unknown';
    const reviewedAt = isoDate(doc && doc.reviewedAt);
    const publishedAt = isoDate(doc && doc.publishedAt);
    const createdAt = isoDate(doc && (doc.createdAt || doc.updatedAt));
    const freshness = freshnessFor('library', reviewedAt || publishedAt || createdAt, nowMs);
    const title = cleanText(doc && (doc.title || doc.fileName) || 'Untitled document', 180);
    const topics = Array.from(new Set([...(Array.isArray(doc && doc.topics) ? doc.topics : []), ...detectTopics(`${title} ${doc && doc.category || ''} ${doc && doc.text || ''}`)]));
    return {
      id: String(doc && doc.id || stableId('source', [title, createdAt])),
      title,
      sourceClass,
      publisher: cleanText(doc && doc.publisher || '', 160),
      authors: Array.isArray(doc && doc.authors) ? doc.authors.map(a => cleanText(a, 100)).filter(Boolean) : [],
      publishedAt,
      reviewedAt,
      validFrom: isoDate(doc && doc.validFrom),
      validUntil: isoDate(doc && doc.validUntil),
      status,
      scope: topics,
      equipmentModels: Array.isArray(doc && doc.equipmentModels) ? doc.equipmentModels.map(v => cleanText(v, 120)).filter(Boolean) : [],
      firmwareVersions: Array.isArray(doc && doc.firmwareVersions) ? doc.firmwareVersions.map(v => cleanText(v, 80)).filter(Boolean) : [],
      trust: {
        baseWeight: Number((doc && doc.trust && Number.isFinite(Number(doc.trust.baseWeight))
          ? Number(doc.trust.baseWeight)
          : sourceWeight(sourceClass)).toFixed(3)),
        reason: cleanText(doc && doc.trust && doc.trust.reason || (sourceClass === 'unknown' ? 'Source has not been classified yet' : `Default ${sourceClass} weight`), 220)
      },
      freshness: freshness.score,
      freshnessLabel: freshness.label,
      supersededBy: Array.isArray(doc && doc.supersededBy) ? doc.supersededBy.map(String) : [],
      contentRef: String(doc && doc.id || ''),
      excerpt: cleanText(doc && doc.text || '', 900)
    };
  }

  function normalizeParameterLogs(logs, nowMs) {
    const observations = [];
    (Array.isArray(logs) ? logs : []).forEach((log, index) => {
      if (!log || typeof log !== 'object') return;
      const timestamp = recordTimestamp(log);
      Object.entries(PARAMS).forEach(([metric, def]) => {
        if (metric === 'temp' || metric === 'orp') return;
        const value = numberOrNull(log[metric]);
        if (value === null) return;
        observations.push(makeObservation({
          kind: 'manual_test', freshnessKind: 'manual', metric, value, unit: def.unit,
          timestamp, sourceId: String(log.id || `parameter_log_${index}`), sourceClass: 'verified_tank_data',
          reliability: timestamp ? 0.93 : 0.72, authority: 0.92,
          dataQuality: timestamp ? 'confirmed_manual_test' : 'timestamp_missing',
          notes: cleanText(log.notes || '', 240), topics: [metric]
        }, nowMs));
      });
    });
    return observations;
  }

  function normalizeApex(status, nowMs) {
    if (!status || !status.ok) return [];
    const raw = status.raw && status.raw.istat ? status.raw.istat : {};
    const inputs = Array.isArray(raw.inputs) ? raw.inputs : [];
    const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];
    const inputMap = Object.fromEntries(inputs.filter(Boolean).map(item => [String(item.name || ''), item]));
    const outputMap = Object.fromEntries(outputs.filter(Boolean).map(item => [String(item.name || ''), item]));
    const timestamp = status.receivedAt || status.piTimestamp || null;
    const result = [];

    const addProbe = (name, metric, unit) => {
      const item = inputMap[name];
      const value = numberOrNull(item && item.value);
      if (value === null) return;
      result.push(makeObservation({
        kind: 'apex_probe', freshnessKind: 'apex', metric, value, unit, timestamp,
        sourceId: `apex_${name}`, sourceClass: 'verified_tank_data', reliability: 0.96,
        authority: 0.98, dataQuality: 'live_controller_telemetry', topics: [metric, 'equipment']
      }, nowMs));
    };
    addProbe('Tmp', 'temp', '°F');
    addProbe('pH', 'ph', '');
    addProbe('ORP', 'orp', 'mV');
    addProbe('Sal', 'sal', 'ppt');
    addProbe('Cond', 'sal', 'mS/cm');

    ['Return1','Return2','UVpump','UVlight','Skimmer','LMP40','RMP40','FilterRoller','GFO','ATO','Kalkstirrer','Kalkpump','NOPOX','Fan','Heat1','Heat2'].forEach(name => {
      const item = outputMap[name];
      const state = item && Array.isArray(item.status) ? item.status[0] : null;
      if (state == null) return;
      result.push(makeObservation({
        kind: 'equipment_state', freshnessKind: 'apex', label: name, value: String(state), timestamp,
        sourceId: `apex_output_${name}`, sourceClass: 'verified_tank_data', reliability: 0.95,
        authority: 0.96, dataQuality: 'live_controller_state', topics: ['equipment']
      }, nowMs));
    });

    ['Leak1','Leak2','Leak3'].forEach(name => {
      const item = inputMap[name];
      if (!item || item.value == null) return;
      result.push(makeObservation({
        kind: 'safety_input', freshnessKind: 'apex', label: name, value: String(item.value), timestamp,
        sourceId: `apex_input_${name}`, sourceClass: 'verified_tank_data', reliability: 0.96,
        authority: 0.98, dataQuality: 'live_controller_input', topics: ['equipment', 'maintenance']
      }, nowMs));
    });
    return result;
  }

  function normalizeSimpleRecords(collection, options, nowMs) {
    const list = Array.isArray(collection) ? collection : [];
    return list.map((item, index) => {
      const text = cleanText(options.text(item), options.maxText || 500);
      if (!text) return null;
      return makeObservation({
        kind: options.kind,
        freshnessKind: options.freshnessKind || options.kind,
        label: options.label(item),
        value: options.value ? options.value(item) : null,
        timestamp: recordTimestamp(item),
        sourceId: String(item && item.id || `${options.kind}_${index}`),
        sourceClass: options.sourceClass || 'verified_tank_data',
        reliability: options.reliability || 0.84,
        authority: options.authority || 0.80,
        dataQuality: recordTimestamp(item) ? 'confirmed_app_record' : 'timestamp_missing',
        notes: text,
        topics: options.topics ? options.topics(item) : detectTopics(text),
        status: item && item.status || 'active'
      }, nowMs);
    }).filter(Boolean);
  }

  function normalizeKnowledge(items, nowMs) {
    return (Array.isArray(items) ? items : []).map((item, index) => makeObservation({
      kind: 'user_rule', freshnessKind: 'user_rule', label: item && item.title || 'Tank rule', value: null,
      timestamp: recordTimestamp(item), sourceId: String(item && item.id || `tank_rule_${index}`),
      sourceClass: 'user_rule', reliability: item && item.locked ? 0.96 : 0.88,
      authority: item && item.locked ? 0.98 : 0.88,
      dataQuality: 'user_confirmed_rule', notes: cleanText(item && (item.note || item.notes) || '', 500),
      topics: detectTopics(`${item && item.category || ''} ${item && item.title || ''} ${item && item.note || ''}`)
    }, nowMs));
  }

  function buildTrends(parameterObservations, nowMs) {
    const trends = [];
    Object.keys(PARAMS).forEach(metric => {
      const points = parameterObservations
        .filter(obs => obs.metric === metric && typeof obs.value === 'number' && obs.timestamp)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (points.length < 2) return;
      const recent = points.slice(-8);
      const first = recent[0];
      const latest = recent[recent.length - 1];
      const delta = latest.value - first.value;
      const threshold = metric === 'sal' ? 0.0005 : metric === 'po4' || metric === 'ph' ? 0.01 : 0.1;
      const direction = Math.abs(delta) < threshold ? 'stable' : delta > 0 ? 'rising' : 'falling';
      trends.push(makeObservation({
        kind: 'derived_trend', freshnessKind: 'manual', metric, label: `${PARAMS[metric].label} trend`,
        value: direction, unit: '', timestamp: latest.timestamp, sourceId: `trend_${metric}`,
        sourceClass: 'verified_tank_data', reliability: recent.length >= 4 ? 0.86 : 0.72,
        authority: 0.82, dataQuality: recent.length >= 4 ? 'multi_point_trend' : 'limited_points',
        notes: `${recent.length} readings; ${first.value} to ${latest.value}${PARAMS[metric].unit ? ` ${PARAMS[metric].unit}` : ''}; delta ${Number(delta.toFixed(3))}.`,
        topics: [metric]
      }, nowMs));
    });
    return trends;
  }

  function selectCurrentState(observations) {
    const current = {};
    Object.keys(PARAMS).forEach(metric => {
      const candidates = observations
        .filter(obs => obs.metric === metric && obs.value != null && obs.kind !== 'derived_trend')
        .sort((a, b) => {
          const authorityDiff = (b.authority * b.freshness) - (a.authority * a.freshness);
          if (Math.abs(authorityDiff) > 0.001) return authorityDiff;
          return (parseDate(b.timestamp)?.getTime() || 0) - (parseDate(a.timestamp)?.getTime() || 0);
        });
      if (candidates.length) current[metric] = candidates[0];
    });
    return current;
  }

  function findConflicts(observations, currentState) {
    const conflicts = [];
    const livePh = observations.find(obs => obs.metric === 'ph' && obs.kind === 'apex_probe');
    const manualPh = observations
      .filter(obs => obs.metric === 'ph' && obs.kind === 'manual_test')
      .sort((a, b) => (parseDate(b.timestamp)?.getTime() || 0) - (parseDate(a.timestamp)?.getTime() || 0))[0];
    if (livePh && manualPh && Math.abs(Number(livePh.value) - Number(manualPh.value)) >= 0.15) {
      conflicts.push({
        id: stableId('conflict', [livePh.id, manualPh.id]),
        type: 'measurement_difference', metric: 'ph', severity: 'watch',
        summary: `Live Apex pH ${livePh.value} differs from the latest manual pH ${manualPh.value}.`,
        explanation: 'The readings may reflect different times or methods; neither is silently discarded.',
        observationIds: [livePh.id, manualPh.id]
      });
    }
    Object.entries(currentState).forEach(([metric, selected]) => {
      if (selected.freshnessLabel === 'stale') {
        conflicts.push({
          id: stableId('quality', [selected.id, 'stale']), type: 'stale_authoritative_value', metric,
          severity: 'data_gap', summary: `${selected.label} is based on stale data.`,
          explanation: 'Confirm a current reading before making a consequential change.', observationIds: [selected.id]
        });
      }
    });
    return conflicts;
  }

  function collectContext(input) {
    const options = input || {};
    const nowMs = parseDate(options.now)?.getTime() || Date.now();
    const question = cleanText(options.question || '', 3000);
    const questionTopics = detectTopics(question);
    const observations = [];

    const parameterObservations = normalizeParameterLogs(options.logs, nowMs);
    observations.push(...parameterObservations);
    observations.push(...normalizeApex(options.apexStatus, nowMs));
    observations.push(...buildTrends(parameterObservations, nowMs));
    observations.push(...normalizeKnowledge(options.knowledge, nowMs));

    observations.push(...normalizeSimpleRecords(options.actions, {
      kind: 'action', label: item => item && (item.title || item.category) || 'Tank action',
      text: item => `${item && item.title || ''}${item && item.category ? ` (${item.category})` : ''}${item && item.notes ? ` — ${item.notes}` : ''}`,
      topics: item => detectTopics(`${item && item.title || ''} ${item && item.category || ''} ${item && item.notes || ''}`),
      reliability: 0.86
    }, nowMs));

    observations.push(...normalizeSimpleRecords(options.completedHistory, {
      kind: 'action', label: item => item && item.title || 'Completed task',
      text: item => `Completed ${item && item.title || 'task'}${item && item.notes ? ` — ${item.notes}` : ''}`,
      topics: item => detectTopics(`${item && item.title || ''} ${item && item.notes || ''}`),
      reliability: 0.86
    }, nowMs));

    observations.push(...normalizeSimpleRecords(options.reminders, {
      kind: 'task', label: item => item && item.title || 'Active task',
      text: item => `${item && item.title || 'Active task'}${item && item.notes ? ` — ${item.notes}` : ''}`,
      topics: item => detectTopics(`${item && item.title || ''} ${item && item.notes || ''}`),
      reliability: 0.78
    }, nowMs));

    observations.push(...normalizeSimpleRecords(options.inventory, {
      kind: 'inventory', label: item => item && item.name || 'Livestock',
      text: item => `${item && item.name || ''}; type ${item && item.type || 'unknown'}; status ${item && item.status || 'unknown'}; location ${item && item.location || 'unknown'}; ${item && item.notes || ''}`,
      topics: item => ['livestock', ...detectTopics(`${item && item.name || ''} ${item && item.notes || ''}`)],
      reliability: 0.84
    }, nowMs));

    observations.push(...normalizeSimpleRecords(options.equipment, {
      kind: 'equipment', label: item => item && item.name || 'Equipment',
      text: item => `${item && item.name || ''}; ${item && item.brand || ''} ${item && item.model || ''}; status ${item && item.status || 'active'}; ${item && item.notes || ''}`,
      topics: item => ['equipment', ...detectTopics(`${item && item.name || ''} ${item && item.brand || ''} ${item && item.model || ''} ${item && item.notes || ''}`)],
      reliability: 0.84
    }, nowMs));

    const sources = (Array.isArray(options.library) ? options.library : [])
      .map(doc => normalizeLibrarySource(doc, nowMs));

    const allowedSources = sources.filter(source => !['superseded', 'retracted', 'historical'].includes(source.status));
    const selectedSources = allowedSources
      .map(source => ({ ...source, relevance: relevanceFor(source.scope, questionTopics) }))
      .filter(source => source.relevance > 0.22 || !questionTopics.length)
      .sort((a, b) => (b.relevance * b.trust.baseWeight * b.freshness) - (a.relevance * a.trust.baseWeight * a.freshness))
      .slice(0, 6);

    const currentState = selectCurrentState(observations);
    const conflicts = findConflicts(observations, currentState);

    const evidence = observations
      .map(obs => makeEvidence(obs, questionTopics))
      .sort((a, b) => b.effectiveWeight - a.effectiveWeight);

    const selectedObservationIds = new Set();
    Object.values(currentState).forEach(obs => selectedObservationIds.add(obs.id));
    evidence.slice(0, 18).forEach(ev => selectedObservationIds.add(ev.observationId));
    conflicts.forEach(conflict => conflict.observationIds.forEach(id => selectedObservationIds.add(id)));

    const selectedObservations = observations
      .filter(obs => selectedObservationIds.has(obs.id))
      .sort((a, b) => (parseDate(b.timestamp)?.getTime() || 0) - (parseDate(a.timestamp)?.getTime() || 0))
      .slice(0, 24);

    const issues = [];
    if (!parameterObservations.length) issues.push('No saved manual chemistry tests were available.');
    const apexObs = observations.filter(obs => obs.kind === 'apex_probe' || obs.kind === 'equipment_state');
    if (!apexObs.length) issues.push('Live Apex evidence was unavailable.');
    if (apexObs.some(obs => obs.freshnessLabel === 'stale')) issues.push('One or more Apex records are stale.');
    if (observations.some(obs => obs.dataQuality === 'timestamp_missing')) issues.push('Some local records have missing or unreadable timestamps.');
    if (sources.some(source => source.sourceClass === 'unknown')) issues.push('Some Reef Library documents have not been source-classified.');

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date(nowMs).toISOString(),
      question: { text: question, topics: questionTopics },
      currentState,
      observations: selectedObservations,
      evidence: evidence.slice(0, 18),
      sources: selectedSources,
      conflicts,
      dataQuality: {
        status: issues.length ? 'limitations_present' : 'good',
        issues,
        counts: {
          allObservations: observations.length,
          selectedObservations: selectedObservations.length,
          evidence: Math.min(18, evidence.length),
          librarySources: sources.length,
          selectedSources: selectedSources.length
        }
      }
    };
  }

  function compactCurrentState(currentState) {
    const result = {};
    Object.entries(currentState || {}).forEach(([metric, obs]) => {
      result[metric] = {
        value: obs.value, unit: obs.unit, observedAt: obs.timestamp,
        source: obs.sourceId, freshness: obs.freshnessLabel, dataQuality: obs.dataQuality
      };
    });
    return result;
  }

  function toPromptBlock(context) {
    if (!context || context.schemaVersion !== SCHEMA_VERSION) return '';
    const payload = {
      schemaVersion: context.schemaVersion,
      generatedAt: context.generatedAt,
      questionTopics: context.question && context.question.topics || [],
      currentAuthoritativeState: compactCurrentState(context.currentState),
      relevantObservations: (context.observations || []).map(obs => ({
        id: obs.id, kind: obs.kind, label: obs.label, value: obs.value, unit: obs.unit,
        observedAt: obs.timestamp, sourceClass: obs.sourceClass, freshness: obs.freshnessLabel,
        dataQuality: obs.dataQuality, notes: obs.notes
      })),
      evidence: context.evidence || [],
      trustedKnowledgeSources: (context.sources || []).map(source => ({
        id: source.id, title: source.title, sourceClass: source.sourceClass,
        status: source.status, freshness: source.freshnessLabel, topics: source.scope,
        baseWeight: source.trust.baseWeight, excerpt: source.excerpt
      })),
      conflicts: context.conflicts || [],
      dataQuality: context.dataQuality || {}
    };
    return `\n\nSTRUCTURED EVIDENCE CONTEXT (Reef Keeper schema ${SCHEMA_VERSION}):\nUse this block as the normalized interpretation of local tank records. Preserve timestamps and source distinctions. Do not treat missing or stale data as current. The legacy context above remains available during migration, but this structured block is authoritative when the two conflict.\n${JSON.stringify(payload)}`;
  }

  const api = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    sourceWeights: SOURCE_WEIGHTS,
    detectTopics,
    normalizeLibrarySource,
    collectContext,
    toPromptBlock
  });

  global.ReefKeeperAIContext = api;
})(typeof window !== 'undefined' ? window : globalThis);
