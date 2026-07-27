#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHER_PATH = ROOT / 'connector' / 'observer-publisher.py'
spec = importlib.util.spec_from_file_location('observer_publisher_9f', PUBLISHER_PATH)
assert spec and spec.loader
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

WIDTH = publisher.MONITOR_WIDTH
HEIGHT = publisher.MONITOR_HEIGHT


def base_frame() -> list[int]:
    return [
        (x * 7 + y * 11 + ((x // 7) % 2) * 35) % 256
        for y in range(HEIGHT)
        for x in range(WIDTH)
    ]


def maintenance_frame(source: list[int]) -> list[int]:
    output = source[:]
    # Change the central skimmer/GFO equipment area while leaving the right-side
    # fixed cabinet/plumbing anchor zones unchanged.
    for y in range(int(HEIGHT * 0.12), int(HEIGHT * 0.68)):
        for x in range(int(WIDTH * 0.10), int(WIDTH * 0.62)):
            output[y * WIDTH + x] = 245 - (output[y * WIDTH + x] // 3)
    return output


reference = base_frame()
changed = maintenance_frame(reference)
reference_metrics = publisher.frame_metrics(reference)
changed_metrics = publisher.frame_metrics(changed)
reference_signature = publisher.normalized_signature(reference, reference_metrics['meanBrightness'])
changed_signature = publisher.normalized_signature(changed, changed_metrics['meanBrightness'])
zones = publisher.parse_monitor_zones([
    {'x': 0.76, 'y': 0.0, 'width': 0.24, 'height': 1.0, 'weight': 1.0},
    {'x': 0.50, 'y': 0.68, 'width': 0.50, 'height': 0.32, 'weight': 0.65},
])
full = publisher.compare_to_baseline(changed_signature, reference_signature)
anchors = publisher.compare_to_baseline(changed_signature, reference_signature, zones=zones)
assert full['changeScore'] > anchors['changeScore'] + 0.05
assert anchors['changeScore'] < 0.12

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    state_path = base / 'monitor-status.json'
    config_path = base / 'monitoring.json'
    config_path.write_text(json.dumps({
        'scene_change_threshold': 0.10,
        'anchor_change_threshold': 0.12,
        'maintenance_settle_streak': 2,
        'scene_anchor_zones': zones,
    }))
    frames = [reference, reference, changed, changed]
    publisher.decode_monitor_frame = lambda _path: frames.pop(0)
    start = datetime(2026, 7, 28, 16, 0, tzinfo=timezone.utc)
    publisher.evaluate_local_monitor({}, base / 'latest.jpg', start, config_path=config_path, state_path=state_path, capture_key='base-1')
    stable = publisher.evaluate_local_monitor({}, base / 'latest.jpg', start + timedelta(minutes=5), config_path=config_path, state_path=state_path, capture_key='base-2')
    assert stable['scene']['status'] == 'healthy'
    settling = publisher.evaluate_local_monitor({}, base / 'latest.jpg', start + timedelta(minutes=10), config_path=config_path, state_path=state_path, capture_key='maintenance-1')
    assert settling['scene']['status'] == 'pending'
    assert settling['scene']['maintenanceVariation'] is True
    adapted = publisher.evaluate_local_monitor({}, base / 'latest.jpg', start + timedelta(minutes=15), config_path=config_path, state_path=state_path, capture_key='maintenance-2')
    assert adapted['scene']['status'] == 'healthy'
    assert adapted['scene']['learningState'] == 'maintenance-adapting'
    assert not any(item['code'] in {'sump_scene_changed', 'camera_anchor_changed'} for item in adapted['issues'])

# Consensus requires multiple agreeing frames and reports disagreement directly.
frames = [(datetime(2026, 7, 28, 16, i * 5, tzinfo=timezone.utc), Path(f'/tmp/frame-{i}.jpg')) for i in range(3)]
publisher.recent_filter_roll_images = lambda *_args, **_kwargs: frames
radii = iter([78.2, 78.8, 78.5])
publisher.analyze_filter_roll_frame = lambda *_args, **_kwargs: {
    'available': True,
    'confidence': 0.9,
    'apparentOuterRadius': next(radii),
    'message': 'Frame edge found.',
}
consensus = publisher.analyze_filter_roll_consensus(
    Path('/tmp/frame-2.jpg'),
    frames[-1][0],
    (0.55, 0.0, 0.13, 0.24),
    0.38,
    {'consensus_frames': 3, 'minimum_consensus_frames': 2, 'maximum_radius_deviation_px': 4.5},
)
assert consensus['available'] is True
assert consensus['successfulFrameCount'] == 3
assert 78.2 <= consensus['apparentOuterRadius'] <= 78.8

# Accepted state remains top-level while a rejected attempt and its real reason are preserved.
with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    state_path = base / 'filter-roll-status.json'
    config_path = base / 'filter-roll.json'
    first_time = datetime(2026, 7, 28, 9, 0, tzinfo=timezone.utc)
    second_time = first_time + timedelta(hours=6)
    hours = sorted({first_time.astimezone().hour, second_time.astimezone().hour})
    config_path.write_text(json.dumps({
        'enabled': True,
        'roi': [0.55, 0.0, 0.13, 0.24],
        'probe_y': 0.38,
        'measurement_hours_local': hours,
        'min_spacing_minutes': 240,
        'minimum_confidence': 0.65,
        'large_change_confirmations': 2,
    }))
    results = iter([
        {'available': True, 'confidence': 0.91, 'apparentOuterRadius': 78.5, 'frameCount': 3, 'successfulFrameCount': 3, 'message': 'Three frames agreed.'},
        {'available': True, 'confidence': 0.88, 'apparentOuterRadius': 51.5, 'frameCount': 3, 'successfulFrameCount': 3, 'message': 'Three frames agreed.'},
    ])
    publisher.analyze_filter_roll_consensus = lambda *_args, **_kwargs: next(results)
    first = publisher.evaluate_filter_roll(
        {}, {'captured_at': first_time.isoformat()}, image_path=base / 'one.jpg', now=first_time,
        config_path=config_path, state_path=state_path,
    )
    assert first['available'] is True
    assert first['apparentOuterRadius'] == 78.5
    second = publisher.evaluate_filter_roll(
        {}, {'captured_at': second_time.isoformat()}, image_path=base / 'two.jpg', now=second_time,
        config_path=config_path, state_path=state_path,
    )
    assert second['available'] is True, 'Last accepted reading must remain available after a rejected attempt.'
    assert second['measuredAt'] == first_time.isoformat()
    assert second['lastAttempt']['accepted'] is False
    assert 'requires confirmation' in second['lastAttempt']['rejectionReason']
    saved = json.loads(state_path.read_text())
    assert saved['lastAccepted']['apparentOuterRadius'] == 78.5
    assert saved['lastAttempt']['apparentOuterRadius'] == 51.5
    assert saved['lastAttempt']['rejectionReason']

filter_calibrator = (ROOT / 'connector' / 'observer-filter-roll-calibrate.py').read_text(encoding='utf-8')
water_calibrator = (ROOT / 'connector' / 'observer-water-level-calibrate.py').read_text(encoding='utf-8')
assert "group='reefkeeper'" in filter_calibrator
assert '0o640' in filter_calibrator
assert 'outer-edge-consensus-v2' in filter_calibrator
assert "group='reefkeeper'" in water_calibrator
assert '0o640' in water_calibrator

print('Maintenance 9F Observer reliability tests passed.')
