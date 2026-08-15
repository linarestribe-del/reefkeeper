/* Reef Keeper Maintenance 9O — filter-roll diagnostics cleanup after accepted camera readings.
 * Reads the Maintenance 9A filter-roll cycle and the existing Observer status.
 * Adds physical diameter measurements that can drive current remaining percent and replacement forecast.
 */
(function installFilterRollStatus() {
  'use strict';

  const CARD_ID = 'rk-filter-roll-status-card';
  const FILTER_ROLL_STATE_KEY = 'reef_observer_filter_roll_state_v1';
  const CACHE_KEY = 'reef_filter_roll_9d_observer_cache_v2';
  const LOCAL_HISTORY_KEY = 'reef_filter_roll_9d_measurements_v2';
  const REFRESH_MS = 5 * 60 * 1000;
  const OBSERVER_ENDPOINT = '/api/observer-status';

  const SEEDED_PHYSICAL_MEASUREMENTS = Object.freeze([
    { measuredAt:'2026-08-06T07:19:00.000Z', diameterMm:63, note:'Physical roll diameter measured 63 mm at 00:19 on Aug 6, 2026.' },
    { measuredAt:'2026-08-08T06:19:00.000Z', diameterMm:59, note:'Physical roll diameter measured 59 mm at 23:19 on Aug 7, 2026.' }
  ]);

  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const finite = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  function parseJson(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function readFilterRollState() {
    try {
      const fromIntegration = window.ReefKeeperIntegration?.getFilterRollState?.();
      if (fromIntegration && typeof fromIntegration === 'object') return fromIntegration;
    } catch (_) {}
    try {
      return parseJson(localStorage.getItem(FILTER_ROLL_STATE_KEY), null);
    } catch (_) {
      return null;
    }
  }

  async function fetchObserverStatus() {
    const response = await fetch(OBSERVER_ENDPOINT, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${OBSERVER_ENDPOINT} returned HTTP ${response.status}`);
    return response.json();
  }

  function observerFilterRoll(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.filterRoll || payload.cameras?.overview?.filterRoll || null;
  }

  function cycleConfig(state) {
    const cycle = state?.currentCycle && typeof state.currentCycle === 'object' ? state.currentCycle : null;
    const calibration = cycle?.calibration && typeof cycle.calibration === 'object' ? cycle.calibration : {};
    const full = finite(calibration.fullDiameterMm) ?? 100;
    const core = finite(calibration.coreDiameterMm) ?? 46;
    const partial = cycle ? cycle.partialCycle === true : true;
    const current = finite(calibration.currentDiameterMm) ?? (partial ? 85 : full);
    return {
      partialCycle: partial,
      partialCycleLabel: partial ? 'Partial cycle — roll already in use' : 'Full cycle — replacement logged',
      currentDiameterMm: current,
      newRollDiameterMm: full,
      coreDiameterMm: core,
      initializedAt: cycle?.startedAt || calibration.measuredAt || '',
      cycleStartedAt: cycle?.startedAt || '',
      cycleId: cycle?.id || 'partial-existing-roll',
      cameraReferencePending: cycle?.cameraReferencePending === true,
      baselinePending: cycle?.baselinePending === true,
      calibration,
      scheduleHoursLocal: [9, 15],
      minSpacingMinutes: 240
    };
  }

  function canonicalCycleMeasurement(item, config) {
    if (!item || typeof item !== 'object') return null;
    const remainingPercent = finite(item.remainingPct);
    const measuredAt = item.captureAt || item.measuredAt || '';
    const sourceType = String(item.cameraId || '').toLowerCase() === 'manual' ? 'manual' : 'camera';
    const diameterMm = remainingPercent == null ? null : window.ReefKeeperFilterRollEngine.calculateDiameterFromRemainingPercent(
      remainingPercent,
      config.newRollDiameterMm,
      config.coreDiameterMm
    );
    const captureKey = String(item.sourceImageId || item.id || measuredAt || '').trim();
    if (!captureKey && remainingPercent == null) return null;
    return {
      id: captureKey || `${sourceType}:${measuredAt}:${remainingPercent}`,
      captureKey,
      measuredAt,
      measuredAtMs: Date.parse(measuredAt) || null,
      remainingPercent,
      diameterMm,
      apparentOuterRadius: finite(item.apparentOuterRadius),
      confidence: finite(item.confidence),
      accepted: remainingPercent != null,
      reason: item.notes || '',
      sourceType,
      sourcePath: 'integration.currentCycle.measurements',
      referenceOnly: item.referenceOnly === true || item.id === config.calibration?.referenceMeasurementId
    };
  }

  function canonicalObserverMeasurement(payload, config) {
    const item = observerFilterRoll(payload);
    if (!item || typeof item !== 'object') return null;
    const measuredAt = item.measuredAt || item.captureAt || '';
    const captureKey = String(item.sourceImageId || item.measurementId || measuredAt || '').trim();
    const apparentOuterRadius = finite(item.apparentOuterRadius);
    const rawRemainingPercent = finite(item.remainingPct);
    const rawDiameterMm = finite(item.diameterMm || item.outerDiameterMm);
    const hasQuantitativeValue = rawRemainingPercent != null || rawDiameterMm != null || apparentOuterRadius != null;
    if (!hasQuantitativeValue) return null;

    let remainingPercent = rawRemainingPercent;
    const calibration = config.calibration || {};
    let apparentFullRadius = finite(calibration.apparentFullRadius);
    let apparentCoreRadius = finite(calibration.apparentCoreRadius);
    if (remainingPercent == null && apparentOuterRadius != null) {
      if (apparentFullRadius == null) {
        const diameterRatio = config.newRollDiameterMm > 0 ? config.currentDiameterMm / config.newRollDiameterMm : null;
        if (diameterRatio && diameterRatio > 0) {
          apparentFullRadius = apparentOuterRadius / diameterRatio;
          apparentCoreRadius = apparentFullRadius * (config.coreDiameterMm / config.newRollDiameterMm);
        }
      }
      remainingPercent = window.ReefKeeperFilterRollEngine.calculateRemainingFromRadius(apparentOuterRadius, apparentFullRadius, apparentCoreRadius);
    }

    const status = String(item.status || item.state || '').toLowerCase();
    const confidence = finite(item.confidence);
    const accepted = item.available === true && remainingPercent != null && !/attention|error|invalid|failed/.test(status);
    const diameterMm = rawDiameterMm ?? (remainingPercent == null ? null : window.ReefKeeperFilterRollEngine.calculateDiameterFromRemainingPercent(remainingPercent, config.newRollDiameterMm, config.coreDiameterMm));
    let reason = accepted ? (item.note || '') : (item.rejectionReason || item.analysisMessage || item.message || 'Observer did not accept this filter-roll measurement.');
    if (!accepted && /waiting for the next scheduled/i.test(reason) && confidence != null) {
      reason = `Detector confidence ${Math.round(confidence * 100)}% was below the acceptance threshold.`;
    }
    const referenceOnly = captureKey && captureKey === String(calibration.referenceMeasurementId || '');
    return {
      id: captureKey || `observer:${measuredAt}:${apparentOuterRadius}`,
      captureKey,
      measuredAt,
      measuredAtMs: Date.parse(measuredAt) || null,
      remainingPercent,
      diameterMm,
      apparentOuterRadius,
      confidence,
      accepted,
      reason,
      sourceType: 'camera',
      sourcePath: 'observer-status.filterRoll',
      referenceOnly
    };
  }

  function currentCycleMeasurements(state, config) {
    const source = Array.isArray(state?.currentCycle?.measurements) ? state.currentCycle.measurements : [];
    return source.map(item => canonicalCycleMeasurement(item, config)).filter(Boolean);
  }


  function seededPhysicalMeasurements(config, state = null) {
    if (!config || config.partialCycle === false) return [];
    if (Array.isArray(state?.completedCycles) && state.completedCycles.length) return [];
    const cycleStartedMs = Date.parse(config.cycleStartedAt || config.initializedAt || '') || 0;
    const nowMs = Date.now() + 3600000;
    return SEEDED_PHYSICAL_MEASUREMENTS.map(item => {
      const measuredAtMs = Date.parse(item.measuredAt);
      if (!Number.isFinite(measuredAtMs)) return null;
      if (cycleStartedMs && measuredAtMs + 6 * 3600000 < cycleStartedMs) return null;
      if (measuredAtMs > nowMs) return null;
      const remainingPercent = window.ReefKeeperFilterRollEngine.calculateRemainingPercent(
        item.diameterMm,
        config.newRollDiameterMm,
        config.coreDiameterMm
      );
      if (!Number.isFinite(remainingPercent)) return null;
      return {
        id: `physical-seed-${item.measuredAt}-${item.diameterMm}`,
        captureKey: `physical-seed-${item.measuredAt}-${item.diameterMm}`,
        measuredAt: item.measuredAt,
        measuredAtMs,
        remainingPercent,
        diameterMm: item.diameterMm,
        apparentOuterRadius: null,
        confidence: 1,
        accepted: true,
        reason: item.note,
        sourceType: 'manual',
        sourcePath: 'maintenance-9l.physical-diameter-seed',
        referenceOnly: false
      };
    }).filter(Boolean);
  }

  function mergeLocalHistory(cycleKey, measurements) {
    const stored = parseJson(localStorage.getItem(LOCAL_HISTORY_KEY), null) || {};
    let archivedCycles = Array.isArray(stored.archivedCycles) ? stored.archivedCycles.slice(0, 12) : [];
    let prior = Array.isArray(stored.measurements) ? stored.measurements.filter(item => Number.isFinite(item?.remainingPercent) || Number.isFinite(item?.diameterMm) || Number.isFinite(item?.apparentOuterRadius)) : [];
    if (stored.cycleKey && stored.cycleKey !== cycleKey && prior.length) {
      archivedCycles.unshift({
        cycleKey: stored.cycleKey,
        archivedAt: new Date().toISOString(),
        measurements: prior.slice(0, 180)
      });
      archivedCycles = archivedCycles.slice(0, 12);
      prior = [];
    }
    const combined = window.ReefKeeperFilterRollEngine.dedupeMeasurements([...prior, ...measurements])
      .sort((a, b) => (b.measuredAtMs || 0) - (a.measuredAtMs || 0))
      .slice(0, 180);
    try {
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify({ cycleKey, measurements: combined, archivedCycles }));
    } catch (_) {}
    return { measurements: combined, archivedCount: archivedCycles.length };
  }

  async function loadData() {
    const state = readFilterRollState();
    let observerPayload = null;
    let failure = '';
    let usingCache = false;
    try {
      observerPayload = await fetchObserverStatus();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), payload: observerPayload }));
    } catch (error) {
      failure = String(error?.message || error || 'Observer status unavailable');
      const cached = parseJson(localStorage.getItem(CACHE_KEY), null);
      if (cached?.payload) {
        observerPayload = cached.payload;
        usingCache = true;
      }
    }
    return { state, observerPayload, failure, usingCache };
  }

  function formatPercent(value, fallback = '—') {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : fallback;
  }

  function formatMm(value, fallback = '—') {
    return Number.isFinite(value) ? `${value.toFixed(1)} mm` : fallback;
  }

  function formatConfidenceNumber(value) {
    return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Not available';
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }


  function formatDateTimeLocalValue(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (!date || Number.isNaN(date.getTime())) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function localDateTimeToIso(value) {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function ageLabel(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Unknown age';
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 2) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function confidenceClass(label) {
    const normalized = String(label || '').toLowerCase();
    if (normalized === 'high') return 'good';
    if (normalized === 'medium') return 'watch';
    if (normalized === 'low') return 'warn';
    if (normalized === 'limited') return 'watch';
    return 'learning';
  }

  function trendClass(state) {
    if (state === 'normal' || state === 'slower') return 'good';
    if (state === 'faster' || state === 'paused') return 'watch';
    return 'learning';
  }

  function renderMeasurementRow(item) {
    const radius = Number.isFinite(item.apparentOuterRadius) ? `${item.apparentOuterRadius.toFixed(1)} px apparent radius` : formatMm(item.diameterMm);
    const isPhysical = item.sourceType === 'manual' && /physical roll diameter|physical diameter|outside diameter/i.test(item.reason || item.notes || item.sourcePath || '');
    const source = item.sourceType === 'manual' ? (isPhysical ? 'Physical diameter' : 'Manual baseline') : (item.referenceOnly ? 'Camera reference' : (item.accepted ? 'Camera · used' : 'Camera · excluded'));
    const confidence = item.sourceType === 'manual' ? 'Physical entry' : formatConfidenceNumber(item.confidence);
    const valueLabel = Number.isFinite(item.remainingPercent) ? formatPercent(item.remainingPercent) : (item.referenceOnly ? 'Reference' : (item.accepted ? 'Radius only' : 'Excluded'));
    return `<div class="rk-fr-history-row ${item.accepted ? '' : 'rejected'} ${item.referenceOnly ? 'reference' : ''}">
      <div class="rk-fr-history-main"><strong>${escapeHtml(formatDate(item.measuredAt))}</strong><span>${escapeHtml(item.measuredAt ? ageLabel(item.measuredAt) : 'Undated')}</span></div>
      <div class="rk-fr-history-value"><strong>${escapeHtml(valueLabel)}</strong><span>${escapeHtml(radius)}</span></div>
      <div class="rk-fr-history-confidence"><strong>${escapeHtml(confidence)}</strong><span>${escapeHtml(source)}</span></div>
      ${item.accepted ? '' : `<div class="rk-fr-reject-reason">${escapeHtml(item.reason || 'Rejected or inconsistent measurement')}</div>`}
    </div>`;
  }

  function measurementRows(measurements) {
    const quantitative = measurements.filter(item => Number.isFinite(item.remainingPercent) || Number.isFinite(item.diameterMm) || Number.isFinite(item.apparentOuterRadius));
    if (!quantitative.length) return '<div class="rk-fr-empty">No quantitative filter-roll measurements are available yet.</div>';

    const latestAcceptedCameraMs = quantitative
      .filter(item => item.sourceType === 'camera' && item.accepted === true && !item.referenceOnly && Number.isFinite(item.measuredAtMs))
      .reduce((max, item) => Math.max(max, item.measuredAtMs), -Infinity);

    const archivedDiagnostics = [];
    const primaryRows = [];
    quantitative.forEach(item => {
      const supersededRejectedCamera = item.sourceType === 'camera' && item.accepted === false && Number.isFinite(item.measuredAtMs) && Number.isFinite(latestAcceptedCameraMs) && item.measuredAtMs < latestAcceptedCameraMs;
      if (supersededRejectedCamera) archivedDiagnostics.push(item);
      else primaryRows.push(item);
    });

    const visiblePrimary = primaryRows.slice(0, Math.max(1, 8 - Math.min(archivedDiagnostics.length, 1)));
    const primaryHtml = visiblePrimary.map(renderMeasurementRow).join('');
    const diagnosticHtml = archivedDiagnostics.length
      ? `<details class="rk-fr-setup-disclosure rk-fr-diagnostic-disclosure"><summary>Camera diagnostics (${archivedDiagnostics.length} older rejected reading${archivedDiagnostics.length === 1 ? '' : 's'} hidden)</summary><div class="rk-fr-history-list">${archivedDiagnostics.slice(0, 8).map(renderMeasurementRow).join('')}</div></details>`
      : '';
    return `<div class="rk-fr-history-list">${primaryHtml}</div>${diagnosticHtml}`;
  }

  function warningHtml(warnings, failure, usingCache) {
    const all = [...warnings];
    if (usingCache) all.push('Live Observer data was unavailable; the latest cached Observer status is shown.');
    else if (failure) all.push(`Observer status could not be refreshed: ${failure}`);
    if (!all.length) return '<div class="rk-fr-ok-note">No filter-roll warnings.</div>';
    return `<div class="rk-fr-warning-list">${all.map(item => `<div class="rk-fr-warning"><span>!</span><div>${escapeHtml(item)}</div></div>`).join('')}</div>`;
  }

  function trackingClass(state) {
    if (state === 'tracking' || state === 'physical') return 'good';
    if (state === 'needs-calibration' || state === 'stale') return 'warn';
    if (state === 'holding' || state === 'view-blocked') return 'watch';
    return 'learning';
  }

  function actionableTrackingWarning(status, latestCamera, latestPhysical = null) {
    const tracking = status?.tracking || {};
    const current = status?.current || {};
    const rejected = status?.latestRejectedCameraMeasurement || (status?.recentMeasurements || []).find(item => item.sourceType === 'camera' && !item.accepted && item.reason);
    const latestAccepted = latestPhysical || latestCamera || status?.latestMeasurement || null;
    const rejectedIsNewer = Boolean(rejected?.measuredAtMs && latestAccepted?.measuredAtMs && rejected.measuredAtMs > latestAccepted.measuredAtMs);
    const detail = rejectedIsNewer && rejected?.reason ? ` Latest rejected attempt: ${rejected.reason}` : '';
    if (current.source === 'physical diameter') {
      if (rejectedIsNewer) {
        return `Camera tracking is relearning this roll and did not accept the latest visual reading. Reef Keeper is still using the latest physical diameter measurement for the current roll percentage.${detail}`;
      }
      return '';
    }
    if (tracking.state === 'view-blocked' && latestCamera?.measuredAt) {
      return `Filter-roll view appears blocked or unreliable, so Reef Keeper is holding the last accepted camera reading from ${formatDate(latestCamera.measuredAt)}. The current estimate remains based on that reading until the roll edge is visible again.${detail}`;
    }
    if (tracking.state === 'needs-calibration') {
      const since = latestCamera?.measuredAt ? formatDate(latestCamera.measuredAt) : 'the initial camera reference';
      const estimateBasis = latestCamera?.measuredAt ? 'that last accepted reading' : 'the saved manual starting measurement';
      return `No accepted filter-roll camera reading has arrived since ${since}. The current estimate remains based on ${estimateBasis}.${detail}`;
    }
    if ((tracking.state === 'stale' || tracking.state === 'holding') && latestCamera?.measuredAt) {
      return `Holding the last accepted filter-roll camera reading from ${formatDate(latestCamera.measuredAt)}. The current estimate remains based on that reading until another scheduled attempt is accepted.${detail}`;
    }
    return '';
  }

  function logPhysicalFilterRollDiameterFromForm(event) {
    event?.preventDefault?.();
    const diameter = finite(document.getElementById('observer-filter-roll-physical-diameter')?.value);
    const measuredAt = localDateTimeToIso(document.getElementById('observer-filter-roll-physical-time')?.value);
    const full = finite(document.getElementById('observer-filter-roll-full-diameter')?.value) ?? window.ReefKeeperFilterRollStatus?.config?.newRollDiameterMm ?? 100;
    const core = finite(document.getElementById('observer-filter-roll-core-diameter')?.value) ?? window.ReefKeeperFilterRollStatus?.config?.coreDiameterMm ?? 46;
    const output = document.getElementById('observer-filter-roll-physical-result');
    const remaining = window.ReefKeeperFilterRollEngine?.calculateRemainingPercent?.(diameter, full, core);
    if (!Number.isFinite(remaining)) {
      const error = 'Diameter must be larger than the core and no larger than the full roll.';
      if (output) output.textContent = error;
      try { if (typeof window.showToast === 'function') window.showToast(error); } catch (_) {}
      return { ok:false, error };
    }
    const payload = {
      id: `filter-roll-physical-${measuredAt}-${diameter}`,
      captureAt: measuredAt,
      remainingPct: remaining,
      confidence: 1,
      cameraId: 'manual',
      notes: `Physical roll diameter ${diameter} mm; full ${full} mm; core ${core} mm.`
    };
    let result = null;
    try {
      if (window.ReefKeeperIntegration?.recordFilterRollMeasurement) {
        result = window.ReefKeeperIntegration.recordFilterRollMeasurement(payload);
      }
    } catch (error) {
      result = { ok:false, error:String(error?.message || error) };
    }
    if (!result?.ok) {
      const stored = parseJson(localStorage.getItem(LOCAL_HISTORY_KEY), null) || {};
      const measurements = Array.isArray(stored.measurements) ? stored.measurements : [];
      const manual = {
        id: payload.id,
        captureKey: payload.id,
        measuredAt,
        measuredAtMs: Date.parse(measuredAt) || Date.now(),
        remainingPercent: remaining,
        diameterMm: diameter,
        confidence: 1,
        accepted: true,
        reason: payload.notes,
        sourceType: 'manual',
        sourcePath: 'filter-roll-status.physical-form',
        referenceOnly: false
      };
      try { localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify({ ...stored, measurements: [manual, ...measurements].slice(0, 180) })); } catch (_) {}
      result = { ok:true, fallback:true, measurement: manual };
    }
    if (output) output.textContent = `Saved physical estimate: ${remaining.toFixed(1)}% remaining at ${diameter.toFixed(1)} mm.`;
    try { if (typeof window.showToast === 'function') window.showToast(`Filter roll measured at ${remaining.toFixed(1)}%`); } catch (_) {}
    try { window.ReefKeeperRefreshFilterRollStatus?.(); } catch (_) {}
    return result;
  }

  function renderCard(status, meta) {
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    const current = status.current || {};
    const latest = status.latestCameraMeasurement;
    const trend = status.trend || {};
    const confidence = status.confidence || {};
    const forecast = status.forecast || {};
    const tracking = status.tracking || { state:'learning', label:'Learning' };
    const percent = Number.isFinite(current.percentRemaining) ? current.percentRemaining : 0;
    const physicalMeasurements = (status.measurements || []).filter(item => item.sourceType === 'manual' && /physical roll diameter|physical diameter|outside diameter/i.test(item.reason || item.notes || item.sourcePath || ''));
    const latestPhysical = physicalMeasurements.slice().sort((a, b) => (b.measuredAtMs || 0) - (a.measuredAtMs || 0))[0] || null;
    const isFreshPhysicalBaseline = Boolean(
      latestPhysical &&
      current.source === 'physical diameter' &&
      Number.isFinite(latestPhysical.remainingPercent) &&
      latestPhysical.remainingPercent >= 98 &&
      Number.isFinite(latestPhysical.diameterMm) &&
      Number.isFinite(status.config?.newRollDiameterMm) &&
      Math.abs(latestPhysical.diameterMm - status.config.newRollDiameterMm) <= 1.5
    );
    const cameraReadingIsFromPriorCycle = Boolean(latest && latestPhysical?.measuredAtMs && latest.measuredAtMs && latest.measuredAtMs < latestPhysical.measuredAtMs);
    const latestDetail = cameraReadingIsFromPriorCycle
      ? 'Pending for this new roll; prior-cycle camera readings are kept in diagnostics.'
      : latest
        ? `${formatDate(latest.measuredAt)} · ${latest.measuredAt ? ageLabel(latest.measuredAt) : 'Undated'}`
        : 'No accepted camera reading yet.';
    const sourceLabel = current.source === 'manual with camera reference'
      ? 'Manual baseline with camera reference established'
      : current.source === 'camera'
        ? 'Last accepted camera measurement'
        : current.source === 'physical diameter'
          ? (isFreshPhysicalBaseline ? 'New physical roll baseline' : 'Latest physical diameter measurement')
          : 'Manual starting measurement';
    const activeWarnings = (status.warnings || []).filter(message => !(isFreshPhysicalBaseline && /camera|stale|blocked|obstruction|view|measurement/i.test(message || '')));
    const primaryWarning = (isFreshPhysicalBaseline ? '' : actionableTrackingWarning(status, latest, latestPhysical)) || [...activeWarnings, ...(meta.usingCache ? ['Showing cached Observer data.'] : []), ...(meta.failure && !meta.usingCache ? [`Observer refresh failed: ${meta.failure}`] : [])][0] || '';
    const forecastText = isFreshPhysicalBaseline ? 'Learning this roll' : (forecast.available ? forecast.dateRange : (forecast.label || 'Still learning'));
    const forecastDetail = isFreshPhysicalBaseline
      ? 'New roll baseline is saved. Forecasting will resume after this cycle has another physical measurement or enough clean camera history.'
      : (forecast.detail || 'More history is required.');
    const confidenceReason = isFreshPhysicalBaseline
      ? 'Camera tracking is relearning the new roll; physical measurement is the source of truth.'
      : (confidence.reasons?.join('; ') || 'More independent camera history is required.');
    const trendDetail = isFreshPhysicalBaseline
      ? 'New roll started; usage trend will build from this cycle.'
      : (trend.paused ? (trend.pauseReason || 'Usage trend is paused until another clean camera reading is accepted.') : (Number.isFinite(trend.ratePerDay) ? `${trend.ratePerDay.toFixed(2)} percentage points/day` : 'Still learning the usage rate'));
    const displayTracking = isFreshPhysicalBaseline ? { state:'physical', label:'New cycle' } : tracking;
    const displayTrend = isFreshPhysicalBaseline ? { state:'learning', label:'Learning this roll' } : trend;
    const displayConfidence = isFreshPhysicalBaseline ? { label:'Physical baseline' } : confidence;
    const displayCycleLabel = isFreshPhysicalBaseline ? 'New cycle started — physical baseline' : (current.partialCycleLabel || 'Current roll cycle');
    const physicalLabel = latestPhysical ? `${formatMm(latestPhysical.diameterMm)} · ${formatPercent(latestPhysical.remainingPercent)}` : 'No physical diameter logged';
    const physicalDetail = latestPhysical ? `${formatDate(latestPhysical.measuredAt)} · ${ageLabel(latestPhysical.measuredAt)}` : 'Add a physical measurement to override camera percent.';
    const visibleMeasurements = isFreshPhysicalBaseline && latestPhysical
      ? (status.recentMeasurements || []).filter(item => item.measuredAtMs && item.measuredAtMs >= latestPhysical.measuredAtMs)
      : (status.recentMeasurements || []);
    const visibleMeasurementNote = isFreshPhysicalBaseline
      ? 'Current roll measurements only; older rejected camera diagnostics are collapsed once a newer camera reading is accepted.'
      : 'Only quantitative readings; older rejected camera attempts collapse after a newer camera reading is accepted.';
    const lastCameraValue = cameraReadingIsFromPriorCycle ? 'Pending' : (latest ? formatPercent(latest.remainingPercent) : 'Pending');
    const nowLocalValue = formatDateTimeLocalValue();

    card.innerHTML = `<div class="rk-fr-compact-head">
      <div><div class="rk-fr-kicker">FILTER ROLL</div><h3>Filter-roll status</h3></div>
      <span class="rk-fr-badge ${trackingClass(displayTracking.state)}">${escapeHtml(displayTracking.label)}</span>
    </div>
    <div class="rk-fr-compact-body">
      <div class="rk-fr-compact-percent"><strong>${escapeHtml(formatPercent(current.percentRemaining))}</strong><span>estimated remaining</span></div>
      <div class="rk-fr-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(percent.toFixed(1))}"><span style="width:${escapeHtml(String(Math.max(0, Math.min(100, percent))))}%"></span></div>
      <div class="rk-fr-cycle-label">${escapeHtml(displayCycleLabel)}</div>
      <div class="rk-fr-compact-facts">
        <div><span>Latest physical measurement</span><strong>${escapeHtml(physicalLabel)}</strong><small>${escapeHtml(physicalDetail)}</small></div>
        <div><span>Replacement forecast</span><strong>${escapeHtml(forecastText)}</strong><small>${escapeHtml(forecastDetail)}</small></div>
      </div>
      ${primaryWarning ? `<div class="rk-fr-inline-warning"><span>!</span><div>${escapeHtml(primaryWarning)}</div></div>` : ''}
    </div>
    <details class="rk-fr-details">
      <summary>Measurements and setup</summary>
      <div class="rk-fr-details-content">
        <div class="rk-fr-current-details">
          <div><span>Current diameter</span><strong>${escapeHtml(formatMm(current.diameterMm))}</strong></div>
          <div><span>Estimate source</span><strong>${escapeHtml(sourceLabel)}</strong></div>
          <div><span>Last valid camera reading</span><strong>${escapeHtml(lastCameraValue)}</strong><small>${escapeHtml(latestDetail)}</small></div>
          <div><span>Roll geometry</span><strong>${escapeHtml(`${status.config.newRollDiameterMm} mm new · ${status.config.coreDiameterMm} mm core`)}</strong></div>
        </div>
        <div class="rk-fr-metric-grid">
          <div class="rk-fr-metric"><div class="rk-fr-metric-label">Usage trend</div><strong><span class="rk-fr-badge ${trendClass(displayTrend.state)}">${escapeHtml(displayTrend.label || 'Insufficient data')}</span></strong><span>${escapeHtml(trendDetail)}</span></div>
          <div class="rk-fr-metric"><div class="rk-fr-metric-label">Confidence</div><strong><span class="rk-fr-badge ${confidenceClass(displayConfidence.label)}">${escapeHtml(displayConfidence.label || 'Learning')}</span></strong><span>${escapeHtml(confidenceReason)}</span></div>
        </div>
        <div class="rk-fr-section"><div class="rk-fr-section-title"><strong>Recent measurements</strong><span>${escapeHtml(visibleMeasurementNote)}</span></div>${measurementRows(visibleMeasurements)}</div>
        <details class="rk-fr-setup-disclosure" open><summary>Log physical roll diameter</summary>
          <form class="observer-filter-roll-init rk-fr-setup-form" onsubmit="logPhysicalFilterRollDiameterFromForm(event)">
            <div class="observer-filter-roll-init-head"><strong>Physical calibration</strong><span>Enter the outside diameter when measured by hand. This overrides the current percent and narrows the forecast.</span></div>
            <div class="observer-filter-roll-init-grid">
              <label><span>Measured outside diameter</span><div><input id="observer-filter-roll-physical-diameter" type="number" min="1" max="200" step="0.1" value="${escapeHtml(String(Number.isFinite(current.diameterMm) ? current.diameterMm.toFixed(1) : 59))}" inputmode="decimal"><b>mm</b></div></label>
              <label><span>Measured at</span><div><input id="observer-filter-roll-physical-time" type="datetime-local" value="${escapeHtml(nowLocalValue)}"></div></label>
            </div>
            <button class="observer-primary-btn observer-filter-roll-init-btn" type="submit">Save physical measurement</button>
            <small id="observer-filter-roll-physical-result">Latest physical estimate: ${escapeHtml(physicalLabel)}.</small>
          </form>
        </details>
        <div class="rk-fr-card-actions"><button class="observer-primary-btn" type="button" onclick="logFilterRollReplacementFromObserver()">Log fleece roll replacement</button><small>Use this after physically replacing the fleece roll. It closes this cycle and starts a new 100% cycle.</small></div>
        <details class="rk-fr-setup-disclosure"><summary>Edit roll setup</summary>
          <form class="observer-filter-roll-init rk-fr-setup-form" onsubmit="initializeExistingFilterRollFromForm(event)">
            <div class="observer-filter-roll-init-head"><strong>Existing roll already in use</strong><span>Enter the physical outside diameter.</span></div>
            <div class="observer-filter-roll-init-grid">
              <label><span>Current outside diameter</span><div><input id="observer-filter-roll-current-diameter" type="number" min="1" max="200" step="0.1" value="${escapeHtml(String(status.config.currentDiameterMm || 85))}" inputmode="decimal"><b>mm</b></div></label>
              <label><span>New roll diameter</span><div><input id="observer-filter-roll-full-diameter" type="number" min="1" max="200" step="0.1" value="${escapeHtml(String(status.config.newRollDiameterMm || 100))}" inputmode="decimal"><b>mm</b></div></label>
              <label><span>Core outside diameter</span><div><input id="observer-filter-roll-core-diameter" type="number" min="1" max="200" step="0.1" value="${escapeHtml(String(status.config.coreDiameterMm || 46))}" inputmode="decimal"><b>mm</b></div></label>
            </div>
            <button class="observer-primary-btn observer-filter-roll-init-btn" type="submit">Save roll setup</button>
            <small id="observer-filter-roll-init-result">Current saved estimate: ${escapeHtml(formatPercent(current.percentRemaining))}.</small>
          </form>
        </details>
        <div class="rk-fr-archive-note">${escapeHtml(String(meta.completedRollCount || 0))} completed roll cycle${meta.completedRollCount === 1 ? '' : 's'} preserved${meta.archivedCount ? ` · ${meta.archivedCount} local diagnostic archive${meta.archivedCount === 1 ? '' : 's'}` : ''}.</div>
      </div>
    </details>`;
  }

  function findHost() {
    const mount = document.getElementById('observer-filter-roll-status-mount');
    if (mount) return { host: mount, appendInside: true };
    const fallback = document.querySelector('#page-observer') || document.body;
    return { host: fallback, appendInside: true };
  }

  function mountCard() {
    if (document.getElementById(CARD_ID)) return document.getElementById(CARD_ID);
    const location = findHost();
    const card = document.createElement('section');
    card.id = CARD_ID;
    card.className = 'card rk-filter-roll-card rk-filter-roll-compact-card';
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = '<div class="rk-fr-loading">Loading filter-roll status…</div>';
    if (location.insertAfter && location.host.parentNode) location.host.insertAdjacentElement('afterend', card);
    else location.host.appendChild(card);
    return card;
  }

  let refreshPromise = null;
  async function refresh() {
    if (!window.ReefKeeperFilterRollEngine) return;
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      mountCard();
      try {
        const loaded = await loadData();
        const config = cycleConfig(loaded.state);
        const liveFilterRoll = observerFilterRoll(loaded.observerPayload);
        if (Array.isArray(liveFilterRoll?.schedule?.hoursLocal)) config.scheduleHoursLocal = liveFilterRoll.schedule.hoursLocal;
        if (Number.isFinite(Number(liveFilterRoll?.schedule?.minSpacingMinutes))) config.minSpacingMinutes = Number(liveFilterRoll.schedule.minSpacingMinutes);
        const cycleMeasurements = currentCycleMeasurements(loaded.state, config);
        const observerMeasurement = canonicalObserverMeasurement(loaded.observerPayload, config);
        const observerMeasurements = window.ReefKeeperFilterRollEngine.extractMeasurements(liveFilterRoll, config);
        const physicalSeedMeasurements = seededPhysicalMeasurements(config, loaded.state);
        const merged = mergeLocalHistory(config.cycleId, [
          ...cycleMeasurements,
          ...physicalSeedMeasurements,
          ...observerMeasurements,
          ...(observerMeasurement ? [observerMeasurement] : [])
        ]);
        const status = window.ReefKeeperFilterRollEngine.buildStatus({
          config,
          measurements: merged.measurements
        });
        status.completedRollCount = Array.isArray(loaded.state?.completedCycles) ? loaded.state.completedCycles.length : 0;
        renderCard(status, {
          failure: loaded.failure,
          usingCache: loaded.usingCache,
          completedRollCount: status.completedRollCount,
          archivedCount: merged.archivedCount
        });
        window.ReefKeeperFilterRollStatus = status;
        window.dispatchEvent(new CustomEvent('reefkeeper:filter-roll-status', { detail: status }));
      } catch (error) {
        const card = document.getElementById(CARD_ID);
        if (card) card.innerHTML = `<div class="rk-fr-error"><strong>Filter-roll status could not be loaded.</strong><span>${escapeHtml(error?.message || error)}</span></div>`;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function boot() {
    mountCard();
    refresh();
    window.setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('reefkeeper:event', refresh);
    window.addEventListener('storage', event => {
      if ([FILTER_ROLL_STATE_KEY, LOCAL_HISTORY_KEY].includes(event.key)) refresh();
    });
    window.ReefKeeperRefreshFilterRollStatus = refresh;
  }

  window.logPhysicalFilterRollDiameterFromForm = logPhysicalFilterRollDiameterFromForm;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
