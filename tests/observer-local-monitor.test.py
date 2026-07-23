#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHER_PATH = ROOT / 'connector' / 'observer-publisher.py'

spec = importlib.util.spec_from_file_location('observer_publisher_8c', PUBLISHER_PATH)
assert spec and spec.loader
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

WIDTH = publisher.MONITOR_WIDTH
HEIGHT = publisher.MONITOR_HEIGHT


def patterned_frame(offset: int = 0) -> list[int]:
    return [
        (x * 7 + y * 11 + ((x // 8) % 2) * 50 + offset) % 256
        for y in range(HEIGHT)
        for x in range(WIDTH)
    ]


def shifted_frame(source: list[int], dx: int) -> list[int]:
    output = [0] * len(source)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            source_x = max(0, min(WIDTH - 1, x - dx))
            output[y * WIDTH + x] = source[y * WIDTH + source_x]
    return output


def water_frame(line_row: int) -> list[int]:
    return [40 if y < line_row else 180 for y in range(HEIGHT) for _ in range(WIDTH)]


metrics = publisher.frame_metrics(patterned_frame())
assert metrics['contrast'] > 20
assert metrics['edgeEnergy'] > 5

signature = publisher.normalized_signature(patterned_frame(), metrics['meanBrightness'])
same = publisher.compare_to_baseline(signature, signature)
assert same['available'] is True
assert same['changeScore'] == 0

moved_pixels = shifted_frame(patterned_frame(), 3)
moved_metrics = publisher.frame_metrics(moved_pixels)
moved_signature = publisher.normalized_signature(moved_pixels, moved_metrics['meanBrightness'])
moved = publisher.compare_to_baseline(moved_signature, signature)
assert moved['movementLikely'] is True
assert moved['shiftX'] == 3

water = publisher.detect_water_line(water_frame(HEIGHT // 2), (0.1, 0.1, 0.8, 0.8))
assert water['available'] is True
assert water['confidence'] >= 0.8
assert 43 <= water['yPercent'] <= 55

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    publisher.MONITOR_STATUS_PATH = base / 'monitor-status.json'
    publisher.MONITOR_CONFIG_PATH = base / 'monitoring.json'
    publisher.decode_monitor_frame = lambda _path: patterned_frame()

    first = publisher.evaluate_local_monitor({}, base / 'latest.jpg', datetime(2026, 7, 23, 1, 0, tzinfo=timezone.utc))
    assert first['scene']['baselineReady'] is False
    assert first['scene']['status'] == 'pending'
    assert publisher.MONITOR_STATUS_PATH.exists()

    second = publisher.evaluate_local_monitor({}, base / 'latest.jpg', datetime(2026, 7, 23, 1, 5, tzinfo=timezone.utc))
    assert second['imageQuality']['status'] == 'healthy'
    assert second['scene']['baselineReady'] is True
    assert second['scene']['status'] == 'healthy'
    assert not any(item['code'] == 'camera_view_obstructed' for item in second['issues'])

    publisher.decode_monitor_frame = lambda _path: [0] * (WIDTH * HEIGHT)
    pending_obstruction = publisher.evaluate_local_monitor({}, base / 'latest.jpg', datetime(2026, 7, 23, 1, 10, tzinfo=timezone.utc))
    assert pending_obstruction['imageQuality']['status'] == 'pending'
    confirmed_obstruction = publisher.evaluate_local_monitor({}, base / 'latest.jpg', datetime(2026, 7, 23, 1, 15, tzinfo=timezone.utc))
    assert confirmed_obstruction['imageQuality']['status'] == 'attention'
    assert any(item['code'] == 'camera_view_obstructed' for item in confirmed_obstruction['issues'])

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    publisher.MONITOR_STATUS_PATH = base / 'monitor-status.json'
    publisher.MONITOR_CONFIG_PATH = base / 'monitoring.json'
    publisher.MONITOR_CONFIG_PATH.write_text(json.dumps({
        'water_level': {
            'enabled': True,
            'roi': [0.1, 0.1, 0.8, 0.8],
            'baseline_y_percent': 60,
            'warning_delta_percent': 5,
            'urgent_delta_percent': 15,
            'alert_streak': 2,
            'minimum_confidence': 0.45,
        }
    }))
    publisher.decode_monitor_frame = lambda _path: water_frame(HEIGHT // 2)

    first = publisher.evaluate_local_monitor({}, base / 'latest.jpg', datetime(2026, 7, 23, 2, 0, tzinfo=timezone.utc))
    assert first['waterLevel']['configured'] is True
    assert first['waterLevel']['status'] == 'pending'
    second = publisher.evaluate_local_monitor({}, base / 'latest.jpg', datetime(2026, 7, 23, 2, 5, tzinfo=timezone.utc))
    assert second['waterLevel']['status'] == 'attention'
    assert second['waterLevel']['direction'] == 'higher'
    assert any(item['code'] == 'water_level_watch' for item in second['issues'])

print('Observer local monitor tests passed.')
