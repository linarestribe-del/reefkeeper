// Reef Keeper Maintenance 9E.1 — reviewed-alert certainty and maintenance-tolerant health presentation
// Full archives remain local. Only current/selected images and non-secret diagnostics are published remotely.

(function installAquariumObserver() {
  'use strict';

  const STATUS_ENDPOINT = '/api/observer-status';
  const DAILY_SUMMARY_ENDPOINT = '/api/observer-daily-summary';
  const ALERTS_ENDPOINT = '/api/observer-alerts';
  const TIMELAPSES_ENDPOINT = '/api/observer-status?resource=timelapses';
  const ALERT_REVIEWED_KEY = 'reef_observer_reviewed_alert_ids_v1';
  const ALERT_HISTORY_KEY = 'reef_observer_reviewed_alert_history_v1';
  const ALERT_ACTIVE_KEY = 'reef_observer_active_alert_keys_v1';
  const ALERT_CLEARED_KEY = 'reef_observer_cleared_alert_keys_v1';
  const ALERT_SEEN_KEY = 'reef_observer_seen_alert_ids_v1';
  const REFRESH_INTERVAL_MS = 60_000;
  const CAPTURE_STALE_AFTER_MS = 15 * 60_000;
  const CAPTURE_OFFLINE_AFTER_MS = 60 * 60_000;
  const PUBLISH_STALE_AFTER_MS = 15 * 60_000;
  const PUBLISH_OFFLINE_AFTER_MS = 60 * 60_000;
  const HISTORY_LABELS = {
    previous: 'Previous capture',
    dayAgo: 'About 24 hours ago',
    weekAgo: 'About 7 days ago'
  };
  const OBSERVER_ANALYSIS_PROMPT = [
    'Review this as one still image from my sump camera, not the display tank.',
    'Analyze only what the pixels visibly support and do not fill unseen areas with assumptions.',
    '',
    'Use these headings:',
    '1. Image usability — note sharpness, exposure or night-vision limits, glare, obstruction, camera angle, and whether the image is suitable for comparison.',
    '2. Urgent safety check — look for visible active leaks or overflow, unusually high or low water level, displaced plumbing or tubing, equipment out of position, or an apparent water/electrical hazard. If none is visible, say “No obvious urgent issue is visible in this frame,” not that the system is definitely safe.',
    '3. Equipment observations — discuss only equipment actually visible. Check the skimmer body, neck, cup, foam height, or overflow only where shown; filter-roller media position or apparent clogging; reactor bodies and visible bubbles or turbulence; ATO components; return equipment; and plumbing connections. Explicitly say when an item cannot be assessed from this view.',
    '4. Housekeeping observations — note visible salt creep, condensation, algae or biofilm, debris, microbubbles, unusual cloudiness, or obstruction.',
    '5. What cannot be determined — do not infer pump operation, actual flow rate, water chemistry, hidden leaks, or change over time from a single still. Do not claim a trend unless comparison images or data are provided.',
    '6. Recommended next check — give only one or two practical checks, ranked by urgency, based on visible evidence.',
    '',
    'Keep observations separate from possible concerns. Do not diagnose livestock or coral health unless they are clearly visible. Use my tank profile or Apex readings only in a separate Supporting context note and never as proof of what the image shows.'
  ].join('\n');

  let snapshot = null;
  let observerFeed = null;
  let selectedCameraId = 'overview';
  let refreshTimer = null;
  let refreshInFlight = null;
  let dailySummary = null;
  let observerAlerts = null;
  let observerTimelapses = null;
  const sessionAlertIdSets = new Map();

  function byId(id) { return document.getElementById(id); }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
  }

  function cleanText(value, fallback = '') {
    return String(value ?? fallback).replace(/[<>]/g, '').trim();
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function captureDate(record) {
    return parseDate(record?.capturedAt || record?.captured_at || record?.capturedAtLocal || record?.captured_at_local);
  }

  function formatCaptureTime(value) {
    const date = parseDate(value);
    if (!date) return '—';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatAge(date) {
    if (!date) return '—';
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function healthState(value, fallback = 'pending') {
    const state = String(value || '').toLowerCase();
    return ['healthy', 'attention', 'offline', 'pending'].includes(state) ? state : fallback;
  }

  function normalizeHealthComponent(value, fallbackMessage) {
    const item = value && typeof value === 'object' ? value : {};
    return {
      ...item,
      status: healthState(item.status),
      message: cleanText(item.message, fallbackMessage)
    };
  }

  function normalizeHealth(value) {
    const source = value && typeof value === 'object' ? value : {};
    const issues = Array.isArray(source.issues)
      ? source.issues.slice(0, 12).map(item => ({
          code: cleanText(item?.code, 'observer_issue'),
          severity: ['critical', 'warning', 'info'].includes(item?.severity) ? item.severity : 'info',
          message: cleanText(item?.message)
        })).filter(item => item.message)
      : [];
    const services = source.services && typeof source.services === 'object' ? source.services : {};
    const archive = source.archive && typeof source.archive === 'object' ? source.archive : {};
    const local = source.localMonitoring && typeof source.localMonitoring === 'object' ? source.localMonitoring : {};
    return {
      status: healthState(source.status),
      summary: cleanText(source.summary, 'Observer health data has not arrived yet.'),
      checkedAt: parseDate(source.checkedAt || source.checked_at),
      issues,
      capture: normalizeHealthComponent(source.capture, 'Waiting for camera health data.'),
      publisher: normalizeHealthComponent(source.publisher, 'Waiting for publisher health data.'),
      storage: normalizeHealthComponent(source.storage, 'Waiting for drive health data.'),
      power: normalizeHealthComponent(source.power, 'Waiting for Pi power health data.'),
      dailySummary: {
        ...normalizeHealthComponent(source.dailySummary, 'Waiting for daily monitoring data.'),
        framesReady: source.dailySummary?.framesReady === true,
        state: cleanText(source.dailySummary?.state, 'waiting_for_frames'),
        generatedAt: parseDate(source.dailySummary?.generatedAt),
        nextAttemptAt: parseDate(source.dailySummary?.nextAttemptAt),
        attemptCount: Math.max(0, Number(source.dailySummary?.attemptCount) || 0),
        maxAttempts: Math.max(1, Number(source.dailySummary?.maxAttempts) || 3),
        retryMinutes: Math.max(30, Number(source.dailySummary?.retryMinutes) || 180)
      },
      localMonitoring: {
        ...normalizeHealthComponent(local, 'Waiting for local visual monitoring data.'),
        enabled: local.enabled !== false,
        evaluatedAt: parseDate(local.evaluatedAt),
        mode: cleanText(local.mode, 'unknown'),
        imageQuality: {
          ...normalizeHealthComponent(local.imageQuality, 'Waiting for image-quality analysis.'),
          meanBrightness: Math.max(0, Math.min(255, Number(local.imageQuality?.meanBrightness) || 0)),
          contrast: Math.max(0, Number(local.imageQuality?.contrast) || 0),
          edgeEnergy: Math.max(0, Number(local.imageQuality?.edgeEnergy) || 0),
          obstructionStreak: Math.max(0, Number(local.imageQuality?.obstructionStreak) || 0)
        },
        scene: {
          ...normalizeHealthComponent(local.scene, 'Learning the stable sump view.'),
          baselineReady: local.scene?.baselineReady === true,
          changeScore: Math.max(0, Math.min(1, Number(local.scene?.changeScore) || 0)),
          shiftX: Math.trunc(Number(local.scene?.shiftX) || 0),
          shiftY: Math.trunc(Number(local.scene?.shiftY) || 0),
          movementLikely: local.scene?.movementLikely === true,
          streak: Math.max(0, Number(local.scene?.streak) || 0)
        },
        waterLevel: {
          ...normalizeHealthComponent(local.waterLevel, 'Water-level monitoring is not calibrated.'),
          configured: local.waterLevel?.configured === true,
          confidence: Math.max(0, Math.min(1, Number(local.waterLevel?.confidence) || 0)),
          baselineYPercent: Math.max(0, Math.min(100, Number(local.waterLevel?.baselineYPercent) || 0)),
          currentYPercent: Math.max(0, Math.min(100, Number(local.waterLevel?.currentYPercent) || 0)),
          deltaPercent: Math.max(-100, Math.min(100, Number(local.waterLevel?.deltaPercent) || 0)),
          direction: cleanText(local.waterLevel?.direction, 'unknown'),
          streak: Math.max(0, Number(local.waterLevel?.streak) || 0)
        }
      },
      archive: {
        ...normalizeHealthComponent(archive, 'Waiting for archive health data.'),
        captureCount: Math.max(0, Number(archive.captureCount) || 0),
        oldestCaptureAt: parseDate(archive.oldestCaptureAt),
        newestCaptureAt: parseDate(archive.newestCaptureAt),
        historySlotsReady: Array.isArray(archive.historySlotsReady) ? archive.historySlotsReady : [],
        dailySummaryFramesReady: archive.dailySummaryFramesReady === true
      },
      services: {
        captureTimerActive: services.captureTimerActive === true,
        captureTimerState: cleanText(services.captureTimerState, 'unknown'),
        publishTimerActive: services.publishTimerActive === true,
        publishTimerState: cleanText(services.publishTimerState, 'unknown')
      }
    };
  }

  function normalizeComparison(slot, value) {
    const item = value && typeof value === 'object' ? value : {};
    const captured = parseDate(item.capturedAt || item.captured_at);
    const imageUrl = String(item.imageUrl || '').trim();
    return {
      slot,
      label: HISTORY_LABELS[slot] || slot,
      available: item.available === true && Boolean(captured && imageUrl),
      captured,
      imageUrl,
      sizeBytes: Number(item.sizeBytes ?? item.size_bytes),
      imageVersion: String(item.imageVersion || item.capturedAt || '')
    };
  }

  function normalizeFilterRoll(value) {
    const item = value && typeof value === 'object' ? value : {};
    const schedule = item.schedule && typeof item.schedule === 'object' ? item.schedule : {};
    const roi = Array.isArray(item.roi) && item.roi.length === 4
      ? item.roi.map(number => Math.max(0, Math.min(1, Number(number) || 0)))
      : null;
    return {
      enabled: item.enabled !== false,
      configured: item.configured === true,
      available: item.available === true,
      cameraId: cleanText(item.cameraId || 'overview'),
      state: cleanText(item.state || item.status, 'pending'),
      status: cleanText(item.status || item.state, 'pending'),
      message: cleanText(item.message),
      note: cleanText(item.note),
      measuredAt: parseDate(item.measuredAt || item.captureAt),
      measurementId: cleanText(item.measurementId || item.measuredAt || ''),
      sourceImageId: cleanText(item.sourceImageId || ''),
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      remainingPct: item.remainingPct === null || item.remainingPct === undefined || item.remainingPct === '' ? null : (Number.isFinite(Number(item.remainingPct)) ? Math.max(0, Math.min(100, Number(item.remainingPct))) : null),
      apparentOuterRadius: item.apparentOuterRadius === null || item.apparentOuterRadius === undefined || item.apparentOuterRadius === '' ? null : (Number.isFinite(Number(item.apparentOuterRadius)) ? Math.max(0, Number(item.apparentOuterRadius)) : null),
      apparentCoreRadius: item.apparentCoreRadius === null || item.apparentCoreRadius === undefined || item.apparentCoreRadius === '' ? null : (Number.isFinite(Number(item.apparentCoreRadius)) ? Math.max(0, Number(item.apparentCoreRadius)) : null),
      apparentThicknessPct: item.apparentThicknessPct === null || item.apparentThicknessPct === undefined || item.apparentThicknessPct === '' ? null : (Number.isFinite(Number(item.apparentThicknessPct)) ? Math.max(0, Math.min(100, Number(item.apparentThicknessPct))) : null),
      roi,
      schedule: {
        hoursLocal: Array.isArray(schedule.hoursLocal) ? schedule.hoursLocal.map(value => Math.max(0, Math.min(23, Number(value) || 0))) : [],
        measurementsPerDay: Math.max(1, Number(schedule.measurementsPerDay || item.measurementsPerDay) || 3),
        minSpacingMinutes: Math.max(30, Number(schedule.minSpacingMinutes) || 240)
      }
    };
  }

  function syncFilterRollMeasurementFromObserver(record) {
    const filterRoll = record?.filterRoll;
    if (!filterRoll?.available || !filterRoll.measuredAt) return;
    try {
      window.ReefKeeperIntegration?.recordFilterRollMeasurement?.({
        id: filterRoll.measurementId || `observer-filter-roll-${filterRoll.measuredAt.toISOString()}`,
        captureAt: filterRoll.measuredAt.toISOString(),
        remainingPct: filterRoll.remainingPct,
        apparentOuterRadius: filterRoll.apparentOuterRadius,
        apparentCoreRadius: filterRoll.apparentCoreRadius,
        confidence: filterRoll.confidence,
        cameraId: filterRoll.cameraId || 'overview',
        sourceImageId: filterRoll.sourceImageId,
        notes: filterRoll.note || filterRoll.message || 'Overview-camera filter roller measurement.'
      });
      window.ReefKeeperIntegration?.renderFilterRollIntegrationStatus?.();
    } catch (_) {}
  }

  function normalizeDailySummary(payload) {
    const item = payload && typeof payload === 'object' ? payload : {};
    const source = item.source && typeof item.source === 'object' ? item.source : {};
    const currentCaptured = parseDate(source.currentCapturedAt);
    const previousCaptured = parseDate(source.previousCapturedAt);
    const status = ['stable', 'watch', 'attention', 'unavailable'].includes(item.status) ? item.status : 'pending';
    const list = (value, max = 5) => Array.isArray(value)
      ? value.slice(0, max).map(entry => cleanText(entry)).filter(Boolean)
      : [];
    const ok = item.ok === true && Boolean(currentCaptured && previousCaptured);
    return {
      ok,
      state: ok ? 'ready' : cleanText(item.state, 'awaiting_daily_summary'),
      status: ok ? status : 'pending',
      generatedAt: parseDate(item.generatedAt),
      headline: cleanText(item.headline, ok ? 'Daily Observer summary' : 'Daily summary is not ready yet.'),
      summary: cleanText(item.summary || item.message, 'The Pi will generate the report after today’s representative capture is selected.'),
      visibleChanges: list(item.visibleChanges),
      concerns: list(item.concerns),
      nextChecks: list(item.nextChecks, 3),
      uncertainty: cleanText(item.uncertainty),
      source: {
        currentCaptured,
        previousCaptured,
        currentImageUrl: String(source.currentImageUrl || ''),
        previousImageUrl: String(source.previousImageUrl || '')
      }
    };
  }


  function normalizeTimelapseFeed(payload) {
    const item = payload && typeof payload === 'object' ? payload : {};
    const source = item.timelapses && typeof item.timelapses === 'object' ? item.timelapses : {};
    const normalize = (slot, value) => {
      const record = value && typeof value === 'object' ? value : {};
      const generatedAt = parseDate(record.generatedAt);
      const startCapturedAt = parseDate(record.startCapturedAt);
      const endCapturedAt = parseDate(record.endCapturedAt);
      const videoUrl = String(record.videoUrl || '').trim();
      return {
        slot,
        available: record.available === true && Boolean(generatedAt && startCapturedAt && endCapturedAt && videoUrl),
        state: cleanText(record.state, 'waiting_for_history'),
        label: cleanText(record.label, slot === 'month' ? 'Rolling 30 days' : 'Rolling 7 days'),
        message: cleanText(record.message),
        generatedAt,
        startCapturedAt,
        endCapturedAt,
        frameCount: Math.max(0, Number(record.frameCount) || 0),
        durationSeconds: Math.max(0, Number(record.durationSeconds) || 0),
        sizeBytes: Math.max(0, Number(record.sizeBytes) || 0),
        coverageDays: Math.max(0, Number(record.coverageDays) || 0),
        fps: Math.max(1, Number(record.fps) || 12),
        resolution: cleanText(record.resolution, '640×360'),
        videoVersion: cleanText(record.videoVersion || record.generatedAt),
        videoUrl
      };
    };
    return {
      ok: item.ok !== false,
      updatedAt: parseDate(item.updatedAt),
      timelapses: {
        week: normalize('week', source.week),
        month: normalize('month', source.month)
      }
    };
  }

  function archiveCoverageDays(record = snapshot) {
    const oldest = record?.health?.archive?.oldestCaptureAt;
    const newest = record?.health?.archive?.newestCaptureAt;
    if (!oldest || !newest) return 0;
    return Math.max(0, (newest.getTime() - oldest.getTime()) / 86_400_000);
  }

  function timelapseWaitingText(slot, record = snapshot) {
    const required = slot === 'month' ? 30 : 7;
    const coverage = archiveCoverageDays(record);
    if (!coverage) return `Waiting for ${required} days of archived captures.`;
    if (coverage < required - 0.5) return `Archive covers ${coverage.toFixed(1)} of about ${required} days.`;
    return 'The Pi will generate this timelapse during its next scheduled daily build.';
  }

  function renderObserverTimelapses(feed, record = snapshot) {
    observerTimelapses = feed;
    const entries = ['week', 'month'].map(slot => feed.timelapses[slot]);
    const readyCount = entries.filter(item => item.available).length;
    const badge = byId('observer-timelapse-badge');
    if (badge) {
      badge.className = `observer-timelapse-badge ${readyCount ? 'ready' : 'waiting'}`;
      badge.textContent = readyCount === 2 ? '2 ready' : (readyCount === 1 ? '1 ready' : 'Building history');
    }
    setText('observer-timelapse-summary', readyCount
      ? `${readyCount} automatic timelapse${readyCount === 1 ? ' is' : 's are'} ready to play.`
      : 'The Pi will build compressed videos automatically as the local archive reaches 7 and 30 days.');

    for (const item of entries) {
      const prefix = `observer-timelapse-${item.slot}`;
      const video = byId(`${prefix}-video`);
      const placeholder = byId(`${prefix}-placeholder`);
      const button = byId(`${prefix}-play`);
      const status = byId(`${prefix}-status`);
      const meta = byId(`${prefix}-meta`);
      if (item.available) {
        const version = encodeURIComponent(item.videoVersion || item.generatedAt?.toISOString() || Date.now());
        const source = `${item.videoUrl}${item.videoUrl.includes('?') ? '&' : '?'}v=${version}`;
        if (video && video.dataset.source !== source) {
          video.pause?.();
          video.src = source;
          video.dataset.source = source;
          video.load?.();
        }
        if (video) video.hidden = false;
        if (placeholder) placeholder.hidden = true;
        if (button) { button.disabled = false; button.textContent = 'Play timelapse'; }
        if (status) status.textContent = `Generated ${formatCaptureTime(item.generatedAt?.toISOString())}`;
        if (meta) meta.textContent = `${formatCaptureTime(item.startCapturedAt?.toISOString())} → ${formatCaptureTime(item.endCapturedAt?.toISOString())} · ${item.frameCount} frames · ${Math.max(1, Math.round(item.durationSeconds))} sec · ${formatBytes(item.sizeBytes)}`;
      } else {
        if (video) { video.hidden = true; video.removeAttribute('src'); video.dataset.source = ''; }
        if (placeholder) placeholder.hidden = false;
        if (button) { button.disabled = true; button.textContent = 'Not ready yet'; }
        if (status) status.textContent = timelapseWaitingText(item.slot, record);
        if (meta) meta.textContent = item.slot === 'month' ? 'One frame about every 6 hours' : 'One frame about every hour';
      }
    }
  }

  async function fetchObserverTimelapses() {
    const response = await fetch(TIMELAPSES_ENDPOINT, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Observer timelapses returned HTTP ${response.status}`);
    return normalizeTimelapseFeed(data);
  }

  async function playObserverTimelapse(slot) {
    const item = observerTimelapses?.timelapses?.[slot];
    const video = byId(`observer-timelapse-${slot}-video`);
    if (!item?.available || !video) {
      if (typeof showToast === 'function') showToast('Timelapse is not ready yet');
      return;
    }
    try {
      video.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await video.play();
    } catch (error) {
      if (typeof showToast === 'function') showToast('Tap the video controls to play');
    }
  }

  function storedAlertIds(key) {
    const ids = new Set(sessionAlertIdSets.get(key) || []);
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(value)) value.map(String).forEach(id => ids.add(id));
    } catch (_) {}
    return ids;
  }

  function saveAlertIds(key, ids) {
    const normalized = new Set([...ids].map(String).slice(-150));
    sessionAlertIdSets.set(key, normalized);
    try { localStorage.setItem(key, JSON.stringify([...normalized])); } catch (_) {}
  }

  function readReviewedAlertHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(ALERT_HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && item.reviewKey).slice(0, 80) : [];
    } catch (_) { return []; }
  }

  function writeReviewedAlertHistory(items) {
    try { localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(items.slice(0, 80))); } catch (_) {}
  }

  function alertReviewKey(alert) {
    if (!alert) return '';
    if (alert.kind === 'system') {
      const stableId = cleanText(alert.id);
      if (stableId.startsWith('system:')) return stableId;
      const cameraId = cleanText(alert.source?.cameraId, 'overview');
      return `system:${cameraId}:${cleanText(alert.issueCode || alert.source?.issueCode, 'observer_issue')}:${alert.severity || 'watch'}`;
    }
    return `visual:${alert.id}`;
  }

  function isAlertReviewed(alert, reviewed = storedAlertIds(ALERT_REVIEWED_KEY)) {
    return reviewed.has(alertReviewKey(alert)) || reviewed.has(String(alert?.id || ''));
  }

  function alertSnapshot(alert) {
    return {
      reviewKey: alertReviewKey(alert),
      id: alert.id,
      kind: alert.kind,
      issueCode: alert.issueCode,
      severity: alert.severity,
      category: alert.category,
      title: alert.title,
      createdAt: alert.createdAt?.toISOString?.() || '',
      reviewedAt: new Date().toISOString(),
      source: { cameraId: alert.source?.cameraId || 'overview' }
    };
  }

  function rememberReviewedAlerts(alerts) {
    const history = readReviewedAlertHistory();
    const map = new Map(history.map(item => [item.reviewKey, item]));
    alerts.filter(Boolean).forEach(alert => {
      const snapshot = alertSnapshot(alert);
      const prior = map.get(snapshot.reviewKey);
      map.set(snapshot.reviewKey, {
        ...prior,
        ...snapshot,
        reviewedAt: prior?.reviewedAt || snapshot.reviewedAt,
        firstReviewedAt: prior?.firstReviewedAt || snapshot.reviewedAt,
        occurrences: Math.max(1, Number(prior?.occurrences || 1))
      });
    });
    writeReviewedAlertHistory([...map.values()].sort((a, b) => Date.parse(b.reviewedAt || 0) - Date.parse(a.reviewedAt || 0)));
  }

  function normalizeObserverAlertFeed(payload) {
    const item = payload && typeof payload === 'object' ? payload : {};
    const alerts = Array.isArray(item.alerts) ? item.alerts.slice(0, 30).map((alert, index) => {
      const source = alert?.source && typeof alert.source === 'object' ? alert.source : {};
      return {
        id: cleanText(alert?.id, `observer-alert-${index}`),
        kind: ['visual', 'system'].includes(alert?.kind || source.kind) ? (alert?.kind || source.kind) : 'visual',
        issueCode: cleanText(alert?.issueCode || source.issueCode),
        severity: ['urgent', 'watch', 'info'].includes(alert?.severity) ? alert.severity : 'watch',
        category: cleanText(alert?.category, 'other'),
        title: cleanText(alert?.title, 'Observer change needs review'),
        evidence: cleanText(alert?.evidence),
        recommendedCheck: cleanText(alert?.recommendedCheck),
        confidence: cleanText(alert?.confidence),
        createdAt: parseDate(alert?.createdAt),
        source: {
          kind: ['visual', 'system'].includes(source.kind) ? source.kind : 'visual',
          issueCode: cleanText(source.issueCode),
          cameraId: cleanText(source.cameraId, 'overview'),
          currentCapturedAt: parseDate(source.currentCapturedAt),
          previousCapturedAt: parseDate(source.previousCapturedAt)
        }
      };
    }).filter(alert => alert.title) : [];
    return {
      ok: item.ok !== false,
      updatedAt: parseDate(item.updatedAt),
      lastEvaluatedAt: parseDate(item.lastEvaluatedAt),
      currentCapturedAt: parseDate(item.currentCapturedAt),
      previousCapturedAt: parseDate(item.previousCapturedAt),
      currentAlertIds: Array.isArray(item.currentAlertIds) ? item.currentAlertIds.map(String) : [],
      alerts
    };
  }

  function alertCategoryIcon(category) {
    return {
      water_level: '🌊', skimmer: '🫧', leak_overflow: '🚨', equipment_position: '🔧',
      buildup: '🧽', camera_quality: '📷', camera_capture: '📷', publisher: '☁️',
      storage: '💾', power: '⚡', archive: '🗂️', daily_summary: '📅', other: '👁️'
    }[category] || '👁️';
  }

  function alertSeverityLabel(severity) {
    return { urgent: 'Urgent', watch: 'Watch', info: 'Info' }[severity] || 'Watch';
  }

  function markObserverAlertReviewed(id) {
    const alert = (observerAlerts?.alerts || []).find(item => item.id === id);
    if (!alert) return;
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    reviewed.add(alertReviewKey(alert));
    saveAlertIds(ALERT_REVIEWED_KEY, reviewed);
    rememberReviewedAlerts([alert]);
    renderObserverAlerts(observerAlerts || normalizeObserverAlertFeed({}));
    if (typeof showToast === 'function') showToast('Moved to reviewed history');
  }

  function markAllObserverAlertsReviewed() {
    const feed = observerAlerts || normalizeObserverAlertFeed({});
    const currentIds = new Set(feed.currentAlertIds || []);
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    const active = feed.alerts.filter(alert => currentIds.has(alert.id) && !isAlertReviewed(alert, reviewed));
    active.forEach(alert => reviewed.add(alertReviewKey(alert)));
    saveAlertIds(ALERT_REVIEWED_KEY, reviewed);
    rememberReviewedAlerts(active);
    renderObserverAlerts(feed);
    if (typeof showToast === 'function') showToast(active.length ? 'Observer alerts marked reviewed' : 'No active alerts to review');
  }

  function renderReviewedAlertHistory(feed, reviewed) {
    const currentReviewed = feed.alerts.filter(alert => isAlertReviewed(alert, reviewed));
    if (currentReviewed.length) rememberReviewedAlerts(currentReviewed);
    const history = readReviewedAlertHistory();
    setText('observer-alert-history-count', String(history.length));
    const list = byId('observer-alert-history-list');
    if (!list) return;
    list.innerHTML = history.length ? history.map(item => `<div class="observer-reviewed-history-row">
      <span>${alertCategoryIcon(item.category)}</span>
      <div><strong>${cleanText(item.title)}</strong><small>${alertSeverityLabel(item.severity)} · reviewed ${formatCaptureTime(item.reviewedAt)}${item.occurrences > 1 ? ` · ${item.occurrences} occurrences` : ''}</small></div>
    </div>`).join('') : '<div class="observer-alert-empty"><span>No reviewed alerts yet.</span></div>';
  }

  function renderObserverAlerts(feed) {
    observerAlerts = feed;
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    const currentIds = new Set(feed.currentAlertIds || []);
    const currentAlerts = feed.alerts.filter(alert => currentIds.has(alert.id));
    const canReconcileLifecycle = Boolean(feed.updatedAt || feed.lastEvaluatedAt);
    if (canReconcileLifecycle) {
      const previousActive = storedAlertIds(ALERT_ACTIVE_KEY);
      const cleared = storedAlertIds(ALERT_CLEARED_KEY);
      const currentKeys = new Set(currentAlerts.map(alertReviewKey));
      let reviewedChanged = false;
      let clearedChanged = false;

      previousActive.forEach(key => {
        if (!currentKeys.has(key)) {
          cleared.add(key);
          clearedChanged = true;
        }
      });

      currentAlerts.filter(alert => alert.kind === 'system').forEach(alert => {
        const key = alertReviewKey(alert);
        if (cleared.has(key) && reviewed.has(key)) {
          reviewed.delete(key);
          reviewedChanged = true;
        }
        if (cleared.delete(key)) clearedChanged = true;
      });

      if (reviewedChanged) saveAlertIds(ALERT_REVIEWED_KEY, reviewed);
      if (clearedChanged) saveAlertIds(ALERT_CLEARED_KEY, cleared);
      saveAlertIds(ALERT_ACTIVE_KEY, currentKeys);
    }
    const active = currentAlerts.filter(alert => !isAlertReviewed(alert, reviewed));
    const urgent = active.some(alert => alert.severity === 'urgent');
    const badge = byId('observer-alert-badge');
    const card = byId('observer-alert-card');
    if (badge) {
      const state = urgent ? 'urgent' : (active.length ? 'watch' : 'clear');
      badge.className = `observer-alert-badge ${state}`;
      badge.textContent = urgent ? 'Urgent' : (active.length ? `${active.length} new` : 'Clear');
    }
    if (card) {
      card.classList.toggle('has-urgent', urgent);
      card.classList.toggle('is-clear', active.length === 0);
    }
    const activeSystem = active.filter(alert => alert.kind === 'system');
    const activeVisual = active.filter(alert => alert.kind !== 'system');
    const alertParts = [];
    if (activeSystem.length) alertParts.push(`${activeSystem.length} system alert${activeSystem.length === 1 ? '' : 's'}`);
    if (activeVisual.length) alertParts.push(`${activeVisual.length} visual alert${activeVisual.length === 1 ? '' : 's'}`);
    setText('observer-alert-summary', alertParts.length
      ? `${alertParts.join(' and ')} need review.`
      : 'Nothing currently needs review.');
    setText('observer-alert-evaluated', feed.lastEvaluatedAt
      ? `Last evaluated ${formatCaptureTime(feed.lastEvaluatedAt.toISOString())}`
      : 'Waiting for the next evaluation');
    const list = byId('observer-alert-list');
    if (list) {
      list.innerHTML = active.length ? active.slice(0, 6).map(alert => `<article class="observer-alert-item ${alert.severity} current">
        <div class="observer-alert-item-head"><span class="observer-alert-icon">${alertCategoryIcon(alert.category)}</span><div><strong>${cleanText(alert.title)}</strong><small>${alert.kind === 'system' ? 'System monitor' : 'Daily visual comparison'} · ${alertSeverityLabel(alert.severity)} · ${formatCaptureTime(alert.createdAt?.toISOString())}</small></div><b>${alertSeverityLabel(alert.severity)}</b></div>
        ${alert.evidence ? `<p><strong>Evidence:</strong> ${cleanText(alert.evidence)}</p>` : ''}
        ${alert.recommendedCheck ? `<p><strong>Recommended check:</strong> ${cleanText(alert.recommendedCheck)}</p>` : ''}
        <div class="observer-alert-item-actions">
          ${alert.kind !== 'system' && dailySummary?.ok ? `<button type="button" onclick="openObserverAlertComparison('${alert.id}')">Open comparison</button>` : ''}
          <button type="button" onclick="markObserverAlertReviewed('${alert.id}')">Mark reviewed</button>
        </div>
      </article>`).join('') : '<div class="observer-alert-empty"><strong>All clear.</strong><span>Reviewed alerts are stored in the collapsed history below.</span></div>';
    }
    const reviewAll = byId('observer-alert-review-all');
    if (reviewAll) reviewAll.disabled = active.length === 0;
    renderReviewedAlertHistory(feed, reviewed);
  }

  function announceNewObserverAlerts(feed) {
    const seen = storedAlertIds(ALERT_SEEN_KEY);
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    const current = feed.alerts.filter(alert => feed.currentAlertIds.includes(alert.id));
    const fresh = current.filter(alert => !seen.has(alertReviewKey(alert)) && !isAlertReviewed(alert, reviewed));
    current.forEach(alert => seen.add(alertReviewKey(alert)));
    saveAlertIds(ALERT_SEEN_KEY, seen);
    if (!fresh.length || typeof showToast !== 'function') return;
    const urgent = fresh.some(alert => alert.severity === 'urgent');
    showToast(urgent ? '🚨 New urgent Observer alert' : `👁️ ${fresh.length} new Observer alert${fresh.length === 1 ? '' : 's'}`);
  }

  async function fetchObserverAlerts() {
    const response = await fetch(ALERTS_ENDPOINT, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Observer alerts returned HTTP ${response.status}`);
    return normalizeObserverAlertFeed(data);
  }

  function dailyStatusLabel(status) {
    return { stable: 'Stable', watch: 'Watch', attention: 'Attention', unavailable: 'Limited', pending: 'Waiting' }[status] || 'Waiting';
  }

  function dailyListHtml(title, items, emptyText) {
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    return `<div class="observer-daily-section"><strong>${title}</strong>${safeItems.length
      ? `<ul>${safeItems.map(item => `<li>${cleanText(item)}</li>`).join('')}</ul>`
      : `<p>${cleanText(emptyText)}</p>`}</div>`;
  }

  function compactSummaryText(value) {
    const clean = cleanText(value);
    if (!clean) return '';
    const sentence = clean.match(/^.*?[.!?](?:\s|$)/)?.[0] || clean;
    return sentence.length > 220 ? `${sentence.slice(0, 217).trim()}…` : sentence.trim();
  }

  function renderDailySummary(report) {
    dailySummary = report;
    const badge = byId('observer-daily-badge');
    const card = byId('observer-daily-card');
    if (badge) {
      badge.className = `observer-daily-badge ${report.status}`;
      badge.textContent = dailyStatusLabel(report.status);
    }
    if (card) card.classList.toggle('is-ready', report.ok);
    setText('observer-daily-headline', report.headline);
    setText('observer-daily-summary', compactSummaryText(report.summary));
    setText('observer-daily-source', report.ok
      ? `${formatCaptureTime(report.source.previousCaptured?.toISOString())} → ${formatCaptureTime(report.source.currentCaptured?.toISOString())}`
      : 'Waiting for today and the prior day representative frames.');
    setText('observer-daily-generated', report.generatedAt ? `Generated ${formatCaptureTime(report.generatedAt.toISOString())}` : 'Generated automatically once per day');
    const details = byId('observer-daily-details');
    if (details) {
      details.hidden = !report.ok;
      details.innerHTML = report.ok ? [
        dailyListHtml('Visible changes', report.visibleChanges, 'No meaningful visible change was identified.'),
        dailyListHtml('Concerns', report.concerns, 'No clear visual concern was identified.'),
        dailyListHtml('Next checks', report.nextChecks, 'No additional check was recommended.'),
        report.uncertainty ? `<div class="observer-daily-uncertainty"><strong>Image limits</strong><p>${cleanText(report.uncertainty)}</p></div>` : ''
      ].join('') : '';
    }
    const compare = byId('observer-daily-compare-btn');
    if (compare) compare.disabled = !report.ok || !report.source.currentImageUrl || !report.source.previousImageUrl;
  }

  async function fetchObserverDailySummary() {
    const response = await fetch(DAILY_SUMMARY_ENDPOINT, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Daily summary returned HTTP ${response.status}`);
    return normalizeDailySummary(data);
  }

  function effectiveHealth(record, captured, publishedAt) {
    const health = normalizeHealth(record.health);
    const publishAgeMs = publishedAt ? Date.now() - publishedAt.getTime() : Number.POSITIVE_INFINITY;
    const captureAgeMs = captured ? Date.now() - captured.getTime() : Number.POSITIVE_INFINITY;
    const issues = [...health.issues];

    if (publishAgeMs > PUBLISH_OFFLINE_AFTER_MS) {
      health.publisher.status = 'offline';
      health.publisher.message = `No remote update has arrived for ${formatAge(publishedAt).toLowerCase()}.`;
      if (!issues.some(item => item.code === 'publisher_stale')) {
        issues.unshift({ code: 'publisher_stale', severity: 'critical', message: health.publisher.message });
      }
    } else if (publishAgeMs > PUBLISH_STALE_AFTER_MS) {
      health.publisher.status = 'attention';
      health.publisher.message = `Last remote update arrived ${formatAge(publishedAt).toLowerCase()}.`;
      if (!issues.some(item => item.code === 'publisher_delayed')) {
        issues.unshift({ code: 'publisher_delayed', severity: 'warning', message: health.publisher.message });
      }
    } else if (publishedAt && health.publisher.status === 'pending') {
      health.publisher.status = 'healthy';
      health.publisher.message = `Last remote update arrived ${formatAge(publishedAt).toLowerCase()}.`;
    }

    if (captureAgeMs > CAPTURE_OFFLINE_AFTER_MS && health.capture.status !== 'offline') {
      health.capture.status = 'offline';
      health.capture.message = `Latest capture is ${formatAge(captured).toLowerCase()}.`;
    } else if (captureAgeMs > CAPTURE_STALE_AFTER_MS && health.capture.status === 'healthy') {
      health.capture.status = 'attention';
      health.capture.message = `Latest capture is ${formatAge(captured).toLowerCase()}.`;
    }

    const componentStates = [health.capture.status, health.publisher.status, health.storage.status, health.power.status, health.dailySummary.status, health.localMonitoring.status, health.archive.status].filter(state => state !== 'pending');
    if (componentStates.includes('offline')) health.status = 'offline';
    else if (componentStates.includes('attention')) health.status = 'attention';
    else if (componentStates.every(state => state === 'healthy')) health.status = 'healthy';

    if (health.status === 'healthy') health.summary = 'Camera capture, remote publishing, storage, services, Pi power, and local visual checks are healthy.';
    else if (health.status === 'attention') health.summary = 'Observer is still reporting, but one or more checks need attention.';
    else if (health.status === 'offline') health.summary = health.publisher.status === 'offline'
      ? 'The app is not receiving current Observer health reports.'
      : 'A critical local Observer component is unavailable.';

    health.issues = issues;
    return health;
  }

  function isMaintenanceSceneAdvisory(health) {
    if (!health || health.localMonitoring?.scene?.status !== 'attention') return false;
    if (health.localMonitoring.scene.movementLikely === true) return false;
    const materialIssues = (health.issues || []).filter(issue =>
      ['critical', 'warning'].includes(issue.severity) && issue.code !== 'sump_scene_changed'
    );
    const hardStates = [
      health.capture?.status,
      health.publisher?.status,
      health.storage?.status,
      health.power?.status,
      health.archive?.status
    ];
    return materialIssues.length === 0 && !hardStates.some(state => state === 'attention' || state === 'offline');
  }

  function maintenanceSceneGuidance() {
    return 'The fixed-view monitor noticed a persistent visual difference. Skimmer, GFO reactor, hose, lid, or cord movement after normal maintenance can cause this. Review the current image; if the equipment placement is expected, mark the alert reviewed. No exact image reset is required.';
  }

  function normalizeCameraRecord(record, cameraId, rootRecord = {}) {
    const source = record && typeof record === 'object' ? record : {};
    const captured = captureDate(source);
    const publishedAt = parseDate(source.publishedAt || source.receivedAt || (cameraId === 'overview' ? (rootRecord.publishedAt || rootRecord.receivedAt) : null));
    const imageUrl = String(source.thumbnailUrl || source.imageUrl || source.latestImageUrl || '').trim();
    const configured = source.configured === true || Boolean(source.receivedAt || publishedAt || captured || imageUrl);
    const health = effectiveHealth(source, captured, publishedAt);

    let state = 'pending';
    let label = 'Checking';
    if (!configured) { state = 'pending'; label = 'Not connected'; }
    else if (health.status === 'healthy') { state = 'online'; label = 'Healthy'; }
    else if (health.status === 'attention' && isMaintenanceSceneAdvisory(health)) { state = 'advisory'; label = 'Advisory'; }
    else if (health.status === 'attention') { state = 'stale'; label = 'Attention'; }
    else { state = 'offline'; label = 'Offline'; }

    const defaultLabel = cameraId === 'return' ? 'Return chamber' : 'Sump overview';
    return {
      raw: source,
      cameraId,
      configured,
      ok: state === 'online' || state === 'advisory',
      stale: state === 'stale',
      state,
      label,
      captured,
      publishedAt,
      imageUrl,
      health,
      comparisons: cameraId === 'overview' ? {
        previous: normalizeComparison('previous', source.comparisons?.previous),
        dayAgo: normalizeComparison('dayAgo', source.comparisons?.dayAgo),
        weekAgo: normalizeComparison('weekAgo', source.comparisons?.weekAgo)
      } : {
        previous: normalizeComparison('previous', null),
        dayAgo: normalizeComparison('dayAgo', null),
        weekAgo: normalizeComparison('weekAgo', null)
      },
      filterRoll: cameraId === 'overview' ? normalizeFilterRoll(source.filterRoll) : normalizeFilterRoll({ enabled:false, configured:false, cameraId:'return' }),
      receivedAt: parseDate(source.receivedAt || rootRecord.receivedAt),
      cameraLabel: String(source.cameraLabel || source.camera?.label || defaultLabel),
      stream: String(source.stream || source.camera?.stream || 'stream1'),
      resolution: String(source.resolution || source.camera?.resolution || '2560×1440'),
      intervalMinutes: Number(source.captureIntervalMinutes || source.intervalMinutes || 5) || 5,
      publisherVersion: String(source.publisherVersion || rootRecord.publisherVersion || health.publisher?.version || '—'),
      sizeBytes: Number(source.sizeBytes ?? source.size_bytes),
      storageLabel: String(source.storage?.label || rootRecord.storage?.label || source.storageLabel || 'Local Pi drive'),
      storageTotalBytes: Number(source.storage?.totalBytes || rootRecord.storage?.totalBytes || health.storage?.totalBytes || 0),
      storageAvailableBytes: Number(source.storage?.availableBytes || rootRecord.storage?.availableBytes || health.storage?.availableBytes || 0),
      storageUsedPercent: Number(source.storage?.usedPercent ?? rootRecord.storage?.usedPercent ?? health.storage?.usedPercent),
      message: String(source.message || source.error || '')
    };
  }

  function normalizeRecord(payload) {
    const root = payload && typeof payload === 'object' ? payload : {};
    const cameras = root.cameras && typeof root.cameras === 'object' ? root.cameras : {};
    const overviewSource = cameras.overview && typeof cameras.overview === 'object' ? cameras.overview : root;
    const returnSource = cameras.return && typeof cameras.return === 'object'
      ? cameras.return
      : { configured: false, ok: false, cameraLabel: 'Return chamber', stream: 'stream1', resolution: '2560×1440' };
    return {
      raw: root,
      overview: normalizeCameraRecord(overviewSource, 'overview', root),
      return: normalizeCameraRecord(returnSource, 'return', root)
    };
  }

  function activeObserverRecord() {
    return observerFeed?.[selectedCameraId] || observerFeed?.overview || snapshot;
  }

  function renderCameraSelector() {
    for (const cameraId of ['overview', 'return']) {
      const button = byId(`observer-camera-${cameraId}`);
      const record = observerFeed?.[cameraId];
      if (!button) continue;
      button.classList.toggle('active', selectedCameraId === cameraId);
      button.setAttribute('aria-pressed', selectedCameraId === cameraId ? 'true' : 'false');
      button.classList.toggle('unavailable', !record?.configured);
      const state = button.querySelector('small');
      if (state) state.textContent = record?.configured ? record.label : 'Waiting';
    }
    document.querySelectorAll('[data-observer-overview-only]').forEach(element => {
      element.hidden = selectedCameraId !== 'overview';
    });
  }

  function selectObserverCamera(cameraId) {
    if (!['overview', 'return'].includes(cameraId)) return;
    selectedCameraId = cameraId;
    renderCameraSelector();
    const record = activeObserverRecord();
    if (record) renderObserver(record);
  }

  function setBadge(id, record) {
    const badge = byId(id);
    if (!badge) return;
    badge.className = `observer-state-badge ${record.state}`;
    badge.textContent = record.label;
  }

  function setPlaceholderVisible(placeholder, visible) {
    placeholder.hidden = !visible;
    placeholder.classList.toggle('is-visible', visible);
    placeholder.style.display = visible ? 'flex' : 'none';
  }

  function updateImage(imageId, placeholderId, timeId, record) {
    const image = byId(imageId);
    const placeholder = byId(placeholderId);
    const time = byId(timeId);
    if (!image || !placeholder) return;

    if (record.imageUrl) {
      const separator = record.imageUrl.includes('?') ? '&' : '?';
      const cacheKey = record.captured?.getTime() || Date.now();
      setPlaceholderVisible(placeholder, false);
      image.hidden = true;
      image.onload = () => { setPlaceholderVisible(placeholder, false); image.hidden = false; };
      image.onerror = () => { image.hidden = true; setPlaceholderVisible(placeholder, true); };
      image.src = `${record.imageUrl}${separator}rk=${encodeURIComponent(cacheKey)}`;
      if (time) {
        time.textContent = formatCaptureTime(record.captured?.toISOString());
        time.hidden = false;
      }
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      setPlaceholderVisible(placeholder, true);
      if (time) time.hidden = true;
    }
  }

  function renderHistoryOptions(record) {
    const summary = byId('observer-history-summary');
    const available = Object.values(record.comparisons).filter(item => item.available);
    if (summary) {
      summary.textContent = available.length
        ? `${available.length} historical comparison${available.length === 1 ? '' : 's'} ready.`
        : 'Historical comparison images have not been published yet.';
    }

    for (const slot of Object.keys(HISTORY_LABELS)) {
      const item = record.comparisons[slot];
      const button = byId(`observer-compare-${slot}`);
      const time = byId(`observer-compare-${slot}-time`);
      if (button) button.disabled = !record.imageUrl || !item.available;
      if (time) time.textContent = item.available ? formatCaptureTime(item.captured?.toISOString()) : 'Not available yet';
    }
  }

  function healthLabel(state) {
    return { healthy: 'Healthy', attention: 'Attention', offline: 'Offline', pending: 'Checking' }[healthState(state)] || 'Checking';
  }

  function setHealthRow(name, state, detail) {
    const row = byId(`observer-health-${name}-row`);
    const stateNode = byId(`observer-health-${name}-state`);
    const detailNode = byId(`observer-health-${name}-detail`);
    const normalized = healthState(state);
    if (row) row.className = `observer-health-row ${normalized}`;
    if (stateNode) stateNode.textContent = healthLabel(normalized);
    if (detailNode) detailNode.textContent = detail || 'No details received.';
  }

  function setLocalMonitorItem(name, state, detail, label) {
    const item = byId(`observer-local-${name}-item`);
    const stateNode = byId(`observer-local-${name}-state`);
    const detailNode = byId(`observer-local-${name}-detail`);
    const normalized = healthState(state);
    if (item) item.className = `observer-local-monitor-item ${normalized}`;
    if (stateNode) stateNode.textContent = label || healthLabel(normalized);
    if (detailNode) detailNode.textContent = detail || 'No details received.';
  }

  function renderLocalMonitoring(local, maintenanceAdvisory = false) {
    const source = local && typeof local === 'object' ? local : normalizeHealth({}).localMonitoring;
    const badge = byId('observer-local-monitor-badge');
    if (badge) {
      badge.className = `observer-health-badge ${maintenanceAdvisory ? 'advisory' : source.status}`;
      badge.textContent = source.enabled === false ? 'Disabled' : (maintenanceAdvisory ? 'Advisory' : healthLabel(source.status));
    }
    setText('observer-local-monitor-summary', maintenanceAdvisory ? 'Expected equipment-position variation was detected after normal sump activity.' : source.message);
    const qualityDetail = `${source.imageQuality.message}${source.mode && source.mode !== 'unknown' ? ` Mode: ${source.mode}.` : ''}`;
    setLocalMonitorItem('image', source.imageQuality.status, qualityDetail);
    const sceneDetail = source.scene.baselineReady
      ? `${source.scene.message} Change score: ${source.scene.changeScore.toFixed(2)}.`
      : source.scene.message;
    setLocalMonitorItem('scene', source.scene.status, maintenanceAdvisory ? maintenanceSceneGuidance() : sceneDetail, maintenanceAdvisory ? 'Advisory' : (source.scene.baselineReady ? healthLabel(source.scene.status) : 'Learning'));
    if (maintenanceAdvisory) {
      const sceneItem = byId('observer-local-scene-item');
      if (sceneItem) sceneItem.className = 'observer-local-monitor-item advisory';
    }
    const waterLabel = source.waterLevel.configured ? healthLabel(source.waterLevel.status) : 'Not set';
    const waterDetail = source.waterLevel.configured && source.waterLevel.confidence
      ? `${source.waterLevel.message} Confidence: ${Math.round(source.waterLevel.confidence * 100)}%.`
      : source.waterLevel.message;
    setLocalMonitorItem('water', source.waterLevel.status, waterDetail, waterLabel);
    const waterItem = byId('observer-local-water-item');
    if (waterItem) waterItem.hidden = selectedCameraId !== 'return';
  }

  function renderObserverHealth(record) {
    const health = record.health;
    const maintenanceAdvisory = isMaintenanceSceneAdvisory(health);
    const badge = byId('observer-health-badge');
    if (badge) {
      badge.className = `observer-health-badge ${maintenanceAdvisory ? 'advisory' : health.status}`;
      badge.textContent = maintenanceAdvisory ? 'Advisory' : healthLabel(health.status);
    }
    const healthStates = [health.capture.status, health.publisher.status, health.storage.status, health.power.status, health.dailySummary.status, maintenanceAdvisory ? 'healthy' : health.localMonitoring.status, health.archive.status];
    const attentionCount = healthStates.filter(state => state === 'attention' || state === 'offline').length;
    const healthyCount = healthStates.filter(state => state === 'healthy').length;
    const checkingCount = healthStates.filter(state => state === 'pending').length;
    const summaryParts = [];
    if (maintenanceAdvisory) summaryParts.push('Expected sump-view variation · review only');
    if (attentionCount) summaryParts.push(`${attentionCount} need${attentionCount === 1 ? 's' : ''} attention`);
    if (healthyCount) summaryParts.push(`${healthyCount} healthy`);
    if (checkingCount) summaryParts.push(`${checkingCount} checking`);
    setText('observer-health-summary', summaryParts.join(' · ') || health.summary);
    const guidance = byId('observer-health-guidance');
    if (guidance) {
      guidance.hidden = !maintenanceAdvisory;
      guidance.innerHTML = maintenanceAdvisory ? `<strong>What to do</strong><span>${maintenanceSceneGuidance()}</span>` : '';
    }
    setHealthRow('capture', health.capture.status, health.capture.message);
    setHealthRow('publisher', health.publisher.status, health.publisher.message);

    const storageDetail = health.storage.availableBytes
      ? `${health.storage.message} ${formatBytes(health.storage.availableBytes)} free; ${Number(health.storage.usedPercent || 0).toFixed(1)}% used.`
      : health.storage.message;
    setHealthRow('storage', health.storage.status, storageDetail);
    setHealthRow('power', health.power.status, `${health.power.message}${health.power.throttledHex ? ` (${health.power.throttledHex})` : ''}`);

    const dailyDetail = health.dailySummary.nextAttemptAt
      ? `${health.dailySummary.message} Next attempt ${formatCaptureTime(health.dailySummary.nextAttemptAt.toISOString())}.`
      : health.dailySummary.message;
    setHealthRow('daily', health.dailySummary.status, dailyDetail);
    renderLocalMonitoring(health.localMonitoring, maintenanceAdvisory);

    const servicesHealthy = health.services.captureTimerActive && health.services.publishTimerActive;
    const servicesState = servicesHealthy ? 'healthy' : 'attention';
    const servicesDetail = `Capture timer: ${health.services.captureTimerState}; publisher timer: ${health.services.publishTimerState}.`;
    setHealthRow('services', servicesState, servicesDetail);

    const readyLabels = (health.archive.historySlotsReady || []).map(slot => HISTORY_LABELS[slot] || slot);
    const dailyReady = health.archive.dailySummaryFramesReady ? ' Daily summary frames ready.' : ' Daily summary frames still building.';
    const archiveDetail = `${health.archive.captureCount || 0} captures. ${readyLabels.length ? `Ready: ${readyLabels.join(', ')}.` : 'Historical slots are still building.'}${dailyReady}`;
    setHealthRow('archive', health.archive.status, archiveDetail);

    const issuesBox = byId('observer-health-issues');
    if (issuesBox) {
      const issues = health.issues.filter(item => item.message);
      issuesBox.hidden = !issues.length;
      issuesBox.innerHTML = issues.map(item => {
        const advisory = maintenanceAdvisory && item.code === 'sump_scene_changed';
        const message = advisory ? maintenanceSceneGuidance() : item.message;
        return `<div class="observer-health-issue ${advisory ? 'advisory' : item.severity}">${message.replace(/[<>]/g, '')}</div>`;
      }).join('');
    }
  }

  function diagnosticLine(label, value) {
    return `${label}: ${value || '—'}`;
  }

  function buildObserverDiagnosticReport(record = snapshot) {
    if (!record) return 'Reef Keeper Aquarium Observer diagnostic\nNo Observer status is loaded.';
    const health = record.health;
    const ready = (health.archive.historySlotsReady || []).map(slot => HISTORY_LABELS[slot] || slot).join(', ') || 'none';
    const issues = health.issues.length
      ? health.issues.map(item => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join('\n')
      : '- None reported';
    return [
      'Reef Keeper Aquarium Observer diagnostic',
      `Generated: ${new Date().toISOString()}`,
      diagnosticLine('Overall status', healthLabel(health.status)),
      diagnosticLine('Summary', health.summary),
      diagnosticLine('Last capture', record.captured?.toISOString()),
      diagnosticLine('Capture age', formatAge(record.captured)),
      diagnosticLine('Last publish', record.publishedAt?.toISOString()),
      diagnosticLine('Publish age', formatAge(record.publishedAt)),
      diagnosticLine('Publisher version', record.publisherVersion),
      diagnosticLine('Camera capture', `${healthLabel(health.capture.status)} — ${health.capture.message}`),
      diagnosticLine('Capture timer', health.services.captureTimerState),
      diagnosticLine('Publisher timer', health.services.publishTimerState),
      diagnosticLine('Storage', `${healthLabel(health.storage.status)} — mounted=${health.storage.mounted === true}, writable=${health.storage.writable === true}`),
      diagnosticLine('Storage space', `${formatBytes(health.storage.availableBytes)} free; ${Number(health.storage.usedPercent || 0).toFixed(1)}% used`),
      diagnosticLine('Pi power', `${health.power.message}${health.power.throttledHex ? ` (${health.power.throttledHex})` : ''}`),
      diagnosticLine('Daily monitoring', `${healthLabel(health.dailySummary.status)} — ${health.dailySummary.message}`),
      diagnosticLine('Daily attempts', `${health.dailySummary.attemptCount}/${health.dailySummary.maxAttempts}${health.dailySummary.nextAttemptAt ? `; next ${health.dailySummary.nextAttemptAt.toISOString()}` : ''}`),
      diagnosticLine('Local visual monitoring', `${healthLabel(health.localMonitoring.status)} — ${health.localMonitoring.message}`),
      diagnosticLine('Image quality', `${healthLabel(health.localMonitoring.imageQuality.status)} — ${health.localMonitoring.imageQuality.message}`),
      diagnosticLine('Scene stability', `${healthLabel(health.localMonitoring.scene.status)} — score=${health.localMonitoring.scene.changeScore.toFixed(3)}; ${health.localMonitoring.scene.message}`),
      diagnosticLine('Water level', health.localMonitoring.waterLevel.configured ? `${healthLabel(health.localMonitoring.waterLevel.status)} — delta=${health.localMonitoring.waterLevel.deltaPercent.toFixed(2)}%; confidence=${health.localMonitoring.waterLevel.confidence.toFixed(2)}` : 'Not calibrated'),
      diagnosticLine('Archive count', health.archive.captureCount),
      diagnosticLine('History ready', ready),
      'Issues:',
      issues
    ].join('\n');
  }

  async function copyObserverDiagnosticReport() {
    const report = buildObserverDiagnosticReport();
    try {
      await navigator.clipboard.writeText(report);
      if (typeof showToast === 'function') showToast('📋 Observer diagnostic copied');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (typeof showToast === 'function') showToast(copied ? '📋 Observer diagnostic copied' : '⚠️ Could not copy diagnostic');
    }
  }

  function renderObserver(record) {
    snapshot = record;
    const overview = observerFeed?.overview || record;
    renderCameraSelector();
    const captureIso = record.captured?.toISOString() || '';
    const capturedLabel = formatCaptureTime(captureIso);
    const ageLabel = formatAge(record.captured);
    const intervalLabel = `Every ${record.intervalMinutes} min`;

    setBadge('observer-preview-badge', overview);
    setBadge('observer-detail-badge', record);
    updateImage('observer-preview-image', 'observer-preview-placeholder', 'observer-preview-image-time', overview);
    updateImage('observer-detail-image', 'observer-detail-placeholder', 'observer-detail-image-time', record);

    setText('observer-preview-captured', formatCaptureTime(overview.captured?.toISOString()));
    setText('observer-preview-age', formatAge(overview.captured));
    setText('observer-preview-interval', `Every ${overview.intervalMinutes} min`);
    setText('observer-detail-eyebrow', record.cameraId === 'return' ? 'Dedicated water-level camera' : 'Sump overview camera');
    setText('observer-detail-title', `${record.cameraLabel} · ${record.stream}`);
    setText('observer-detail-status', record.label);
    setText('observer-detail-captured', capturedLabel);
    setText('observer-detail-age', ageLabel);
    setText('observer-detail-interval', `${record.intervalMinutes} minutes`);
    setText('observer-detail-camera', record.cameraLabel);
    setText('observer-detail-stream', `${record.stream} · ${record.resolution}`);
    setText('observer-detail-size', formatBytes(record.sizeBytes));
    setText('observer-detail-published', `${formatCaptureTime(record.publishedAt?.toISOString())} · ${formatAge(record.publishedAt)}`);
    setText('observer-detail-publisher', record.publisherVersion === '—' ? 'Waiting for version' : `v${record.publisherVersion}`);
    setText('observer-detail-storage', record.storageLabel);
    setText('observer-detail-drive-space', record.storageAvailableBytes ? `${formatBytes(record.storageAvailableBytes)} free · ${Number(record.storageUsedPercent || 0).toFixed(1)}% used` : '—');
    renderObserverHealth(record);
    if (record.cameraId === 'overview') renderHistoryOptions(record);
    if (observerTimelapses && record.cameraId === 'overview') renderObserverTimelapses(observerTimelapses, record);

    const note = byId('observer-connection-note');
    if (note) {
      const maintenanceAdvisory = isMaintenanceSceneAdvisory(record.health);
      const shouldShow = !record.configured || record.health.status !== 'healthy';
      note.hidden = !shouldShow;
      note.classList.toggle('advisory', maintenanceAdvisory);
      if (shouldShow) {
        if (record.health.capture.status === 'offline') {
          note.innerHTML = `<strong>The camera capture needs attention.</strong><span>${cleanText(record.health.capture.message, 'The latest capture is not current.')}</span>`;
        } else if (record.health.storage.status === 'offline') {
          note.innerHTML = `<strong>The Observer drive needs attention.</strong><span>${cleanText(record.health.storage.message, 'The archive drive is unavailable or not writable.')}</span>`;
        } else if (maintenanceAdvisory) {
          note.innerHTML = '<strong>Expected sump-view variation detected.</strong><span>Review the image and mark the matching alert reviewed if the equipment movement is normal after maintenance. No exact image reset is required.</span>';
        } else if (record.configured) {
          note.innerHTML = `<strong>Observer is reporting with a warning.</strong><span>${cleanText(record.health.summary || record.message || 'Open Health and diagnostics for details.')}</span>`;
        } else {
          note.innerHTML = '<strong>Observer is not connected.</strong><span>Open Health and diagnostics after the Pi publisher is installed.</span>';
        }
      }
    }

    const analyze = byId('observer-analyze-btn');
    if (analyze) {
      analyze.disabled = !record.imageUrl;
      analyze.textContent = record.cameraId === 'return' ? 'Analyze return chamber' : 'Analyze latest capture';
    }
  }

  async function fetchObserverStatus() {
    const response = await fetch(STATUS_ENDPOINT, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Observer status returned HTTP ${response.status}`);
    return normalizeRecord(data);
  }

  async function refreshAquariumObserver(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (refreshInFlight) return refreshInFlight;
    const buttons = Array.from(document.querySelectorAll('[onclick^="refreshAquariumObserver"]'));
    buttons.forEach(button => { button.disabled = true; });
    refreshInFlight = (async () => {
      try {
        const [feed, report, alerts, timelapses] = await Promise.all([
          fetchObserverStatus(),
          fetchObserverDailySummary().catch(error => normalizeDailySummary({ ok: false, state: 'temporarily_unavailable', message: error.message || String(error) })),
          fetchObserverAlerts().catch(() => normalizeObserverAlertFeed({ ok: false, alerts: [] })),
          fetchObserverTimelapses().catch(() => normalizeTimelapseFeed({ ok: false, timelapses: {} }))
        ]);
        observerFeed = feed;
        syncFilterRollMeasurementFromObserver(feed.overview);
        const record = activeObserverRecord() || feed.overview;
        renderObserver(record);
        renderDailySummary(report);
        renderObserverAlerts(alerts);
        if (selectedCameraId === 'overview') renderObserverTimelapses(timelapses, observerFeed?.overview || record);
        announceNewObserverAlerts(alerts);
        if (event && typeof showToast === 'function') {
          const message = record.health.status === 'healthy' ? '✅ Observer health refreshed' : '⚠️ Observer health needs attention';
          showToast(message);
        }
        return record;
      } catch (error) {
        observerFeed = normalizeRecord({ configured: true, ok: false, error: error.message || String(error) });
        const record = activeObserverRecord() || observerFeed.overview;
        renderObserver(record);
        if (event && typeof showToast === 'function') showToast('⚠️ Could not refresh Observer status');
        return record;
      } finally {
        refreshInFlight = null;
        buttons.forEach(button => { button.disabled = false; });
      }
    })();
    return refreshInFlight;
  }

  function openAquariumObserver() {
    if (typeof window.rkDirectGo === 'function') window.rkDirectGo('observer');
    else if (typeof window.showPage === 'function') window.showPage('observer');
    document.querySelectorAll('.nav-btn').forEach(button => button.classList.remove('active'));
    document.querySelector('.nav-btn[data-workspace="vision"]')?.classList.add('active');
    setTimeout(() => refreshAquariumObserver(), 30);
  }

  async function imageAttachmentFromUrl(url, name) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Image returned HTTP ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
    const dataUrl = await prepareAskAiImage(file);
    return { kind: 'image', name, type: 'image/jpeg', dataUrl, originalType: blob.type || 'image/jpeg' };
  }

  function openImagesInChat(images, prompt, toast) {
    attachedFileContext = {
      kind: 'image-set',
      name: images.length === 1 ? images[0].name : `${images.length} Observer photos`,
      images
    };
    updateAttachmentStatus();
    if (typeof window.rkDirectGo === 'function') window.rkDirectGo('chat');
    else if (typeof window.showPage === 'function') window.showPage('chat');
    const input = byId('chat-input');
    if (input) {
      input.value = prompt;
      input.focus();
      try { autoResize(input); } catch (_) {}
    }
    if (typeof showToast === 'function') showToast(toast);
  }

  async function analyzeLatestObserverCapture() {
    if (!snapshot?.imageUrl) {
      if (typeof showToast === 'function') showToast('Remote image is not available yet');
      return;
    }
    const button = byId('observer-analyze-btn');
    if (button) { button.disabled = true; button.textContent = 'Preparing image…'; }
    try {
      const cameraName = snapshot.cameraId === 'return' ? 'return chamber' : 'sump overview';
      const image = await imageAttachmentFromUrl(snapshot.imageUrl, `aquarium-observer-${snapshot.cameraId}-latest.jpg`);
      const prompt = [`This image is from the dedicated ${cameraName} camera.`, OBSERVER_ANALYSIS_PROMPT].join('\n\n');
      openImagesInChat([image], prompt, `📹 ${snapshot.cameraLabel} capture ready for AI`);
    } catch (error) {
      console.warn('Could not prepare Observer image', error);
      if (typeof showToast === 'function') showToast(`⚠️ ${error.message || 'Could not load Observer image'}`);
    } finally {
      if (button) { button.textContent = snapshot?.cameraId === 'return' ? 'Analyze return chamber' : 'Analyze latest capture'; button.disabled = !snapshot?.imageUrl; }
    }
  }

  async function compareObserverHistory(slot) {
    if (snapshot?.cameraId !== 'overview') return;
    const comparison = snapshot?.comparisons?.[slot];
    if (!snapshot?.imageUrl || !comparison?.available) {
      if (typeof showToast === 'function') showToast('That historical comparison is not available yet');
      return;
    }
    const button = byId(`observer-compare-${slot}`);
    const originalText = button?.textContent || 'Compare';
    if (button) { button.disabled = true; button.textContent = 'Preparing…'; }
    try {
      const [older, latest] = await Promise.all([
        imageAttachmentFromUrl(comparison.imageUrl, `observer-${slot}-${comparison.captured?.toISOString().slice(0, 10) || 'older'}.jpg`),
        imageAttachmentFromUrl(snapshot.imageUrl, 'observer-latest.jpg')
      ]);
      const olderTime = formatCaptureTime(comparison.captured?.toISOString());
      const latestTime = formatCaptureTime(snapshot.captured?.toISOString());
      const prompt = [
        `Compare these two sump-camera images in chronological order: Image 1 was captured ${olderTime}; Image 2 was captured ${latestTime}.`,
        'First decide whether lighting, night vision, framing, camera movement, blur, obstruction, or reflections make the comparison unreliable.',
        'Then describe only visible changes between Image 1 and Image 2.',
        'Check water level, skimmer foam or cup condition, filter roller position, visible plumbing or tubing, equipment position, salt creep, condensation, algae or biofilm, debris, microbubbles, cloudiness, and possible leak or overflow evidence—but only where visible in both frames.',
        'Separate: Confirmed visible change; Possible change needing verification; No meaningful visible change; What cannot be determined.',
        'Do not infer pump operation, flow rate, water chemistry, or hidden leaks. Do not call normal lighting differences a tank change.',
        'End with no more than two practical next checks, ranked by urgency.'
      ].join('\n\n');
      openImagesInChat([older, latest], prompt, `🆚 ${comparison.label} and latest capture ready`);
    } catch (error) {
      console.warn('Could not prepare Observer comparison', error);
      if (typeof showToast === 'function') showToast(`⚠️ ${error.message || 'Could not load comparison images'}`);
    } finally {
      if (button) { button.textContent = originalText; button.disabled = !snapshot?.imageUrl || !comparison?.available; }
    }
  }

  async function openDailySummaryComparison() {
    const report = dailySummary;
    if (!report?.ok || !report.source.previousImageUrl || !report.source.currentImageUrl) {
      if (typeof showToast === 'function') showToast('Daily comparison frames are not available yet');
      return;
    }
    const button = byId('observer-daily-compare-btn');
    const originalText = button?.textContent || 'Open comparison in Ask AI';
    if (button) { button.disabled = true; button.textContent = 'Preparing…'; }
    try {
      const [previous, current] = await Promise.all([
        imageAttachmentFromUrl(report.source.previousImageUrl, 'observer-daily-previous.jpg'),
        imageAttachmentFromUrl(report.source.currentImageUrl, 'observer-daily-current.jpg')
      ]);
      const prompt = [
        `Review the daily sump-camera comparison. Image 1 is from ${formatCaptureTime(report.source.previousCaptured?.toISOString())}; Image 2 is from ${formatCaptureTime(report.source.currentCaptured?.toISOString())}.`,
        'Verify the automatic daily summary against the pixels. Describe only visible differences and explicitly account for lighting, night vision, framing, blur, reflections, obstruction, and camera movement.',
        'Separate confirmed visible changes, possible changes needing verification, no meaningful change, and what cannot be determined. End with no more than two practical checks.'
      ].join('\n\n');
      openImagesInChat([previous, current], prompt, '📅 Daily Observer comparison ready in Ask AI');
    } catch (error) {
      console.warn('Could not prepare daily Observer comparison', error);
      if (typeof showToast === 'function') showToast(`⚠️ ${error.message || 'Could not load daily comparison images'}`);
    } finally {
      if (button) { button.textContent = originalText; button.disabled = !dailySummary?.ok; }
    }
  }

  function openObserverAlertComparison(id) {
    const alert = (observerAlerts?.alerts || []).find(item => item.id === id);
    if (!alert || alert.kind === 'system' || !dailySummary?.ok) {
      if (typeof showToast === 'function') showToast('The comparison frames for this alert are not available.');
      return;
    }
    const sameCurrent = alert.source.currentCapturedAt && dailySummary.source.currentCaptured
      && alert.source.currentCapturedAt.getTime() === dailySummary.source.currentCaptured.getTime();
    if (!sameCurrent) {
      if (typeof showToast === 'function') showToast('Older alert images are no longer retained remotely. The alert evidence remains in the history.');
      return;
    }
    openDailySummaryComparison();
  }

  function startRefreshLoop() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      const active = document.querySelector('.page.active');
      if (active?.id === 'page-vision' || active?.id === 'page-observer') refreshAquariumObserver();
      else if (snapshot?.captured) renderObserver(snapshot);
    }, REFRESH_INTERVAL_MS);
  }

  window.openAquariumObserver = openAquariumObserver;
  window.refreshAquariumObserver = refreshAquariumObserver;
  window.selectObserverCamera = selectObserverCamera;
  window.analyzeLatestObserverCapture = analyzeLatestObserverCapture;
  window.compareObserverHistory = compareObserverHistory;
  window.copyObserverDiagnosticReport = copyObserverDiagnosticReport;
  window.openDailySummaryComparison = openDailySummaryComparison;
  window.openObserverAlertComparison = openObserverAlertComparison;
  window.markObserverAlertReviewed = markObserverAlertReviewed;
  window.markAllObserverAlertsReviewed = markAllObserverAlertsReviewed;
  window.playObserverTimelapse = playObserverTimelapse;
  window.ReefKeeperObserver = {
    refresh: refreshAquariumObserver,
    getSnapshot: () => snapshot,
    getFeed: () => observerFeed,
    selectCamera: selectObserverCamera,
    diagnostic: () => buildObserverDiagnosticReport(snapshot),
    endpoint: STATUS_ENDPOINT
  };

  const initialize = () => {
    observerFeed = normalizeRecord({ configured: false, ok: false });
    renderObserver(observerFeed.overview);
    renderDailySummary(normalizeDailySummary({ ok: false }));
    renderObserverAlerts(normalizeObserverAlertFeed({ ok: true, alerts: [] }));
    refreshAquariumObserver();
    startRefreshLoop();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
