/* Reef Keeper Maintenance 9I — conservative filter-roll confidence and forecast handling.
 * Browser global: window.ReefKeeperFilterRollEngine
 * Node/CommonJS export is included for verification tests.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReefKeeperFilterRollEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  const VERSION = '9I';
  const DEFAULT_CONFIG = Object.freeze({
    partialCycle: true,
    partialCycleLabel: 'Partial cycle — roll already in use',
    currentDiameterMm: 85,
    newRollDiameterMm: 100,
    coreDiameterMm: 46,
    initializedAt: '',
    source: 'Maintenance 9C existing-roll initialization',
    scheduleHoursLocal: [9, 15],
    minSpacingMinutes: 240
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const finite = value => {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const text = value => String(value == null ? '' : value).trim();
  const lower = value => text(value).toLowerCase();
  const asDateMs = value => {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const iso = value => {
    const ms = asDateMs(value);
    return ms == null ? '' : new Date(ms).toISOString();
  };

  function calculateRemainingPercent(diameterMm, newRollDiameterMm, coreDiameterMm) {
    const diameter = finite(diameterMm);
    const full = finite(newRollDiameterMm);
    const core = finite(coreDiameterMm);
    if (diameter == null || full == null || core == null) return null;
    if (full <= core || diameter < core) return null;
    const usableFullArea = (full * full) - (core * core);
    const usableCurrentArea = (diameter * diameter) - (core * core);
    if (usableFullArea <= 0) return null;
    return clamp((usableCurrentArea / usableFullArea) * 100, 0, 100);
  }

  function calculateDiameterFromRemainingPercent(remainingPercent, newRollDiameterMm, coreDiameterMm) {
    const remaining = finite(remainingPercent);
    const full = finite(newRollDiameterMm);
    const core = finite(coreDiameterMm);
    if (remaining == null || full == null || core == null) return null;
    if (full <= core || core < 0) return null;
    const usableFullArea = (full * full) - (core * core);
    const diameterSquared = (clamp(remaining, 0, 100) / 100) * usableFullArea + (core * core);
    return diameterSquared >= 0 ? Math.sqrt(diameterSquared) : null;
  }

  function calculateRemainingFromRadius(apparentOuterRadius, apparentFullRadius, apparentCoreRadius) {
    const outer = finite(apparentOuterRadius);
    const full = finite(apparentFullRadius);
    const core = finite(apparentCoreRadius);
    if (outer == null || full == null || core == null || full <= core || outer <= 0) return null;
    const usableFullArea = (full * full) - (core * core);
    const usableCurrentArea = (outer * outer) - (core * core);
    if (usableFullArea <= 0) return null;
    return clamp((usableCurrentArea / usableFullArea) * 100, 0, 100);
  }

  function confidenceNumber(value) {
    if (value == null || value === '') return null;
    const number = finite(value);
    if (number != null) return clamp(number > 1 ? number / 100 : number, 0, 1);
    const label = lower(value);
    if (label.includes('high')) return 0.9;
    if (label.includes('medium') || label.includes('moderate')) return 0.7;
    if (label.includes('low')) return 0.4;
    if (label.includes('learn')) return 0.25;
    return null;
  }

  function firstValue(object, keys) {
    if (!object || typeof object !== 'object') return null;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key) && object[key] != null && object[key] !== '') {
        return object[key];
      }
    }
    return null;
  }

  function firstFinite(object, keys) {
    const value = firstValue(object, keys);
    return finite(value);
  }

  function firstText(object, keys) {
    const value = firstValue(object, keys);
    return value == null ? '' : text(value);
  }

  const DIAMETER_KEYS = [
    'outerDiameterMm', 'rollDiameterMm', 'diameterMm', 'measuredDiameterMm',
    'filterRollDiameterMm', 'fleeceRollDiameterMm', 'currentDiameterMm'
  ];
  const PERCENT_KEYS = [
    'remainingPercent', 'percentRemaining', 'remainingPct', 'rollRemainingPercent',
    'filterRollRemainingPercent', 'fleeceRemainingPercent', 'percentageRemaining'
  ];
  const CONFIDENCE_KEYS = [
    'confidence', 'measurementConfidence', 'confidenceScore', 'detectorConfidence',
    'filterRollConfidence', 'quality'
  ];
  const TIME_KEYS = [
    'measuredAt', 'attemptedAt', 'capturedAt', 'timestamp', 'createdAt', 'updatedAt', 'receivedAt',
    'captureTime', 'imageTimestamp', 'date'
  ];
  const CAPTURE_KEYS = [
    'captureKey', 'imageKey', 'captureId', 'imageId', 'fileName', 'filename', 'path',
    'blobPath', 'sha256', 'hash', 'sourceId', 'measurementId', 'sourceImageId', 'id'
  ];

  function isRollRelated(value, path) {
    const haystack = `${path || ''} ${Object.keys(value || {}).join(' ')}`.toLowerCase();
    return /filter.?roll|roller.?mat|fleece|roll.?cycle|outer.?diameter/.test(haystack);
  }

  function normalizeAccepted(raw) {
    if (!raw || typeof raw !== 'object') return true;
    const explicit = firstValue(raw, ['accepted', 'valid', 'usable', 'includedInTrend', 'isValid']);
    if (typeof explicit === 'boolean') return explicit;
    if (explicit != null) {
      const normalized = lower(explicit);
      if (['false', 'no', '0', 'rejected', 'invalid', 'failed'].includes(normalized)) return false;
      if (['true', 'yes', '1', 'accepted', 'valid', 'ok', 'healthy'].includes(normalized)) return true;
    }
    const status = lower(firstText(raw, ['status', 'measurementStatus', 'result', 'state']));
    if (/reject|invalid|fail|error|unusable|obstruct/.test(status)) return false;
    return true;
  }

  function normalizeMeasurement(raw, path, config) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const related = isRollRelated(raw, path);
    const diameterMm = firstFinite(raw, DIAMETER_KEYS);
    const rawPercent = firstFinite(raw, PERCENT_KEYS);
    const apparentOuterRadius = firstFinite(raw, ['apparentOuterRadius', 'outerRadiusPx']);
    if (!related && diameterMm == null && rawPercent == null && apparentOuterRadius == null) return null;

    const timestamp = iso(firstValue(raw, TIME_KEYS));
    const captureKey = firstText(raw, CAPTURE_KEYS);
    const measurementSignal = Boolean(
      timestamp || captureKey || rawPercent != null || apparentOuterRadius != null ||
      /measurement|history|reading|detection|latest|capture/i.test(path || '') ||
      firstValue(raw, ['measuredDiameterMm', 'outerDiameterMm', 'rollDiameterMm', 'filterRollDiameterMm', 'fleeceRollDiameterMm']) != null
    );
    if (!measurementSignal) return null;
    const statusText = lower(firstText(raw, ['status', 'measurementStatus', 'result', 'state']));
    const accepted = normalizeAccepted(raw) && !/attention|reject|invalid|fail|error|unusable|obstruct/.test(statusText);
    const reason = firstText(raw, ['reason', 'rejectionReason', 'error', 'warning', 'detail', 'notes', 'message']);
    const confidence = confidenceNumber(firstValue(raw, CONFIDENCE_KEYS));
    const derivedPercent = diameterMm == null ? null : calculateRemainingPercent(
      diameterMm,
      firstFinite(raw, ['newRollDiameterMm', 'fullDiameterMm']) || config.newRollDiameterMm,
      firstFinite(raw, ['coreDiameterMm', 'coreOutsideDiameterMm']) || config.coreDiameterMm
    );
    const remainingPercent = rawPercent == null ? derivedPercent : clamp(rawPercent, 0, 100);
    if (diameterMm == null && remainingPercent == null && apparentOuterRadius == null) return null;

    const cameraId = lower(firstText(raw, ['cameraId', 'camera', 'sourceType']));
    const sourceType = cameraId === 'manual' || /manual/.test(path || '') ? 'manual' : 'camera';
    const id = captureKey || [timestamp, diameterMm, remainingPercent, apparentOuterRadius, path].filter(v => v !== '' && v != null).join('|');
    return {
      id,
      captureKey,
      measuredAt: timestamp,
      measuredAtMs: asDateMs(timestamp),
      diameterMm,
      remainingPercent,
      apparentOuterRadius,
      confidence,
      accepted,
      reason,
      sourceType,
      sourcePath: path || '',
      referenceOnly: raw.referenceOnly === true,
      raw
    };
  }

  function walkMeasurements(value, path, config, output, seen, depth) {
    if (value == null || depth > 10) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walkMeasurements(item, `${path}[${index}]`, config, output, seen, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;

    const normalized = normalizeMeasurement(value, path, config);
    if (normalized) {
      const key = normalized.captureKey || normalized.id;
      if (key && !seen.has(key)) {
        seen.add(key);
        output.push(normalized);
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === 'object') walkMeasurements(child, path ? `${path}.${key}` : key, config, output, seen, depth + 1);
    }
  }

  function extractMeasurements(sources, config) {
    const output = [];
    const seen = new Set();
    (Array.isArray(sources) ? sources : [sources]).forEach((source, index) => {
      walkMeasurements(source, `source${index}`, config, output, seen, 0);
    });
    return dedupeMeasurements(output).sort((a, b) => (b.measuredAtMs || 0) - (a.measuredAtMs || 0));
  }

  function measurementDedupeKey(item) {
    const captureKey = text(item?.captureKey || item?.sourceImageId || '');
    if (captureKey) return `capture:${captureKey}`;
    const ms = asDateMs(item?.measuredAt || item?.captureAt || item?.attemptedAt);
    if (Number.isFinite(ms)) {
      const minute = Math.round(ms / 60000);
      const source = lower(item?.sourceType || item?.cameraId || 'camera');
      return `time:${source}:${minute}`;
    }
    return `value:${[item?.id, item?.diameterMm, item?.remainingPercent, item?.apparentOuterRadius].join('|')}`;
  }

  function measurementQualityScore(item) {
    if (!item) return -1;
    let score = 0;
    if (item.accepted) score += 100;
    if (item.referenceOnly) score += 15;
    if (Number.isFinite(item.remainingPercent)) score += 30;
    if (Number.isFinite(item.diameterMm)) score += 12;
    if (Number.isFinite(item.apparentOuterRadius)) score += 10;
    if (Number.isFinite(item.confidence)) score += item.confidence * 10;
    const reason = lower(item.reason || item.message || item.analysisMessage || '');
    if (/waiting for the next scheduled/.test(reason) && !Number.isFinite(item.apparentOuterRadius) && !Number.isFinite(item.remainingPercent)) score -= 30;
    return score;
  }

  function dedupeMeasurements(measurements) {
    const map = new Map();
    (measurements || []).forEach(item => {
      if (!item) return;
      const key = measurementDedupeKey(item);
      const previous = map.get(key);
      if (!previous || measurementQualityScore(item) > measurementQualityScore(previous)) map.set(key, item);
    });
    return Array.from(map.values());
  }

  function discoverConfig(sources) {
    const found = {};
    const visited = new Set();
    function walk(value, path, depth) {
      if (!value || typeof value !== 'object' || depth > 9 || visited.has(value)) return;
      visited.add(value);
      if (!Array.isArray(value)) {
        const related = isRollRelated(value, path);
        const full = firstFinite(value, ['newRollDiameterMm', 'fullDiameterMm', 'unusedRollDiameterMm']);
        const core = firstFinite(value, ['coreDiameterMm', 'coreOutsideDiameterMm', 'spindleDiameterMm']);
        const current = firstFinite(value, ['currentDiameterMm', 'startingDiameterMm', 'initialDiameterMm']);
        if (related || full != null || core != null || current != null) {
          if (full != null && !found.newRollDiameterMm) found.newRollDiameterMm = full;
          if (core != null && !found.coreDiameterMm) found.coreDiameterMm = core;
          if (current != null && !found.currentDiameterMm) found.currentDiameterMm = current;
          const partial = firstValue(value, ['partialCycle', 'existingRollInUse', 'isPartialCycle']);
          if (typeof partial === 'boolean' && found.partialCycle == null) found.partialCycle = partial;
          const initializedAt = firstValue(value, ['initializedAt', 'startedAt', 'cycleStartedAt', 'installedAt']);
          if (initializedAt && !found.initializedAt) found.initializedAt = iso(initializedAt);
          const cycleId = firstText(value, ['rollCycleId', 'currentCycleId', 'filterRollCycleId', 'cycleId']);
          if (cycleId && !found.cycleId) found.cycleId = cycleId;
          const cycleStartedAt = firstValue(value, ['cycleStartedAt', 'rollInstalledAt', 'cycleInitializedAt', 'startedAt']);
          if (cycleStartedAt && !found.cycleStartedAt) found.cycleStartedAt = iso(cycleStartedAt);
        }
      }
      Object.entries(value).forEach(([key, child]) => {
        if (child && typeof child === 'object') walk(child, path ? `${path}.${key}` : key, depth + 1);
      });
    }
    (Array.isArray(sources) ? sources : [sources]).forEach((source, index) => walk(source, `source${index}`, 0));
    return {
      ...DEFAULT_CONFIG,
      ...found,
      partialCycleLabel: found.partialCycle === false ? 'Full cycle' : DEFAULT_CONFIG.partialCycleLabel
    };
  }

  function spanDays(measurements) {
    const validTimes = measurements.map(item => item.measuredAtMs).filter(Number.isFinite);
    if (validTimes.length < 2) return 0;
    return (Math.max(...validTimes) - Math.min(...validTimes)) / 86400000;
  }

  function slopePercentPerDay(measurements) {
    const points = measurements
      .filter(item => item.accepted && item.referenceOnly !== true && Number.isFinite(item.remainingPercent) && Number.isFinite(item.measuredAtMs))
      .sort((a, b) => a.measuredAtMs - b.measuredAtMs);
    if (points.length < 2) return null;
    const origin = points[0].measuredAtMs;
    const xs = points.map(point => (point.measuredAtMs - origin) / 86400000);
    const ys = points.map(point => point.remainingPercent);
    const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let numerator = 0;
    let denominator = 0;
    xs.forEach((x, index) => {
      numerator += (x - xMean) * (ys[index] - yMean);
      denominator += (x - xMean) * (x - xMean);
    });
    if (denominator <= 0) return null;
    return -numerator / denominator;
  }

  function monotonicityScore(measurements) {
    const points = measurements
      .filter(item => item.accepted && item.referenceOnly !== true && Number.isFinite(item.remainingPercent) && Number.isFinite(item.measuredAtMs))
      .sort((a, b) => a.measuredAtMs - b.measuredAtMs);
    if (points.length < 2) return 0.5;
    let consistent = 0;
    let checked = 0;
    for (let index = 1; index < points.length; index += 1) {
      const delta = points[index].remainingPercent - points[index - 1].remainingPercent;
      if (Math.abs(delta) <= 1.5 || delta < 0) consistent += 1;
      checked += 1;
    }
    return checked ? consistent / checked : 0.5;
  }

  function buildTrend(validMeasurements) {
    const points = validMeasurements
      .filter(item => item.accepted && item.referenceOnly !== true && Number.isFinite(item.remainingPercent) && Number.isFinite(item.measuredAtMs))
      .sort((a, b) => a.measuredAtMs - b.measuredAtMs);
    const days = spanDays(points);
    if (points.length < 3 || days < 2) {
      return {
        state: 'learning',
        label: 'Insufficient data',
        ratePerDay: null,
        longRatePerDay: null,
        recentRatePerDay: null,
        spanDays: days,
        pointCount: points.length
      };
    }
    const longRate = slopePercentPerDay(points);
    if (longRate == null || longRate <= 0.01) {
      return {
        state: 'learning',
        label: 'Trend not established',
        ratePerDay: longRate,
        longRatePerDay: longRate,
        recentRatePerDay: null,
        spanDays: days,
        pointCount: points.length
      };
    }
    const recent = points.slice(Math.max(0, points.length - Math.max(3, Math.ceil(points.length / 2))));
    const recentRate = slopePercentPerDay(recent);
    let state = 'normal';
    let label = 'Normal';
    if (recentRate != null && recentRate > longRate * 1.35 && recentRate - longRate > 0.08) {
      state = 'faster';
      label = 'Faster recently';
    } else if (recentRate != null && recentRate < longRate * 0.65 && longRate - recentRate > 0.08) {
      state = 'slower';
      label = 'Slower recently';
    }
    return {
      state,
      label,
      ratePerDay: recentRate != null ? recentRate : longRate,
      longRatePerDay: longRate,
      recentRatePerDay: recentRate,
      spanDays: days,
      pointCount: points.length
    };
  }

  function nextExpectedMeasurementMs(latestMs, config = {}) {
    if (!Number.isFinite(latestMs)) return null;
    const hours = (Array.isArray(config.scheduleHoursLocal) ? config.scheduleHoursLocal : [9, 15, 21])
      .map(Number).filter(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23).sort((a, b) => a - b);
    const minimumSpacingMs = Math.max(0, Number(config.minSpacingMinutes || 240)) * 60000;
    if (!hours.length) return latestMs + Math.max(minimumSpacingMs, 24 * 3600000);
    const earliest = latestMs + minimumSpacingMs;
    const cursor = new Date(latestMs);
    cursor.setMinutes(0, 0, 0);
    for (let dayOffset = 0; dayOffset <= 3; dayOffset += 1) {
      for (const hour of hours) {
        const candidate = new Date(cursor);
        candidate.setDate(cursor.getDate() + dayOffset);
        candidate.setHours(hour, 0, 0, 0);
        if (candidate.getTime() > latestMs && candidate.getTime() >= earliest) return candidate.getTime();
      }
    }
    return latestMs + Math.max(minimumSpacingMs, 24 * 3600000);
  }

  function buildConfidence(validMeasurements, latest, nowMs, config = {}) {
    const points = validMeasurements.filter(item => item.accepted && item.sourceType !== 'manual' && item.referenceOnly !== true);
    const days = spanDays(points);
    const averageDetectorConfidence = points.length
      ? points.reduce((sum, item) => sum + (item.confidence == null ? 0.6 : item.confidence), 0) / points.length
      : 0;
    const latestAgeHours = latest && latest.measuredAtMs ? (nowMs - latest.measuredAtMs) / 3600000 : Infinity;
    const nextExpectedMs = latest?.measuredAtMs ? nextExpectedMeasurementMs(latest.measuredAtMs, config) : null;
    const staleAfterMs = nextExpectedMs == null ? null : nextExpectedMs + 90 * 60000;
    const isStale = staleAfterMs != null && nowMs > staleAfterMs;
    const countScore = clamp(points.length / 8, 0, 1);
    const spanScore = clamp(days / 7, 0, 1);
    const freshnessWindowHours = staleAfterMs && latest?.measuredAtMs ? Math.max(1, (staleAfterMs - latest.measuredAtMs) / 3600000) : 48;
    const freshnessScore = Number.isFinite(latestAgeHours) ? clamp(1 - (latestAgeHours / (freshnessWindowHours * 1.5)), 0, 1) : 0;
    const monotonicity = monotonicityScore(points);
    const score = clamp((averageDetectorConfidence * 0.35) + (countScore * 0.2) + (spanScore * 0.2) + (freshnessScore * 0.15) + (monotonicity * 0.1), 0, 1);

    const reasons = [];
    if (points.length < 3) reasons.push('too few independent camera measurements');
    if (days < 2) reasons.push('observation period is still short');
    if (!latest || !latest.measuredAtMs) reasons.push('no dated camera measurement');
    else if (isStale) reasons.push('latest measurement is stale');
    if (averageDetectorConfidence < 0.6 && points.length) reasons.push('detector confidence is inconsistent');
    if (monotonicity < 0.7 && points.length >= 3) reasons.push('measurements are not consistently decreasing');

    let label = 'Learning';
    if (points.length >= 3 && days >= 2) {
      if (score >= 0.8) label = 'High';
      else if (score >= 0.58) label = 'Medium';
      else label = 'Low';
    }
    return { score, label, reasons, latestAgeHours, pointCount: points.length, spanDays: days, isStale, staleAfterHours: freshnessWindowHours, nextExpectedMs };
  }

  function formatDateRange(startMs, endMs) {
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${formatter.format(new Date(startMs))} – ${formatter.format(new Date(endMs))}`;
  }

  function buildForecast(currentPercent, trend, confidence, nowMs, latestRejected = null, latestAcceptedCamera = null) {
    const rejectedAfterAccepted = Boolean(latestRejected?.measuredAtMs && latestAcceptedCamera?.measuredAtMs && latestRejected.measuredAtMs > latestAcceptedCamera.measuredAtMs);
    if (rejectedAfterAccepted && (!trend || trend.pointCount < 5 || confidence.label !== 'High')) {
      return { available: false, label: 'Holding last good reading', detail: 'A newer scheduled attempt was rejected, so replacement timing is paused until another clean camera reading is accepted.' };
    }
    if (!Number.isFinite(currentPercent) || !trend || trend.ratePerDay == null || trend.ratePerDay <= 0.05) {
      return { available: false, label: 'Still learning', detail: 'A reliable usage rate has not been established.' };
    }
    if (trend.pointCount < 4 || trend.spanDays < 3 || ['Learning', 'Low'].includes(confidence.label)) {
      return { available: false, label: 'Still learning', detail: 'More reliable measurements over several days are required.' };
    }
    const rate = trend.ratePerDay;
    const nominalDays = currentPercent / rate;
    if (!Number.isFinite(nominalDays) || nominalDays <= 0 || nominalDays > 730) {
      return { available: false, label: 'Still learning', detail: 'The provisional result is outside a useful planning range.' };
    }
    const uncertainty = confidence.label === 'High' ? 0.18 : 0.3;
    const earliestDays = Math.max(1, nominalDays * (1 - uncertainty));
    const latestDays = nominalDays * (1 + uncertainty);
    const startMs = nowMs + earliestDays * 86400000;
    const endMs = nowMs + latestDays * 86400000;
    return {
      available: true,
      label: 'Provisional',
      dateRange: formatDateRange(startMs, endMs),
      nominalDays,
      earliestDays,
      latestDays,
      ratePerDay: rate,
      detail: 'Forecast is based on the current observed usage rate and will narrow as more unique captures accumulate.'
    };
  }

  function latestAccepted(measurements) {
    return measurements
      .filter(item => item.accepted && (Number.isFinite(item.remainingPercent) || Number.isFinite(item.diameterMm)))
      .sort((a, b) => (b.measuredAtMs || 0) - (a.measuredAtMs || 0))[0] || null;
  }

  function latestRejectedCameraMeasurement(measurements) {
    return measurements
      .filter(item => item.sourceType !== 'manual' && !item.accepted && (Number.isFinite(item.remainingPercent) || Number.isFinite(item.diameterMm) || Number.isFinite(item.apparentOuterRadius)))
      .sort((a, b) => (b.measuredAtMs || 0) - (a.measuredAtMs || 0))[0] || null;
  }

  function buildWarnings(config, measurements, latestCamera, currentPercent, confidence) {
    const warnings = [];
    const cameraMeasurements = measurements.filter(item => item.sourceType !== 'manual' && (Number.isFinite(item.remainingPercent) || Number.isFinite(item.diameterMm) || Number.isFinite(item.apparentOuterRadius)));
    const independentAccepted = cameraMeasurements.filter(item => item.accepted && item.referenceOnly !== true);
    if (!cameraMeasurements.length) warnings.push('No usable filter-roll camera measurements are available yet.');
    if (latestCamera && confidence.isStale) warnings.push('Holding the last accepted filter-roll camera reading until a scheduled attempt is accepted.');
    const rejected = cameraMeasurements.filter(item => !item.accepted);
    if (rejected.length) warnings.push(`${rejected.length} recent camera measurement${rejected.length === 1 ? ' was' : 's were'} rejected or excluded from the trend.`);
    if (confidence.reasons.includes('measurements are not consistently decreasing')) warnings.push('Recent measurements are inconsistent; the usage trend may be unreliable.');
    const initializedPercent = calculateRemainingPercent(config.currentDiameterMm, config.newRollDiameterMm, config.coreDiameterMm);
    if (latestCamera && Number.isFinite(initializedPercent) && Number.isFinite(currentPercent) && Math.abs(currentPercent - initializedPercent) > 18 && independentAccepted.length < 3) {
      warnings.push('The camera estimate differs substantially from the manual starting measurement.');
    }
    if (cameraMeasurements.some(item => item.referenceOnly) && (rejected.length >= 1 || confidence.isStale)) {
      warnings.push('Camera tracking needs calibration before it can support a dependable usage trend.');
    }
    return warnings;
  }

  function buildStatus(options) {
    const input = options || {};
    const nowMs = finite(input.nowMs) || Date.now();
    const sources = Array.isArray(input.sources) ? input.sources : [input.sources].filter(Boolean);
    const discovered = discoverConfig(sources);
    const config = { ...discovered, ...(input.config || {}) };
    const measurements = dedupeMeasurements([
      ...extractMeasurements(sources, config),
      ...(input.measurements || [])
    ]).sort((a, b) => (b.measuredAtMs || 0) - (a.measuredAtMs || 0));

    const latest = latestAccepted(measurements);
    const latestCamera = latestAccepted(measurements.filter(item => item.sourceType !== 'manual'));
    const initializedPercent = calculateRemainingPercent(config.currentDiameterMm, config.newRollDiameterMm, config.coreDiameterMm);
    const currentPercent = latest && Number.isFinite(latest.remainingPercent)
      ? latest.remainingPercent
      : initializedPercent;
    const currentDiameterMm = latest && Number.isFinite(latest.diameterMm)
      ? latest.diameterMm
      : Number.isFinite(currentPercent)
        ? calculateDiameterFromRemainingPercent(currentPercent, config.newRollDiameterMm, config.coreDiameterMm)
        : config.currentDiameterMm;
    const valid = measurements.filter(item => item.accepted && Number.isFinite(item.remainingPercent));
    const trend = buildTrend(valid);
    const confidence = buildConfidence(valid, latestCamera, nowMs, config);
    const latestRejectedCamera = latestRejectedCameraMeasurement(measurements);
    const forecast = buildForecast(currentPercent, trend, confidence, nowMs, latestRejectedCamera, latestCamera);
    const warnings = buildWarnings(config, measurements, latestCamera, currentPercent, confidence);
    const quantitativeCamera = measurements.filter(item => item.sourceType !== 'manual' && (Number.isFinite(item.remainingPercent) || Number.isFinite(item.apparentOuterRadius)));
    const independentAccepted = quantitativeCamera.filter(item => item.accepted && item.referenceOnly !== true);
    const tracking = quantitativeCamera.some(item => item.referenceOnly) && (quantitativeCamera.some(item => !item.accepted) || confidence.isStale)
      ? { state:'needs-calibration', label:'Needs calibration' }
      : confidence.isStale
        ? { state:'holding', label:'Holding last good reading' }
        : independentAccepted.length
          ? { state:'tracking', label:'Tracking' }
          : { state:'learning', label:'Learning' };

    return {
      version: VERSION,
      generatedAt: new Date(nowMs).toISOString(),
      config,
      current: {
        percentRemaining: Number.isFinite(currentPercent) ? clamp(currentPercent, 0, 100) : null,
        diameterMm: Number.isFinite(currentDiameterMm) ? currentDiameterMm : null,
        source: latest?.sourceType === 'camera' ? (latest.referenceOnly ? 'manual with camera reference' : 'camera') : 'manual initialization',
        partialCycle: config.partialCycle !== false,
        partialCycleLabel: config.partialCycle === false ? 'Full cycle' : config.partialCycleLabel
      },
      latestMeasurement: latest,
      latestCameraMeasurement: latestCamera,
      latestRejectedCameraMeasurement: latestRejectedCamera,
      measurements,
      recentMeasurements: measurements.slice(0, 8),
      trend,
      confidence,
      forecast,
      warnings,
      tracking
    };
  }

  return {
    VERSION,
    DEFAULT_CONFIG,
    calculateRemainingPercent,
    calculateDiameterFromRemainingPercent,
    calculateRemainingFromRadius,
    confidenceNumber,
    discoverConfig,
    extractMeasurements,
    dedupeMeasurements,
    buildTrend,
    buildConfidence,
    buildForecast,
    latestRejectedCameraMeasurement,
    nextExpectedMeasurementMs,
    buildStatus
  };
});
