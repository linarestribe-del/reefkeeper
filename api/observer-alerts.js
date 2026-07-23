// Reef Keeper Maintenance 8C — visual, local-monitor, and deterministic operational Observer alerts

import {
  cleanObserverString,
  normalizeObserverAlertFeed,
  normalizeObserverChangeAlert,
  normalizeObserverStatus,
  setObserverHeaders
} from '../lib/observer-common.js';
import {
  readObserverAlerts,
  readObserverDailySummary,
  readObserverStatus
} from '../lib/observer-r2.js';

const MINUTE = 60_000;

const SYSTEM_ALERT_DETAILS = Object.freeze({
  capture_timer_inactive: ['camera_capture', 'Camera capture timer is inactive', 'Check the camera capture timer on the Raspberry Pi.'],
  capture_missing: ['camera_capture', 'Current camera capture is missing', 'Confirm the Tapo stream and local capture service are producing latest.jpg.'],
  capture_error: ['camera_capture', 'Latest camera capture reported an error', 'Inspect the capture service log and verify the camera stream.'],
  capture_offline: ['camera_capture', 'Camera capture appears offline', 'Check camera power, Wi-Fi, RTSP access, and the Pi capture timer.'],
  capture_stale: ['camera_capture', 'Camera capture is stale', 'Refresh Observer, then inspect the camera and capture timer if the timestamp does not advance.'],
  image_publish_unavailable: ['camera_capture', 'Observer image publishing is unavailable', 'Check the latest capture file, SSD mount, and publisher service log.'],
  publisher_timer_inactive: ['publisher', 'Observer publisher timer is inactive', 'Check the publisher timer on the Raspberry Pi.'],
  storage_unmounted: ['storage', 'Observer SSD is not mounted', 'Check the SSD connection and mount at /mnt/reef-ssd before relying on the archive.'],
  storage_read_only: ['storage', 'Observer SSD is not writable', 'Check the SSD filesystem and mount state.'],
  storage_critical: ['storage', 'Observer SSD is critically full', 'Free archive space or adjust retention before captures stop.'],
  storage_low: ['storage', 'Observer SSD space is getting low', 'Review archive retention and available drive space.'],
  power_current: ['power', 'Raspberry Pi power or throttling warning', 'Check the Pi power supply, cable, temperature, and throttling status.'],
  archive_empty: ['archive', 'Observer archive is empty', 'Confirm archived captures are being written to the SSD.'],
  daily_summary_retry: ['daily_summary', 'Daily visual summary is waiting to retry', 'No immediate action is required; review the error if the retry remains pending.'],
  daily_summary_paused: ['daily_summary', 'Daily visual summary paused after repeated failures', 'Review the publisher log and OpenAI availability; the attempt budget resets with the next daily frame.'],
  camera_view_obstructed: ['camera_quality', 'Sump camera view may be obstructed', 'Check the camera lens and confirm that salt spray, condensation, a hand, cable, or equipment is not blocking the view.'],
  camera_view_shifted: ['camera_quality', 'Sump camera framing appears to have moved', 'Compare the current image with the learned view and reposition the camera if the sump is no longer framed correctly.'],
  sump_scene_changed: ['other', 'Persistent sump-view change needs review', 'Inspect the current sump image for moved equipment, open cabinet doors, maintenance activity, or another persistent visual change.'],
  water_level_watch: ['water_level', 'Possible sump water-level shift', 'Verify the sump water level directly and check the ATO, return section, and visible plumbing before taking action.'],
  water_level_urgent: ['water_level', 'Possible urgent sump water-level shift', 'Inspect the sump immediately for overflow, low return-section level, ATO malfunction, or displaced plumbing.'],
  local_monitor_state_error: ['camera_quality', 'Local visual monitor could not save its baseline', 'Check that the Observer SSD is writable and review the publisher service log.'],
  local_monitor_unavailable: ['camera_quality', 'Local visual monitoring is unavailable', 'Check that ffmpeg is installed and review the Observer publisher service log.']
});

function fallbackFeedFromDailySummary(summary) {
  const item = summary && typeof summary === 'object' ? summary : {};
  const concerns = Array.isArray(item.concerns) ? item.concerns.map(value => cleanObserverString(value, 240)).filter(Boolean) : [];
  const shouldCreate = item.ok === true && ['watch', 'attention'].includes(String(item.status || '').toLowerCase()) && concerns.length > 0;
  const generatedAt = item.generatedAt || new Date().toISOString();
  const currentCapturedAt = item.source?.currentCapturedAt || null;
  const previousCapturedAt = item.source?.previousCapturedAt || null;
  const alerts = shouldCreate ? [normalizeObserverChangeAlert({
    id: `${currentCapturedAt || generatedAt}:legacy-daily-summary`,
    kind: 'visual',
    severity: 'watch',
    category: 'other',
    title: item.headline || 'Daily Observer change needs review',
    evidence: concerns.join(' '),
    recommendedCheck: Array.isArray(item.nextChecks) ? item.nextChecks[0] : '',
    confidence: 'Derived conservatively from the existing daily summary.',
    createdAt: generatedAt,
    source: { kind: 'visual', currentCapturedAt, previousCapturedAt }
  })] : [];
  return normalizeObserverAlertFeed({
    ok: true,
    updatedAt: generatedAt,
    lastEvaluatedAt: generatedAt,
    currentCapturedAt,
    previousCapturedAt,
    currentAlertIds: alerts.map(alert => alert.id),
    alerts
  });
}

