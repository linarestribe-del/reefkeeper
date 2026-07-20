/* Reef Keeper Build 2C — In-answer Explainability
 * Converts deterministic Evidence/Decision Engine output into a compact,
 * user-facing explanation record. Browser-safe and dependency-free.
 */
(function initReefKeeperExplainability(global) {
  'use strict';

  const SCHEMA_VERSION = '1.0';

  function cleanText(value, max = 260) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function unique(items) {
    return Array.from(new Set((items || []).map(item => cleanText(item)).filter(Boolean)));
  }

  function actionLabel(ceiling) {
    const labels = {
      observe_or_measure: 'Observe or measure before changing the tank',
      verify_then_small_reversible_step: 'Verify first; only a small reversible step is justified',
      small_reversible_step: 'A small reversible step is justified',
      measured_action_with_monitoring: 'A measured action is justified with monitoring'
    };
    return labels[ceiling] || 'Use a conservative, monitored next step';
  }

  function missingReason(item) {
    if (!item || typeof item !== 'object') return '';
    return cleanText(item.reason || item.message || `${item.metric || item.label || 'Required evidence'} is ${item.status || 'unavailable'}.`);
  }

  function evidenceClaims(context) {
    const evidence = context && Array.isArray(context.evidence) ? context.evidence : [];
    return unique(
      evidence
        .filter(item => item && item.claim)
        .sort((a, b) => Number(b.effectiveWeight || 0) - Number(a.effectiveWeight || 0))
        .slice(0, 3)
        .map(item => item.claim)
    );
  }

  function build(options) {
    const input = options || {};
    if (!input.useTankContext) return null;

    const context = input.evidenceContext || null;
    const decision = input.decisionReview || null;
    const strongestEvidence = evidenceClaims(context);

    if (!decision) {
      const limitations = unique([
        cleanText(input.error || ''),
        ...(context && context.dataQuality && Array.isArray(context.dataQuality.issues)
          ? context.dataQuality.issues
          : [])
      ]).slice(0, 3);

      return {
        schemaVersion: SCHEMA_VERSION,
        status: 'limited',
        confidence: { score: null, label: 'Not calculated' },
        strongestEvidence,
        missingOrStale: limitations.length ? limitations : ['The deterministic decision review was unavailable for this response.'],
        skepticNotes: ['Treat the answer as general guidance and verify current measurements before acting.'],
        actionCeiling: 'observe_or_measure',
        actionLabel: actionLabel('observe_or_measure')
      };
    }

    const confidence = decision.confidence || {};
    const missingOrStale = unique((decision.missingOrStaleData || []).map(missingReason)).slice(0, 4);
    const skeptic = decision.skepticReview || {};
    const skepticNotes = unique([
      ...(Array.isArray(skeptic.concerns) ? skeptic.concerns : []),
      ...(Array.isArray(skeptic.counterEvidence) ? skeptic.counterEvidence : [])
    ]).slice(0, 3);
    const actionCeiling = decision.decisionPolicy && decision.decisionPolicy.actionCeiling || 'observe_or_measure';

    return {
      schemaVersion: SCHEMA_VERSION,
      status: 'complete',
      confidence: {
        score: Number.isFinite(Number(confidence.score)) ? Math.round(Number(confidence.score)) : null,
        label: cleanText(confidence.label || 'Unrated', 60)
      },
      strongestEvidence,
      missingOrStale,
      skepticNotes,
      actionCeiling,
      actionLabel: actionLabel(actionCeiling)
    };
  }

  global.ReefKeeperExplainability = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    build,
    actionLabel
  });
})(typeof window !== 'undefined' ? window : globalThis);
