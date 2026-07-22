// Reef Keeper Maintenance 8B — Aquarium Observer daily monitoring, operational alerts, visual summaries, and timelapses
// Full archives remain local. Only current/selected images and non-secret diagnostics are published remotely.

(function installAquariumObserver() {
  'use strict';

  const STATUS_ENDPOINT = '/api/observer-status';
  const DAILY_SUMMARY_ENDPOINT = '/api/observer-daily-summary';
  const ALERTS_ENDPOINT = '/api/observer-alerts';
  const TIMELAPSES_ENDPOINT = '/api/observer-status?resource=timelapses';
  const ALERT_REVIEWED_KEY = 'reef_observer_reviewed_alert_ids_v1';
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
  let refreshTimer = null;
  let refreshInFlight = null;
  let dailySummary = null;
  let observerAlerts = null;
  let observerTimelapses = null;

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
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_) { return new Set(); }
  }

  function saveAlertIds(key, ids) {
    try { localStorage.setItem(key, JSON.stringify([...ids].slice(-100))); } catch (_) {}
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
      water_level: '🌊',
      skimmer: '🫧',
      leak_overflow: '🚨',
      equipment_position: '🔧',
      buildup: '🧽',
      camera_quality: '📷',
      camera_capture: '📷',
      publisher: '☁️',
      storage: '💾',
      power: '⚡',
      archive: '🗂️',
      daily_summary: '📅',
      other: '👁️'
    }[category] || '👁️';
  }

  function alertSeverityLabel(severity) {
    return { urgent: 'Urgent', watch: 'Watch', info: 'Info' }[severity] || 'Watch';
  }

  function markObserverAlertReviewed(id) {
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    reviewed.add(String(id || ''));
    saveAlertIds(ALERT_REVIEWED_KEY, reviewed);
    renderObserverAlerts(observerAlerts || normalizeObserverAlertFeed({}));
  }

  function markAllObserverAlertsReviewed() {
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    (observerAlerts?.alerts || []).forEach(alert => reviewed.add(alert.id));
    saveAlertIds(ALERT_REVIEWED_KEY, reviewed);
    renderObserverAlerts(observerAlerts || normalizeObserverAlertFeed({}));
    if (typeof showToast === 'function') showToast('Observer alerts marked reviewed');
  }

  function renderObserverAlerts(feed) {
    observerAlerts = feed;
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    const currentIds = new Set(feed.currentAlertIds || []);
    const currentAlerts = feed.alerts.filter(alert => currentIds.has(alert.id));
    const unreviewed = currentAlerts.filter(alert => !reviewed.has(alert.id));
    const urgent = unreviewed.some(alert => alert.severity === 'urgent');
    const badge = byId('observer-alert-badge');
    const card = byId('observer-alert-card');
    if (badge) {
      const state = urgent ? 'urgent' : (unreviewed.length ? 'watch' : 'clear');
      badge.className = `observer-alert-badge ${state}`;
      badge.textContent = urgent ? 'Urgent' : (unreviewed.length ? `${unreviewed.length} new` : 'Clear');
    }
    if (card) card.classList.toggle('has-urgent', urgent);
    const currentSystem = currentAlerts.filter(alert => alert.kind === 'system');
    const currentVisual = currentAlerts.filter(alert => alert.kind !== 'system');
    const alertParts = [];
    if (currentSystem.length) alertParts.push(`${currentSystem.length} system alert${currentSystem.length === 1 ? '' : 's'}`);
    if (currentVisual.length) alertParts.push(`${currentVisual.length} visual alert${currentVisual.length === 1 ? '' : 's'}`);
    setText('observer-alert-summary', alertParts.length
      ? `${alertParts.join(' and ')} currently need review.`
      : 'No current system or evidence-limited visual alert needs review.');
    setText('observer-alert-evaluated', feed.lastEvaluatedAt
      ? `Last evaluated ${formatCaptureTime(feed.lastEvaluatedAt.toISOString())}`
      : 'Waiting for the next daily comparison');
    const list = byId('observer-alert-list');
    if (list) {
      const visible = feed.alerts.slice(0, 8);
      list.innerHTML = visible.length ? visible.map(alert => {
        const isCurrent = currentIds.has(alert.id);
        const isReviewed = reviewed.has(alert.id);
        const classes = ['observer-alert-item', alert.severity, isReviewed ? 'reviewed' : '', isCurrent ? 'current' : 'history'].filter(Boolean).join(' ');
        return `<article class="${classes}">
          <div class="observer-alert-item-head"><span class="observer-alert-icon">${alertCategoryIcon(alert.category)}</span><div><strong>${cleanText(alert.title)}</strong><small>${alert.kind === 'system' ? 'System monitor' : 'Daily visual comparison'} · ${alertSeverityLabel(alert.severity)} · ${formatCaptureTime(alert.createdAt?.toISOString())}${isCurrent ? ' · current' : ''}</small></div><b>${alertSeverityLabel(alert.severity)}</b></div>
          ${alert.evidence ? `<p><strong>Evidence:</strong> ${cleanText(alert.evidence)}</p>` : ''}
          ${alert.recommendedCheck ? `<p><strong>Recommended check:</strong> ${cleanText(alert.recommendedCheck)}</p>` : ''}
          ${alert.confidence ? `<p class="observer-alert-confidence">${cleanText(alert.confidence)}</p>` : ''}
          <div class="observer-alert-item-actions">
            ${isCurrent && alert.kind !== 'system' && dailySummary?.ok ? `<button type="button" onclick="openObserverAlertComparison('${alert.id}')">Open comparison</button>` : ''}
            <button type="button" onclick="markObserverAlertReviewed('${alert.id}')">${isReviewed ? 'Reviewed' : 'Mark reviewed'}</button>
          </div>
        </article>`;
      }).join('') : '<div class="observer-alert-empty"><strong>No Observer alerts.</strong><span>System checks run without AI; visual alerts are created only from the once-daily evidence-limited comparison.</span></div>';
    }
    const reviewAll = byId('observer-alert-review-all');
    if (reviewAll) reviewAll.disabled = feed.alerts.length === 0 || feed.alerts.every(alert => reviewed.has(alert.id));
  }

  function announceNewObserverAlerts(feed) {
    const seen = storedAlertIds(ALERT_SEEN_KEY);
    const reviewed = storedAlertIds(ALERT_REVIEWED_KEY);
    const current = feed.alerts.filter(alert => feed.currentAlertIds.includes(alert.id));
    const fresh = current.filter(alert => !seen.has(alert.id) && !reviewed.has(alert.id));
    current.forEach(alert => seen.add(alert.id));
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
    setText('observer-daily-summary', report.summary);
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

    const componentStates = [health.capture.status, health.publisher.status, health.storage.status, health.power.status, health.dailySummary.status, health.archive.status].filter(state => state !== 'pending');
    if (componentStates.includes('offline')) health.status = 'offline';
    else if (componentStates.includes('attention')) health.status = 'attention';
    else if (componentStates.every(state => state === 'healthy')) health.status = 'healthy';

    if (health.status === 'healthy') health.summary = 'Camera capture, remote publishing, storage, services, and Pi power checks are healthy.';
    else if (health.status === 'attention') health.summary = 'Observer is still reporting, but one or more checks need attention.';
    else if (health.status === 'offline') health.summary = health.publisher.status === 'offline'
      ? 'The app is not receiving current Observer health reports.'
      : 'A critical local Observer component is unavailable.';

    health.issues = issues;
    return health;
  }

  function normalizeRecord(payload) {
    const record = payload && typeof payload === 'object' ? payload : {};
    const captured = captureDate(record);
    const publishedAt = parseDate(record.publishedAt || record.receivedAt);
    const imageUrl = String(record.thumbnailUrl || record.imageUrl || record.latestImageUrl || '').trim();
    const configured = record.configured === true || Boolean(record.receivedAt || publishedAt || captured || imageUrl);
    const health = effectiveHealth(record, captured, publishedAt);

    let state = 'pending';
    let label = 'Checking';
    if (!configured) { state = 'pending'; label = 'Not connected'; }
    else if (health.status === 'healthy') { state = 'online'; label = 'Healthy'; }
    else if (health.status === 'attention') { state = 'stale'; label = 'Attention'; }
    else { state = 'offline'; label = 'Offline'; }

    return {
      raw: record,
      configured,
      ok: state === 'online',
      stale: state === 'stale',
      state,
      label,
      captured,
      publishedAt,
      imageUrl,
      health,
      comparisons: {
        previous: normalizeComparison('previous', record.comparisons?.previous),
        dayAgo: normalizeComparison('dayAgo', record.comparisons?.dayAgo),
        weekAgo: normalizeComparison('weekAgo', record.comparisons?.weekAgo)
      },
      receivedAt: parseDate(record.receivedAt),
      cameraLabel: String(record.cameraLabel || record.camera?.label || 'Sump camera'),
      stream: String(record.stream || record.camera?.stream || 'stream2'),
      resolution: String(record.resolution || record.camera?.resolution || '1280×720'),
      intervalMinutes: Number(record.captureIntervalMinutes || record.intervalMinutes || 5) || 5,
      publisherVersion: String(record.publisherVersion || health.publisher?.version || '—'),
      sizeBytes: Number(record.sizeBytes ?? record.size_bytes),
      storageLabel: String(record.storage?.label || record.storageLabel || 'Local Pi drive'),
      storageTotalBytes: Number(record.storage?.totalBytes || health.storage?.totalBytes || 0),
      storageAvailableBytes: Number(record.storage?.availableBytes || health.storage?.availableBytes || 0),
      storageUsedPercent: Number(record.storage?.usedPercent ?? health.storage?.usedPercent),
      message: String(record.message || record.error || '')
    };
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

  function renderObserverHealth(record) {
    const health = record.health;
    const badge = byId('observer-health-badge');
    if (badge) {
      badge.className = `observer-health-badge ${health.status}`;
      badge.textContent = healthLabel(health.status);
    }
    setText('observer-health-summary', health.summary);
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
      issuesBox.innerHTML = issues.map(item => `<div class="observer-health-issue ${item.severity}">${item.message.replace(/[<>]/g, '')}</div>`).join('');
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
    const captureIso = record.captured?.toISOString() || '';
    const capturedLabel = formatCaptureTime(captureIso);
    const ageLabel = formatAge(record.captured);
    const intervalLabel = `Every ${record.intervalMinutes} min`;

    setBadge('observer-preview-badge', record);
    setBadge('observer-detail-badge', record);
    updateImage('observer-preview-image', 'observer-preview-placeholder', 'observer-preview-image-time', record);
    updateImage('observer-detail-image', 'observer-detail-placeholder', 'observer-detail-image-time', record);

    setText('observer-preview-captured', capturedLabel);
    setText('observer-preview-age', ageLabel);
    setText('observer-preview-interval', intervalLabel);
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
    renderHistoryOptions(record);
    if (observerTimelapses) renderObserverTimelapses(observerTimelapses, record);

    const note = byId('observer-connection-note');
    if (note) {
      if (record.health.status === 'healthy') {
        note.innerHTML = '<strong>Observer system is healthy.</strong><span>The camera, Pi timers, storage drive, and remote publisher are reporting normally. The full archive remains on the Raspberry Pi drive.</span>';
      } else if (record.health.publisher.status === 'offline') {
        note.innerHTML = '<strong>The remote publisher stopped reporting.</strong><span>The app cannot confirm what is happening on the Pi until a new health report arrives. Local captures may still be running.</span>';
      } else if (record.health.capture.status !== 'healthy' && record.health.publisher.status === 'healthy') {
        note.innerHTML = `<strong>The publisher is online, but camera capture needs attention.</strong><span>${cleanText(record.health.capture.message, 'The latest capture is not current.')}</span>`;
      } else if (record.health.storage.status === 'offline') {
        note.innerHTML = `<strong>The Observer drive needs attention.</strong><span>${cleanText(record.health.storage.message, 'The archive drive is unavailable or not writable.')}</span>`;
      } else if (record.configured) {
        const safeMessage = record.health.summary || record.message || 'One or more Observer checks need attention.';
        note.innerHTML = `<strong>Observer is reporting with a warning.</strong><span>${cleanText(safeMessage)}</span>`;
      } else {
        note.innerHTML = '<strong>App-side setup is ready.</strong><span>Install the Build 2I Pi health publisher to report camera, storage, timer, and power diagnostics.</span>';
      }
    }

    const analyze = byId('observer-analyze-btn');
    if (analyze) analyze.disabled = !record.imageUrl;
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
        const [record, report, alerts, timelapses] = await Promise.all([
          fetchObserverStatus(),
          fetchObserverDailySummary().catch(error => normalizeDailySummary({ ok: false, state: 'temporarily_unavailable', message: error.message || String(error) })),
          fetchObserverAlerts().catch(() => normalizeObserverAlertFeed({ ok: false, alerts: [] })),
          fetchObserverTimelapses().catch(() => normalizeTimelapseFeed({ ok: false, timelapses: {} }))
        ]);
        renderObserver(record);
        renderDailySummary(report);
        renderObserverAlerts(alerts);
        renderObserverTimelapses(timelapses, record);
        announceNewObserverAlerts(alerts);
        if (event && typeof showToast === 'function') {
          const message = record.health.status === 'healthy' ? '✅ Observer health refreshed' : '⚠️ Observer health needs attention';
          showToast(message);
        }
        return record;
      } catch (error) {
        const record = normalizeRecord({ configured: true, ok: false, error: error.message || String(error) });
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
      const image = await imageAttachmentFromUrl(snapshot.imageUrl, 'aquarium-observer-latest.jpg');
      openImagesInChat([image], OBSERVER_ANALYSIS_PROMPT, '📹 Latest Observer capture ready for AI');
    } catch (error) {
      console.warn('Could not prepare Observer image', error);
      if (typeof showToast === 'function') showToast(`⚠️ ${error.message || 'Could not load Observer image'}`);
    } finally {
      if (button) { button.textContent = 'Analyze latest capture'; button.disabled = !snapshot?.imageUrl; }
    }
  }

  async function compareObserverHistory(slot) {
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
    diagnostic: () => buildObserverDiagnosticReport(snapshot),
    endpoint: STATUS_ENDPOINT
  };

  const initialize = () => {
    renderObserver(normalizeRecord({ configured: false, ok: false }));
    renderDailySummary(normalizeDailySummary({ ok: false }));
    renderObserverAlerts(normalizeObserverAlertFeed({ ok: true, alerts: [] }));
    refreshAquariumObserver();
    startRefreshLoop();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
