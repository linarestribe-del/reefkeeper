#!/usr/bin/env python3
"""Publish current and selected historical Aquarium Observer captures."""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

CONFIG_PATH = Path('/etc/reefkeeper-observer/publisher.json')
BASE_DIR = Path('/mnt/reef-ssd/aquarium-observer')
IMAGE_PATH = BASE_DIR / 'latest.jpg'
CAPTURES_DIR = BASE_DIR / 'captures'
CAPTURE_STATUS_PATH = BASE_DIR / 'status.json'
PUBLISH_STATUS_PATH = BASE_DIR / 'publish-status.json'
MAX_IMAGE_BYTES = 2 * 1024 * 1024
PUBLISHER_VERSION = '2.0'
CAPTURE_NAME_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.jpg$', re.I)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError(f'{path.name} must contain a JSON object')
    return data


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f'.{path.name}.', suffix='.partial', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(data, handle, indent=2)
            handle.write('\n')
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def safe_text(value: Any, limit: int = 160) -> str:
    return ' '.join(str(value or '').split())[:limit]


def read_jpeg(path: Path) -> bytes:
    image = path.read_bytes()
    if not image:
        raise ValueError(f'{path.name} is empty')
    if len(image) > MAX_IMAGE_BYTES:
        raise ValueError(f'{path.name} exceeds {MAX_IMAGE_BYTES} bytes')
    if not image.startswith(b'\xff\xd8\xff'):
        raise ValueError(f'{path.name} is not a JPEG image')
    return image


def parse_capture_datetime(path: Path) -> datetime | None:
    match = CAPTURE_NAME_RE.match(path.name)
    if match:
        parts = [int(value) for value in match.groups()]
        local = datetime(*parts).astimezone()
        return local.astimezone(timezone.utc)
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        return None


def capture_catalog() -> list[tuple[datetime, Path]]:
    catalog: list[tuple[datetime, Path]] = []
    if not CAPTURES_DIR.exists():
        return catalog
    for path in CAPTURES_DIR.rglob('*.jpg'):
        captured = parse_capture_datetime(path)
        if captured:
            catalog.append((captured, path))
    catalog.sort(key=lambda item: item[0])
    return catalog


def nearest_capture(catalog: list[tuple[datetime, Path]], target: datetime, tolerance: timedelta, before: datetime) -> tuple[datetime, Path] | None:
    candidates = [item for item in catalog if item[0] < before]
    if not candidates:
        return None
    selected = min(candidates, key=lambda item: abs(item[0] - target))
    return selected if abs(selected[0] - target) <= tolerance else None


def select_history(captured_at: datetime) -> list[dict[str, Any]]:
    catalog = capture_catalog()
    older = [item for item in catalog if item[0] < captured_at - timedelta(seconds=1)]
    selections: list[tuple[str, tuple[datetime, Path] | None]] = [
        ('previous', older[-1] if older else None),
        ('dayAgo', nearest_capture(catalog, captured_at - timedelta(days=1), timedelta(hours=6), captured_at)),
        ('weekAgo', nearest_capture(catalog, captured_at - timedelta(days=7), timedelta(hours=18), captured_at)),
    ]
    output: list[dict[str, Any]] = []
    used: set[Path] = set()
    for slot, selected in selections:
        if not selected or selected[1] in used:
            continue
        selected_at, path = selected
        try:
            image = read_jpeg(path)
        except (OSError, ValueError):
            continue
        output.append({
            'slot': slot,
            'capturedAt': selected_at.isoformat(),
            'imageBase64': base64.b64encode(image).decode('ascii'),
        })
        used.add(path)
    return output


