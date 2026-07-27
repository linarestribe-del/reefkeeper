#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHER_PATH = ROOT / 'connector' / 'observer-publisher.py'
spec = importlib.util.spec_from_file_location('observer_publisher_9c', PUBLISHER_PATH)
assert spec and spec.loader
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

width = publisher.FILTER_ROLL_ANALYSIS_WIDTH
height = publisher.FILTER_ROLL_ANALYSIS_HEIGHT
pixels = [18] * (width * height)
for y in range(height):
    left = 58 + abs(y - 91) // 45
    right = 258 - abs(y - 91) // 45
    for x in range(max(0, left), min(width, right + 1)):
        pixels[y * width + x] = 218

publisher.decode_monitor_region = lambda _path, _roi: pixels
result = publisher.analyze_filter_roll_frame(Path('/tmp/not-used.jpg'), (0.55, 0.0, 0.13, 0.24), 0.38)
assert result['available'] is True
assert result['sampleCount'] >= 4
assert result['confidence'] >= 0.5
assert result['apparentCoreRadius'] is None
assert result['apparentThicknessPct'] is None
assert 95 <= result['apparentOuterRadius'] <= 105
assert 'outer silhouette' in result['message'].lower()

calibrator = (ROOT / 'connector' / 'observer-filter-roll-calibrate.py').read_text(encoding='utf-8')
assert 'outer-edge-consensus-v2' in calibrator
assert 'apparentOuterRadius is measured in pixels' in calibrator

print('Observer outer-edge filter-roll tests passed.')
