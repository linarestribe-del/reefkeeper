// Reef Keeper Build 2K — public read endpoint for evidence-limited Observer change alerts

import {
  cleanObserverString,
  normalizeObserverAlertFeed,
  normalizeObserverChangeAlert,
  setObserverHeaders
} from '../lib/observer-common.js';
import {
  readObserverAlerts,
  readObserverDailySummary
} from '../lib/observer-r2.js';

function fallbackFeedFromDailySummary(summary) {
  const item = summary && typeof summary === 'object' ? summary : {};
  const concerns = Array.isArray(item.concerns) ? item.concerns.map(value => cleanObserverString(value, 240)).filter(Boolean) : [];
  const shouldCreate = item.ok === true && ['watch', 'attention'].includes(String(item.status || '').toLowerCase()) && concerns.length > 0;
  const generatedAt = item.generatedAt || new Date().toISOString();
  const currentCapturedAt = item.source?.currentCapturedAt || null;
  const previousCapturedAt = item.source?.previousCapturedAt || null;
  const alerts = shouldCreate ? [normalizeObserverChangeAlert({
    id: `${currentCapturedAt || generatedAt}:legacy-daily-summary`,
    severity: 'watch',
    category: 'other',
    title: item.headline || 'Daily Observer change needs review',
    evidence: concerns.join(' '),
    recommendedCheck: Array.isArray(item.nextChecks) ? item.nextChecks[0] : '',
    confidence: 'Derived conservatively from the existing daily summary.',
    createdAt: generatedAt,
    source: { currentCapturedAt, previousCapturedAt }
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

export default async function handler(req, res) {
  setObserverHeaders(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const saved = await readObserverAlerts().catch(() => null);
    if (saved) return res.status(200).json(normalizeObserverAlertFeed(saved));
    const daily = await readObserverDailySummary().catch(() => null);
    return res.status(200).json(fallbackFeedFromDailySummary(daily));
  } catch (error) {
    return res.status(200).json(normalizeObserverAlertFeed({ ok: false, alerts: [] }));
  }
}
