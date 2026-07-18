/* Reef Keeper Build 1C — Decision, Skeptic, Confidence, and Conservative Action Engine
 * Browser-safe and dependency-free. Consumes Build 1B structured evidence.
 */
(function initReefKeeperDecisionEngine(global) {
  'use strict';

  const SCHEMA_VERSION = '1.0';
  const DAY_MS = 86400000;

  const METRIC_REQUIREMENTS = Object.freeze({
    temp: { maxAgeMs: 30 * 60 * 1000, label: 'temperature' },
    ph: { maxAgeMs: 30 * 60 * 1000, label: 'pH' },
    orp: { maxAgeMs: 2 * 60 * 60 * 1000, label: 'ORP' },
    po4: { maxAgeMs: 14 * DAY_MS, label: 'phosphate' },
    alk: { maxAgeMs: 7 * DAY_MS, label: 'alkalinity' },
    no3: { maxAgeMs: 14 * DAY_MS, label: 'nitrate' },
    ca: { maxAgeMs: 30 * DAY_MS, label: 'calcium' },
    mg: { maxAgeMs: 45 * DAY_MS, label: 'magnesium' },
    sal: { maxAgeMs: 7 * DAY_MS, label: 'salinity' }
  });

  const TOPIC_REQUIREMENTS = Object.freeze({
    temp: ['temp'], ph: ['ph'], orp: ['orp'], po4: ['po4'], alk: ['alk'], no3: ['no3'],
    ca: ['ca'], mg: ['mg'], sal: ['sal'],
    dosing: ['alk', 'ca', 'mg', 'sal'],
    disease: ['temp', 'sal'],
    livestock: ['temp', 'sal'],
    maintenance: [], equipment: [], visual: [], icp: []
  });

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function parseDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function round(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function requiredMetricsFor(context) {
    const topics = context && context.question && Array.isArray(context.question.topics)
      ? context.question.topics : [];
    const required = [];
    topics.forEach(topic => required.push(...(TOPIC_REQUIREMENTS[topic] || [])));

    // Broad diagnostic questions need a small stability panel, but ordinary husbandry questions do not.
    const text = String(context && context.question && context.question.text || '').toLowerCase();
    const broadDiagnostic = /diagnos|what.?s wrong|why (is|are|did)|stability|risk|safe|health|declin|dying|unhappy|problem/.test(text);
    if (broadDiagnostic) required.push('temp', 'sal', 'alk', 'po4', 'no3');

    return unique(required);
  }

  function inspectRequiredMetrics(context, nowMs) {
    const state = context && context.currentState || {};
    return requiredMetricsFor(context).map(metric => {
      const requirement = METRIC_REQUIREMENTS[metric];
      const observation = state[metric];
      if (!observation) {
        return { metric, label: requirement.label, status: 'missing', reason: `No ${requirement.label} reading is available.` };
      }
      const observedAt = parseDate(observation.timestamp);
      if (!observedAt) {
        return { metric, label: requirement.label, status: 'undated', reason: `${requirement.label} has no reliable timestamp.` };
      }
      const ageMs = Math.max(0, nowMs - observedAt.getTime());
      if (ageMs > requirement.maxAgeMs) {
        const days = Math.max(1, Math.round(ageMs / DAY_MS));
        return { metric, label: requirement.label, status: 'stale', ageMs, reason: `${requirement.label} is too old for this decision (${days} day${days === 1 ? '' : 's'} old).` };
      }
      return { metric, label: requirement.label, status: 'current', ageMs };
    });
  }

  function independentEvidence(context) {
    const seen = new Set();
    return (context && Array.isArray(context.evidence) ? context.evidence : [])
      .filter(item => item && item.effectiveWeight > 0)
      .filter(item => {
        const key = item.independenceGroup || item.observationId || item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  }

  function calculateConfidence(context, metricChecks) {
    const evidence = independentEvidence(context).slice(0, 10);
    const weighted = evidence.reduce((sum, item, index) => sum + (item.effectiveWeight * (1 / (1 + index * 0.16))), 0);
    const normalizer = evidence.reduce((sum, item, index) => sum + (1 / (1 + index * 0.16)), 0) || 1;
    const evidenceQuality = clamp(weighted / normalizer);

    const requiredCount = metricChecks.length;
    const currentCount = metricChecks.filter(item => item.status === 'current').length;
    const completeness = requiredCount ? currentCount / requiredCount : 0.82;

    const conflictCount = context && Array.isArray(context.conflicts) ? context.conflicts.length : 0;
    const conflictPenalty = Math.min(0.28, conflictCount * 0.08);
    const limitationCount = context && context.dataQuality && Array.isArray(context.dataQuality.issues)
      ? context.dataQuality.issues.length : 0;
    const limitationPenalty = Math.min(0.18, limitationCount * 0.035);

    const raw = (evidenceQuality * 0.58) + (completeness * 0.32) + 0.10 - conflictPenalty - limitationPenalty;
    const score = Math.round(clamp(raw, 0.08, 0.97) * 100);
    const label = score >= 80 ? 'high' : score >= 60 ? 'moderate' : score >= 40 ? 'limited' : 'low';

    return {
      score,
      label,
      components: {
        evidenceQuality: round(evidenceQuality),
        requiredDataCompleteness: round(completeness),
        independentEvidenceCount: evidence.length,
        conflictPenalty: round(conflictPenalty),
        limitationPenalty: round(limitationPenalty)
      }
    };
  }

  function buildSkepticReview(context, metricChecks, confidence) {
    const concerns = [];
    const counterEvidence = [];

    metricChecks.filter(item => item.status !== 'current').forEach(item => concerns.push(item.reason));
    (context && Array.isArray(context.conflicts) ? context.conflicts : []).slice(0, 4).forEach(conflict => {
      concerns.push(conflict.summary || conflict.message || `Conflicting ${conflict.metric || 'tank'} records are present.`);
    });
    (context && context.dataQuality && Array.isArray(context.dataQuality.issues) ? context.dataQuality.issues : [])
      .slice(0, 4).forEach(issue => concerns.push(issue));

    (context && Array.isArray(context.evidence) ? context.evidence : [])
      .filter(item => item.direction === 'contradicts' || item.direction === 'against')
      .slice(0, 4)
      .forEach(item => counterEvidence.push(item.claim));

    if (confidence.score < 60) concerns.push('The available evidence does not support a confident causal diagnosis.');
    if (!counterEvidence.length) counterEvidence.push('No explicit counter-evidence was identified; absence of contradiction is not proof.');

    return {
      alternativeCausesRequired: /diagnos|why|cause|problem|dying|declin|unhappy/i.test(String(context && context.question && context.question.text || '')),
      concerns: unique(concerns).slice(0, 8),
      counterEvidence: unique(counterEvidence).slice(0, 4),
      overconfidenceRisk: confidence.score >= 80 && concerns.length > 1 ? 'elevated' : confidence.score < 60 ? 'high' : 'controlled'
    };
  }

  function chooseActionCeiling(confidence, metricChecks, context) {
    const missingCritical = metricChecks.some(item => item.status !== 'current');
    const conflicts = context && Array.isArray(context.conflicts) ? context.conflicts.length : 0;
    if (confidence.score < 40 || (missingCritical && confidence.score < 60)) return 'observe_or_measure';
    if (confidence.score < 65 || conflicts > 0 || missingCritical) return 'verify_then_small_reversible_step';
    if (confidence.score < 82) return 'small_reversible_step';
    return 'measured_action_with_monitoring';
  }

  function actionRulesFor(ceiling) {
    const common = [
      'Prefer the least disruptive intervention that can reasonably reduce risk.',
      'Do not recommend changing several major variables at once.',
      'State what result should be monitored and when to reassess.'
    ];
    if (ceiling === 'observe_or_measure') return [
      'Do not recommend dosing, major equipment changes, aggressive media changes, or livestock treatment as the primary next step.',
      'Primary next step must be observation, inspection, or obtaining the missing measurement.',
      ...common
    ];
    if (ceiling === 'verify_then_small_reversible_step') return [
      'Require verification of disputed or stale evidence before irreversible action.',
      'Any interim action must be small, reversible, and low-risk.',
      ...common
    ];
    if (ceiling === 'small_reversible_step') return [
      'A small reversible adjustment may be recommended, but avoid large corrections.',
      ...common
    ];
    return [
      'A measured intervention may be recommended when directly supported by the evidence.',
      ...common
    ];
  }

  function evaluate(context, options) {
    if (!context || !context.schemaVersion) throw new Error('Structured evidence context is required.');
    const nowMs = Number(options && options.nowMs) || Date.now();
    const metricChecks = inspectRequiredMetrics(context, nowMs);
    const confidence = calculateConfidence(context, metricChecks);
    const skepticReview = buildSkepticReview(context, metricChecks, confidence);
    const actionCeiling = chooseActionCeiling(confidence, metricChecks, context);

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date(nowMs).toISOString(),
      question: context.question || { text: '', topics: [] },
      confidence,
      requiredData: metricChecks,
      missingOrStaleData: metricChecks.filter(item => item.status !== 'current'),
      skepticReview,
      decisionPolicy: {
        actionCeiling,
        rules: actionRulesFor(actionCeiling),
        requireAlternatives: skepticReview.alternativeCausesRequired,
        discloseUncertainty: true,
        distinguishObservationInferenceRecommendation: true
      }
    };
  }

  function toPromptBlock(decision) {
    if (!decision || decision.schemaVersion !== SCHEMA_VERSION) return '';
    const compact = {
      confidence: decision.confidence,
      missingOrStaleData: decision.missingOrStaleData,
      skepticReview: decision.skepticReview,
      decisionPolicy: decision.decisionPolicy
    };
    return `\n\nREEF KEEPER DECISION REVIEW (schema ${SCHEMA_VERSION}):\nThis deterministic review constrains the answer. Do not raise the confidence score or exceed the action ceiling. Separate: (1) observations, (2) inference, and (3) recommendation. For diagnostic questions, mention credible alternatives when required. Explicitly identify missing or stale evidence that materially limits the answer. Use the confidence label naturally; include the numeric score only when it helps the user understand uncertainty. Never present the score as scientific certainty.\n${JSON.stringify(compact)}`;
  }

  global.ReefKeeperDecisionEngine = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    evaluate,
    toPromptBlock,
    requiredMetricsFor
  });
})(typeof window !== 'undefined' ? window : globalThis);
