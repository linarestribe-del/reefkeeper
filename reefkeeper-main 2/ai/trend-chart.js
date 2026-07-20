(function(global){
  'use strict';

  const VERSION = '2B.0.0';
  const DAY_MS = 86400000;

  function finiteNumber(value, fallback){
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function niceStep(range, desiredTicks){
    const safeRange = Math.max(Math.abs(range), Number.EPSILON);
    const rough = safeRange / Math.max(2, desiredTicks || 4);
    const power = 10 ** Math.floor(Math.log10(rough));
    const normalized = rough / power;
    const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return factor * power;
  }

  function valueDecimals(paramKey, step){
    if (paramKey === 'sal') return 3;
    if (paramKey === 'po4' || paramKey === 'ph') return step < 0.1 ? 2 : 1;
    if (paramKey === 'alk' || paramKey === 'no3') return step < 1 ? 1 : 0;
    return 0;
  }

  function buildValueTicks(minValue, maxValue, paramKey, count){
    const desired = Math.max(3, count || 4);
    const step = niceStep(maxValue - minValue, desired - 1);
    const start = Math.floor(minValue / step) * step;
    const end = Math.ceil(maxValue / step) * step;
    const ticks = [];
    for (let value = start; value <= end + (step * 0.25); value += step) {
      ticks.push(Number(value.toFixed(8)));
      if (ticks.length > 10) break;
    }
    return {
      min: ticks[0],
      max: ticks[ticks.length - 1],
      step,
      decimals: valueDecimals(paramKey, step),
      ticks
    };
  }

  function normalizePoints(points){
    return (points || [])
      .map((point, index) => ({
        index,
        time: finiteNumber(point && point.time, new Date(point && (point.isoDate || point.date || 0)).getTime()),
        value: finiteNumber(point && point.value, NaN),
        date: String((point && (point.date || point.isoDate)) || '')
      }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
      .sort((a, b) => a.time - b.time);
  }

  function buildDateTicks(points, maxTicks){
    if (!points.length) return [];
    if (points.length === 1) return [{ time: points[0].time, sourceIndex: 0 }];
    const count = Math.max(2, Math.min(maxTicks || 4, points.length));
    const start = points[0].time;
    const end = points[points.length - 1].time;
    const ticks = [];
    for (let index = 0; index < count; index += 1) {
      const ratio = count === 1 ? 0 : index / (count - 1);
      const targetTime = start + ((end - start) * ratio);
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      points.forEach((point, pointIndex) => {
        const distance = Math.abs(point.time - targetTime);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = pointIndex;
        }
      });
      if (!ticks.some((tick) => tick.sourceIndex === nearestIndex)) {
        ticks.push({ time: points[nearestIndex].time, sourceIndex: nearestIndex });
      }
    }
    if (!ticks.some((tick) => tick.sourceIndex === points.length - 1)) {
      ticks.push({ time: points[points.length - 1].time, sourceIndex: points.length - 1 });
    }
    return ticks.sort((a, b) => a.time - b.time);
  }

  function buildModel(input){
    const points = normalizePoints(input && input.points);
    if (points.length < 2) return null;

    const width = finiteNumber(input && input.width, 360);
    const height = finiteNumber(input && input.height, 220);
    const padding = Object.assign({ left: 50, right: 16, top: 24, bottom: 42 }, input && input.padding);
    const target = Array.isArray(input && input.target) ? input.target.map(Number).filter(Number.isFinite) : [];
    const allValues = points.map((point) => point.value).concat(target);
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const minSpreadByParam = {
      sal: 0.003,
      po4: 0.12,
      ph: 0.20,
      alk: 0.8,
      no3: 3,
      ca: 30,
      mg: 80
    };
    const minimumSpread = minSpreadByParam[input && input.paramKey] || 1;
    const spread = Math.max(rawMax - rawMin, minimumSpread);
    const lowerBounds = { po4: 0, alk: 0, no3: 0, ca: 0, mg: 0, ph: 7.0, sal: 1.0 };
    const lowerBound = lowerBounds[input && input.paramKey];
    const paddedMinRaw = rawMin - (spread * 0.12);
    const paddedMin = Number.isFinite(lowerBound) && rawMin >= lowerBound
      ? Math.max(lowerBound, paddedMinRaw)
      : paddedMinRaw;
    const paddedMax = rawMax + (spread * 0.12);
    const valueScale = buildValueTicks(paddedMin, paddedMax, input && input.paramKey, 5);

    const startTime = points[0].time;
    const endTime = points[points.length - 1].time;
    const duration = Math.max(DAY_MS / 10, endTime - startTime);
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xForTime = (time) => padding.left + (((time - startTime) / duration) * plotWidth);
    const yForValue = (value) => padding.top + (((valueScale.max - value) / (valueScale.max - valueScale.min)) * plotHeight);

    const modeledPoints = points.map((point, index) => ({
      ...point,
      index,
      x: clamp(xForTime(point.time), padding.left, width - padding.right),
      y: clamp(yForValue(point.value), padding.top, height - padding.bottom)
    }));

    const targetBand = target.length === 2 ? {
      low: Math.min(target[0], target[1]),
      high: Math.max(target[0], target[1]),
      yTop: yForValue(Math.max(target[0], target[1])),
      yBottom: yForValue(Math.min(target[0], target[1]))
    } : null;

    const dateTicks = buildDateTicks(modeledPoints, width < 340 ? 3 : 4).map((tick) => ({
      ...tick,
      x: xForTime(tick.time)
    }));

    const valueTicks = valueScale.ticks.map((value) => ({
      value,
      y: yForValue(value)
    }));

    const events = (input && input.events || [])
      .map((event, index) => ({
        index,
        title: String((event && event.title) || 'Tank event'),
        time: finiteNumber(event && event.time, new Date(event && (event.isoDate || event.date || 0)).getTime())
      }))
      .filter((event) => Number.isFinite(event.time) && event.time >= startTime && event.time <= endTime)
      .map((event) => ({ ...event, x: xForTime(event.time) }));

    return {
      version: VERSION,
      width,
      height,
      padding,
      plotWidth,
      plotHeight,
      startTime,
      endTime,
      spanDays: (endTime - startTime) / DAY_MS,
      points: modeledPoints,
      dateTicks,
      valueTicks,
      valueScale,
      targetBand,
      events,
      nearestPointByX(svgX){
        return modeledPoints.reduce((best, point) => {
          const distance = Math.abs(point.x - svgX);
          return !best || distance < best.distance ? { point, distance } : best;
        }, null)?.point || modeledPoints[modeledPoints.length - 1];
      }
    };
  }

  global.ReefKeeperTrendChart = Object.freeze({
    version: VERSION,
    buildModel
  });
})(typeof window !== 'undefined' ? window : globalThis);
