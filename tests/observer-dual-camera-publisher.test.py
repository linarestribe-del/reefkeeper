#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHER_PATH = ROOT / 'connector' / 'observer-publisher.py'
spec = importlib.util.spec_from_file_location('observer_publisher_8d', PUBLISHER_PATH)
assert spec and spec.loader
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

JPEG = b'\xff\xd8\xff\xe0dual-camera-test\xff\xd9'

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    return_base = base / 'return-chamber'
    captures = return_base / 'captures' / '2026' / '07' / '24'
    captures.mkdir(parents=True)
    image_path = return_base / 'latest.jpg'
    image_path.write_bytes(JPEG)
    capture_path = captures / '2026-07-24_01-00-00.jpg'
    capture_path.write_bytes(JPEG)
    status_path = return_base / 'status.json'
    captured_at = datetime.now(timezone.utc).isoformat()
    status_path.write_text(json.dumps({
        'ok': True,
        'captured_at': captured_at,
        'stream': 'stream1',
        'size_bytes': len(JPEG),
    }))

    publisher.RETURN_BASE_DIR = return_base
    publisher.RETURN_IMAGE_PATH = image_path
    publisher.RETURN_CAPTURES_DIR = return_base / 'captures'
    publisher.RETURN_CAPTURE_STATUS_PATH = status_path
    publisher.RETURN_MONITOR_STATUS_PATH = return_base / 'monitor-status.json'
    publisher.RETURN_MONITOR_CONFIG_PATH = base / 'return-monitoring.json'
    publisher.decode_monitor_frame = lambda _path: [
        (x * 5 + y * 9) % 256
        for y in range(publisher.MONITOR_HEIGHT)
        for x in range(publisher.MONITOR_WIDTH)
    ]
    publisher.unit_state = lambda _unit: (True, 'active')
    publisher.storage_probe = lambda: {
        'mounted': True, 'exists': True, 'writable': True,
        'totalBytes': 1000, 'availableBytes': 800, 'usedPercent': 20.0, 'probeError': ''
    }
    publisher.power_probe = lambda: {
        'available': True, 'throttledHex': '0x0', 'undervoltageNow': False,
        'undervoltageOccurred': False, 'throttledNow': False, 'throttledOccurred': False
    }

    calls = []
    def fake_post(endpoint, token, payload, timeout=55):
        calls.append((endpoint, token, payload, timeout))
        return {
            'ok': True,
            'cameraId': 'return',
            'capturedAt': payload.get('capturedAt'),
            'publishedAt': datetime.now(timezone.utc).isoformat(),
        }
    publisher.post_json = fake_post

    result = publisher.publish_return_camera(
        {'return_capture_interval_minutes': 5, 'return_resolution': '2560×1440'},
        'https://reefkeeper.example/api/observer-publish',
        'secret-token',
        {},
    )
    assert result['ok'] is True
    assert result['healthStatus'] in {'healthy', 'attention'}
    assert calls and calls[0][0].endswith('/api/observer-publish?camera=return')
    payload = calls[0][2]
    assert payload['cameraId'] == 'return'
    assert payload['cameraLabel'] == 'Return chamber'
    assert payload['stream'] == 'stream1'
    assert payload['resolution'] == '2560×1440'
    assert payload['imageBase64']
    serialized = json.dumps(payload)
    assert '192.168.' not in serialized
    assert 'rtsp://' not in serialized.lower()
    assert '/mnt/reef-ssd' not in serialized

print('Observer dual-camera publisher tests passed.')