def build_payload(config: dict[str, Any], capture: dict[str, Any], image: bytes, history: list[dict[str, Any]]) -> dict[str, Any]:
    disk = shutil.disk_usage(BASE_DIR)
    used_percent = round(((disk.total - disk.free) / disk.total) * 100, 2) if disk.total else 0
    return {
        'publisherVersion': PUBLISHER_VERSION,
        'ok': capture.get('ok') is True,
        'capturedAt': capture.get('captured_at') or capture.get('capturedAt'),
        'cameraLabel': safe_text(config.get('camera_label') or 'Sump camera', 80),
        'stream': safe_text(capture.get('stream') or 'stream2', 30),
        'resolution': safe_text(config.get('resolution') or '1280×720', 40),
        'captureIntervalMinutes': int(config.get('capture_interval_minutes') or 5),
        'sizeBytes': len(image),
        'durationSeconds': capture.get('duration_seconds') or capture.get('durationSeconds') or 0,
        'storage': {
            'label': safe_text(config.get('storage_label') or 'Local Pi drive', 80),
            'totalBytes': disk.total,
            'availableBytes': disk.free,
            'usedPercent': used_percent,
        },
        'message': safe_text(capture.get('error') or '', 240),
        'imageContentType': 'image/jpeg',
        'imageBase64': base64.b64encode(image).decode('ascii'),
        'historyImages': history,
    }


def last_published_capture() -> str:
    try:
        status = read_json(PUBLISH_STATUS_PATH)
        if status.get('ok') is True and status.get('publisherVersion') == PUBLISHER_VERSION:
            return str(status.get('capturedAt') or '')
    except (FileNotFoundError, ValueError, json.JSONDecodeError, OSError):
        pass
    return ''


def main() -> int:
    started_at = utc_now()
    try:
        config = read_json(CONFIG_PATH)
        endpoint = str(config.get('endpoint') or '').strip()
        token = str(config.get('token') or '').strip()
        if not endpoint.startswith('https://'):
            raise ValueError('Publisher endpoint must use HTTPS')
        if not token:
            raise ValueError('Publisher token is missing')

        capture = read_json(CAPTURE_STATUS_PATH)
        captured_raw = str(capture.get('captured_at') or capture.get('capturedAt') or '')
        if not captured_raw:
            raise ValueError('Capture status is missing captured_at')
        captured_at = datetime.fromisoformat(captured_raw.replace('Z', '+00:00')).astimezone(timezone.utc)

        if captured_raw == last_published_capture():
            print(f'PUBLISH_SKIPPED already published {captured_raw}')
            return 0

        image = read_jpeg(IMAGE_PATH)
        history = select_history(captured_at)
        payload = build_payload(config, capture, image, history)
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, separators=(',', ':')).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'User-Agent': f'ReefKeeperObserverPublisher/{PUBLISHER_VERSION}',
            },
            method='POST',
        )

        with urllib.request.urlopen(request, timeout=55) as response:
            response_body = response.read().decode('utf-8', errors='replace')
            result = json.loads(response_body) if response_body else {}
            if response.status != 200 or result.get('ok') is not True:
                raise RuntimeError(f'Publish returned HTTP {response.status}')

        slots = result.get('historySlots') or []
        write_json_atomic(PUBLISH_STATUS_PATH, {
            'ok': True,
            'capturedAt': captured_raw,
            'publishedAt': result.get('publishedAt') or utc_now(),
            'sizeBytes': len(image),
            'historySlots': slots,
            'publisherVersion': PUBLISHER_VERSION,
        })
        print(f"PUBLISH_OK {captured_raw} {len(image)} bytes history={','.join(slots) or 'none'}")
        return 0

    except urllib.error.HTTPError as error:
        body = error.read().decode('utf-8', errors='replace')[:400]
        message = f'HTTP {error.code}: {body or error.reason}'
    except urllib.error.URLError as error:
        message = f'Network error: {error.reason}'
    except Exception as error:
        message = str(error)

    write_json_atomic(PUBLISH_STATUS_PATH, {
        'ok': False,
        'failedAt': utc_now(),
        'startedAt': started_at,
        'error': safe_text(message, 400),
        'publisherVersion': PUBLISHER_VERSION,
    })
    print(f'PUBLISH_FAILED: {message}', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
