(function(global){
  'use strict';

  const DAY_MS = 86400000;
  const VERSION = '2A.0.0';

  const PARAMS = Object.freeze({
    po4: {
      label: 'Phosphate', unit: 'ppm', decimals: 2,
      target: [0.05, 0.10], stableChange: 0.02, rapidDaily: 0.03
    },
    alk: {
      label: 'Alkalinity', unit: 'dKH', decimals: 1,
      target: [8.5, 9.5], stableChange: 0.20, rapidDaily: 0.25
    },
    no3: {
      label: 'Nitrate', unit: 'ppm', decimals: 1,
      target: [5, 10], stableChange: 1.0, rapidDaily: 2.0
    },
    ca: {
      label: 'Calcium', unit: 'mg/L', decimals: 0,
      target: [400, 450], stableChange: 10, rapidDaily: 15
    },
    mg: {
      label: 'Magnesium', unit: 'mg/L', decimals: 0,
      target: [1280, 1400], stableChange: 20, rapidDaily: 30
    },
    ph: {
      label: 'pH', unit: '', decimals: 2,
      target: [7.8, 8.5], stableChange: 0.08, rapidDaily: 0.15
    },
    sal: {
      label: 'Salinity', unit: 'SG', decimals: 3,
      target: [1.025, 1.026], stableChange: 0.001, rapidDaily: 0.002
    }
  });

  function parseDate(value){
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) && time > 0 ? time : null;
  }

  function round(value, decimals){
    const power = 10 ** (decimals || 0);
    return Math.round(value * power) / power;
  }

  function formatValue(value, config){
    if (!Number.isFinite(value)) return '—';
    return Number(value).toFixed(config.decimals);
  }

  function normalizePoints(rawPoints){
    const byTimestamp = new Map();
    (rawPoints || []).forEach((point) => {
      const value = Number(point && point.value);
      const time = parseDate(point && (point.isoDate || point.time || point.date));
      if (!Number.isFinite(value) || !time) return;
      byTimestamp.set(time, {
        value,
        time,
        date: point.date || point.isoDate || '',
        raw: point
      });
    });
    return [...byTimestamp.values()].sort((a, b) => a.time - b.time).slice(-16);
  }

  function linearRegression(points){
    if (points.length < 2) return { slopePerDay: 0, r2: 0 };
    const start = points[0].time;
    const xs = points.map((point) => (point.time - start) / DAY_MS);
    const ys = points.map((point) => point.value);
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

    let numerator = 0;
    let denominator = 0;
    xs.forEach((x, index) => {
      numerator += (x - meanX) * (ys[index] - meanY);
      denominator += (x - meanX) ** 2;
    });

    const slopePerDay = denominator ? numerator / denominator : 0;
    const intercept = meanY - (slopePerDay * meanX);
    const total = ys.reduce((sum, value) => sum + ((value - meanY) ** 2), 0);
    const residual = ys.reduce((sum, value, index) => {
      const predicted = intercept + (slopePerDay * xs[index]);
      return sum + ((value - predicted) ** 2);
    }, 0);
    const r2 = total ? Math.max(0, Math.min(1, 1 - (residual / total))) : 1;
    return { slopePerDay, r2 };
  }

  function directionChanges(points, stableChange){
    let priorDirection = 0;
    let changes = 0;
    for (let index = 1; index < points.length; index += 1) {
      const difference = points[index].value - points[index - 1].value;
      const direction = Math.abs(difference) <= stableChange * 0.25 ? 0 : (difference > 0 ? 1 : -1);
      if (!direction) continue;
      if (priorDirection && direction !== priorDirection) changes += 1;
      priorDirection = direction;
    }
    return changes;
  }

  function classifyTrend(points, config, regression){
    if (points.length < 2) return 'insufficient data';
    const first = points[0];
    const latest = points[points.length - 1];
    const netChange = latest.value - first.value;
    const range = Math.max(...points.map((point) => point.value)) - Math.min(...points.map((point) => point.value));
    const reversals = directionChanges(points, config.stableChange);

    if (points.length >= 4 && reversals >= 2 && regression.r2 < 0.50 && range > config.stableChange * 1.5) {
      return 'oscillating';
    }
    if (Math.abs(netChange) <= config.stableChange || Math.abs(regression.slopePerDay) <= (config.stableChange / Math.max(7, (latest.time - first.time) / DAY_MS))) {
      return 'stable';
    }
    return regression.slopePerDay >= 0 ? 'rising' : 'falling';
  }

  function targetStatus(value, target){
    if (!Number.isFinite(value)) return 'unknown';
    if (value < target[0]) return 'below target';
    if (value > target[1]) return 'above target';
    return 'within target';
  }

  function normalizeEvents(rawEvents){
    return (rawEvents || []).map((event) => ({
      title: String((event && (event.title || event.source)) || 'Tank event'),
      notes: String((event && event.notes) || ''),
      category: String((event && (event.category || event.type || event.source)) || ''),
      time: parseDate(event && (event.isoDate || event.completedAt || event.createdAt || event.date)),
      raw: event
    })).filter((event) => event.time).sort((a, b) => a.time - b.time);
  }

  function eventIsRelevant(event, parameterKey){
    const text = `${event.title} ${event.notes} ${event.category}`.toLowerCase();
    const patterns = {
      po4: /phosphate|po4|gfo|feeding|food|water change|carbon|media|reef flux|nopox/,
      alk: /alk|alkalinity|dkh|kalk|dose|dosing|water change|salt|calcium reactor/,
      no3: /nitrate|no3|feeding|food|water change|nopox|media|denitr/,
      ca: /calcium|kalk|dose|dosing|water change|salt/,
      mg: /magnesium|mg\b|dose|dosing|water change|salt/,
      ph: /\bph\b|co2|skimmer|air|aeration|light|calibrat|water change/,
      sal: /salinity|specific gravity|salt|water change|ato|top.?off/
    };
    return Boolean(patterns[parameterKey] && patterns[parameterKey].test(text));
  }

  function strengthLabel(r2, count){
    if (count >= 5 && r2 >= 0.75) return 'strong';
    if (count >= 3 && r2 >= 0.50) return 'moderate';
    return 'weak';
  }

  function rateDisplay(slopePerDay, config){
    const daily = Math.abs(slopePerDay);
    const weekly = daily * 7;
    const useWeekly = daily < (10 ** (-config.decimals)) || weekly >= daily * 2;
    const value = useWeekly ? weekly : daily;
    const period = useWeekly ? 'week' : 'day';
    const direction = slopePerDay > 0 ? '+' : slopePerDay < 0 ? '−' : '';
    return `${direction}${formatValue(value, config)}${config.unit ? ` ${config.unit}` : ''}/${period}`;
  }

  function buildProjection(latest, status, regression, config, pointCount, spanDays){
    if (!latest || pointCount < 3 || spanDays < 3 || regression.r2 < 0.65) return null;
    if (status === 'within target' || !regression.slopePerDay) return null;

    const movingTowardTarget = (status === 'above target' && regression.slopePerDay < 0) ||
      (status === 'below target' && regression.slopePerDay > 0);
    if (!movingTowardTarget) return null;

    const boundary = status === 'above target' ? config.target[1] : config.target[0];
    const days = (boundary - latest.value) / regression.slopePerDay;
    if (!Number.isFinite(days) || days < 1 || days > 45) return null;
    return { boundary, days: Math.round(days) };
  }

  function buildInterpretation(result){
    const { config, status, trend, rapidChange, projection } = result;
    if (trend === 'insufficient data') return `Log at least two ${config.label.toLowerCase()} readings before interpreting a trend.`;
    if (rapidChange) return `${config.label} is changing quickly. Verify the next reading before making another major adjustment.`;
    if (trend === 'oscillating') return `${config.label} is moving in both directions. Stability matters more than chasing the latest reading.`;
    if (status === 'within target' && trend === 'stable') return `${config.label} is within the working range and stable. Hold the current course.`;
    if (status === 'above target' && trend === 'falling') return `${config.label} is above the working range but moving in the desired direction. Avoid stacking another correction while the decline continues.`;
    if (status === 'below target' && trend === 'rising') return `${config.label} is below the working range but moving in the desired direction. Continue monitoring before increasing intervention.`;
    if ((status === 'above target' && trend === 'rising') || (status === 'below target' && trend === 'falling')) {
      return `${config.label} is moving farther from the working range. Confirm the reading and review recent changes before responding.`;
    }
    if (projection) return `The current direction may reach the working range in about ${projection.days} days, but this is a trend estimate rather than a dosing target.`;
    return `Continue collecting consistent readings; the current trend is not strong enough for a confident projection.`;
  }

  function analyze(input){
    const parameterKey = (input && input.paramKey) || 'po4';
    const config = PARAMS[parameterKey] || PARAMS.po4;
    const points = normalizePoints(input && input.points);
    const regression = linearRegression(points);
    const first = points[0] || null;
    const latest = points[points.length - 1] || null;
    const previous = points.length > 1 ? points[points.length - 2] : null;
    const spanDays = first && latest ? Math.max(0, (latest.time - first.time) / DAY_MS) : 0;
    const netChange = first && latest ? latest.value - first.value : 0;
    const latestChange = previous && latest ? latest.value - previous.value : null;
    const latestIntervalDays = previous && latest ? Math.max((latest.time - previous.time) / DAY_MS, 0.01) : null;
    const latestDailyRate = latestChange !== null && latestIntervalDays ? latestChange / latestIntervalDays : null;
    const trend = classifyTrend(points, config, regression);
    const status = latest ? targetStatus(latest.value, config.target) : 'unknown';
    const strength = strengthLabel(regression.r2, points.length);
    const rapidChange = Number.isFinite(latestDailyRate) && Math.abs(latestDailyRate) > config.rapidDaily;
    const projection = buildProjection(latest, status, regression, config, points.length, spanDays);
    const events = normalizeEvents(input && input.events)
      .filter((event) => first && latest && event.time >= first.time && event.time <= latest.time)
      .filter((event) => eventIsRelevant(event, parameterKey))
      .slice(-6);

    const result = {
      version: VERSION,
      paramKey: parameterKey,
      config,
      points,
      first,
      latest,
      previous,
      spanDays,
      netChange: round(netChange, 6),
      latestChange: latestChange === null ? null : round(latestChange, 6),
      slopePerDay: round(regression.slopePerDay, 8),
      r2: round(regression.r2, 3),
      trend,
      status,
      strength,
      rapidChange,
      projection,
      events
    };

    result.rateDisplay = rateDisplay(result.slopePerDay, config);
    result.summary = latest
      ? `${config.label} is ${trend}. The latest reading is ${formatValue(latest.value, config)}${config.unit ? ` ${config.unit}` : ''}, which is ${status}.`
      : `No ${config.label.toLowerCase()} readings are available.`;
    result.interpretation = buildInterpretation(result);
    return result;
  }

  global.ReefKeeperTrendEngine = Object.freeze({
    version: VERSION,
    params: PARAMS,
    analyze
  });
})(typeof window !== 'undefined' ? window : globalThis);