function dateKey(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function operationalAlert(issue, status, checkedAt) {
  const details = SYSTEM_ALERT_DETAILS[issue.code];
  if (!details || issue.severity === 'info') return null;
  const [category, title, recommendedCheck] = details;
  return normalizeObserverChangeAlert({
    id: `system:${dateKey(checkedAt)}:${issue.code}`,
    kind: 'system',
    issueCode: issue.code,
    severity: issue.severity === 'critical' ? 'urgent' : 'watch',
    category,
    title,
    evidence: issue.message,
    recommendedCheck,
    confidence: 'Deterministic Raspberry Pi health check; no image analysis or OpenAI call.',
    createdAt: checkedAt,
    source: {
      kind: 'system',
      issueCode: issue.code,
      currentCapturedAt: status.capturedAt,
      previousCapturedAt: null
    }
  });
}

export function buildObserverOperationalAlerts(value, now = new Date()) {
  const status = normalizeObserverStatus(value || {});
  if (!value || value.configured === false) return [];
  const checkedAt = status.health.checkedAt || status.publishedAt || now.toISOString();
  const alerts = status.health.issues
    .map(issue => operationalAlert(issue, status, checkedAt))
    .filter(Boolean);

  const publishedAt = status.publishedAt ? new Date(status.publishedAt) : null;
  const publishAge = publishedAt && !Number.isNaN(publishedAt.getTime()) ? now.getTime() - publishedAt.getTime() : 0;
  if (publishAge > 20 * MINUTE && !alerts.some(alert => alert.issueCode === 'publisher_remote_stale')) {
    alerts.unshift(normalizeObserverChangeAlert({
      id: `system:${dateKey(now)}:publisher_remote_stale`,
      kind: 'system',
      issueCode: 'publisher_remote_stale',
      severity: publishAge > 60 * MINUTE ? 'urgent' : 'watch',
      category: 'publisher',
      title: publishAge > 60 * MINUTE ? 'Observer remote publishing appears offline' : 'Observer remote publishing is delayed',
      evidence: `No remote Observer update has arrived for ${Math.floor(publishAge / MINUTE)} minutes.`,
      recommendedCheck: 'Check the Pi publisher timer, network connection, and the latest publisher service log.',
      confidence: 'Deterministic remote timestamp check; no image analysis or OpenAI call.',
      createdAt: now.toISOString(),
      source: { kind: 'system', issueCode: 'publisher_remote_stale', currentCapturedAt: status.capturedAt }
    }));
  }

  const seen = new Set();
  return alerts.filter(alert => !seen.has(alert.id) && seen.add(alert.id)).slice(0, 12);
}

function newestIso(...values) {
  const dates = values.filter(Boolean).map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()));
  return dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))).toISOString() : null;
}

export default async function handler(req, res) {
  setObserverHeaders(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const [saved, daily, status] = await Promise.all([
      readObserverAlerts().catch(() => null),
      readObserverDailySummary().catch(() => null),
      readObserverStatus().catch(() => null)
    ]);
    const visual = saved ? normalizeObserverAlertFeed(saved) : fallbackFeedFromDailySummary(daily);
    const operational = buildObserverOperationalAlerts(status);
    const operationalIds = operational.map(alert => alert.id);
    const visualAlerts = visual.alerts.filter(alert => alert.kind !== 'system');
    const feed = normalizeObserverAlertFeed({
      ok: true,
      updatedAt: newestIso(visual.updatedAt, status?.health?.checkedAt, status?.publishedAt) || new Date().toISOString(),
      lastEvaluatedAt: newestIso(visual.lastEvaluatedAt, status?.health?.checkedAt, status?.publishedAt),
      currentCapturedAt: status?.capturedAt || visual.currentCapturedAt,
      previousCapturedAt: visual.previousCapturedAt,
      currentAlertIds: [...operationalIds, ...visual.currentAlertIds],
      alerts: [...operational, ...visualAlerts].slice(0, 30)
    });
    return res.status(200).json(feed);
  } catch (error) {
    return res.status(200).json(normalizeObserverAlertFeed({ ok: false, alerts: [] }));
  }
}
