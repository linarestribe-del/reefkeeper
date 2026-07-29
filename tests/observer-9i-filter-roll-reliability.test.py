from __future__ import annotations

import importlib.util
import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('observer_publisher', ROOT / 'connector' / 'observer-publisher.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

assert publisher.PUBLISHER_VERSION == '2.8.1'

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    state_path = base / 'filter-roll-status.json'
    config_path = base / 'filter-roll.json'
    first_time = datetime(2026, 7, 28, 15, 0, tzinfo=timezone.utc)
    second_time = first_time + timedelta(hours=18)
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
        {'available': True, 'confidence': 0.89, 'apparentOuterRadius': 73.0, 'frameCount': 3, 'successfulFrameCount': 3, 'message': 'Three frames agreed.'},
        {'available': True, 'confidence': 0.637, 'apparentOuterRadius': 65.0, 'frameCount': 3, 'successfulFrameCount': 3, 'message': 'Three frames agreed.'},
    ])
    publisher.analyze_filter_roll_consensus = lambda *_args, **_kwargs: next(results)
    first = publisher.evaluate_filter_roll(
        {}, {'captured_at': first_time.isoformat()}, image_path=base / 'one.jpg', now=first_time,
        config_path=config_path, state_path=state_path,
    )
    assert first['available'] is True
    assert first['apparentOuterRadius'] == 73.0
    second = publisher.evaluate_filter_roll(
        {}, {'captured_at': second_time.isoformat()}, image_path=base / 'two.jpg', now=second_time,
        config_path=config_path, state_path=state_path,
    )
    assert second['available'] is True
    assert second['measuredAt'] == first_time.isoformat()
    reason = second['lastAttempt']['rejectionReason']
    assert 'below the 65% acceptance threshold' in reason
    assert 'Large radius decrease' in reason
    assert second['lastAttempt']['apparentOuterRadius'] == 65.0
    saved = json.loads(state_path.read_text())
    assert saved['lastAccepted']['apparentOuterRadius'] == 73.0
    assert saved['lastAttempt']['accepted'] is False
    assert saved['pendingCandidate'] is None

print('Maintenance 9I filter-roll reliability tests passed.')
