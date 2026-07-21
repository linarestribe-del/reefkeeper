#!/usr/bin/env python3
"""Publish Aquarium Observer captures, history frames, and Pi health diagnostics."""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

CONFIG_PATH = Path('/etc/reefkeeper-observer/publisher.json')
MOUNT_DIR = Path('/mnt/reef-ssd')
BASE_DIR = MOUNT_DIR / 'aquarium-observer'
IMAGE_PATH = BASE_DIR / 'latest.jpg'
CAPTURES_DIR = BASE_DIR / 'captures'
CAPTURE_STATUS_PATH = BASE_DIR / 'status.json'
PUBLISH_STATUS_PATH = BASE_DIR / 'publish-status.json'
MAX_IMAGE_BYTES = 2 * 1024 * 1024
PUBLISHER_VERSION = '2.1'
CAPTURE_TIMER = 'reefkeeper-camera-capture.timer'
PUBLISH_TIMER = 'reefkeeper-observer-publish.timer'
CAPTURE_NAME_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.jpg$', re.I)


def utc_now_dt() -> datetime:
    return datetime.now(timezone.utc)


def utc_now() -> str:
    return utc_now_dt().isoformat()


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


def try_write_status(data: dict[str, Any]) -> None:
    if not os.path.ismount(MOUNT_DIR) or not BASE_DIR.exists():
        print('Local publish status not written because the Observer drive is not mounted.', file=sys.stderr)
        return
    try:
        write_json_atomic(PUBLISH_STATUS_PATH, data)
    except Exception as error:
        print(f'Could not write local publish status: {error}', file=sys.stderr)


def safe_text(value: Any, limit: int = 160) -> str:
    return ' '.join(str(value or '').split())[:limit]


def parse_iso(value: Any) -> datetime | None:
    text = str(value or '').strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace('Z', '+00:00')).astimezone(timezone.utc)
    except ValueError:
        return None


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
    try:
        paths = CAPTURES_DIR.rglob('*.jpg')
        for path in paths:
            captured = parse_capture_datetime(path)
            if captured:
                catalog.append((captured, path))
    except OSError:
        return []
    catalog.sort(key=lambda item: item[0])
    return catalog


def nearest_capture(catalog: list[tuple[datetime, Path]], target: datetime, tolerance: timedelta, before: datetime) -> tuple[datetime, Path] | None:
    candidates = [item for item in catalog if item[0] < before]
    if not candidates:
        return None
    selected = min(candidates, key=lambda item: abs(item[0] - target))
    return selected if abs(selected[0] - target) <= tolerance else None


def select_history(catalog: list[tuple[datetime, Path]], captured_at: datetime) -> list[dict[str, Any]]:
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


def command_output(command: list[str], timeout: float = 4.0) -> tuple[int, str]:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
        return result.returncode, safe_text(result.stdout or result.stderr, 180)
    except (OSError, subprocess.SubprocessError) as error:
        return 127, safe_text(error, 180)


def unit_state(unit: str) -> tuple[bool, str]:
    code, output = command_output(['systemctl', 'is-active', unit])
    state = output or ('active' if code == 0 else 'unknown')
    return code == 0 and state == 'active', state


def storage_probe() -> dict[str, Any]:
    mounted = os.path.ismount(MOUNT_DIR)
    exists = BASE_DIR.exists()
    writable = False
    probe_error = ''
    total = available = used_percent = 0
    if exists:
        try:
            disk = shutil.disk_usage(BASE_DIR)
            total = disk.total
            available = disk.free
            used_percent = round(((disk.total - disk.free) / disk.total) * 100, 2) if disk.total else 0
        except OSError as error:
            probe_error = safe_text(error, 180)
        try:
            descriptor, name = tempfile.mkstemp(prefix='.health.', suffix='.tmp', dir=BASE_DIR)
            os.close(descriptor)
            os.unlink(name)
            writable = True
        except OSError as error:
            probe_error = probe_error or safe_text(error, 180)
    return {
        'mounted': mounted,
        'exists': exists,
        'writable': writable,
        'totalBytes': total,
        'availableBytes': available,
        'usedPercent': used_percent,
        'probeError': probe_error,
    }


def power_probe() -> dict[str, Any]:
    executable = shutil.which('vcgencmd') or '/usr/bin/vcgencmd'
    code, output = command_output([executable, 'get_throttled'])
    match = re.search(r'0x([0-9a-fA-F]+)', output)
    flags = int(match.group(1), 16) if match else 0
    return {
        'available': code == 0 and match is not None,
        'throttledHex': f'0x{flags:x}' if match else safe_text(output or 'unavailable', 40),
        'undervoltageNow': bool(flags & 0x1),
        'undervoltageOccurred': bool(flags & 0x10000),
        'throttledNow': bool(flags & 0x4),
        'throttledOccurred': bool(flags & 0x40000),
    }


def health_issue(code: str, severity: str, message: str) -> dict[str, str]:
    return {'code': code, 'severity': severity, 'message': safe_text(message, 240)}


def collect_health(config: dict[str, Any], capture: dict[str, Any], catalog: list[tuple[datetime, Path]]) -> dict[str, Any]:
    now = utc_now_dt()
    interval = max(1, int(config.get('capture_interval_minutes') or 5))
    capture_timer_active, capture_timer_state = unit_state(CAPTURE_TIMER)
    publish_timer_active, publish_timer_state = unit_state(PUBLISH_TIMER)
    storage = storage_probe()
    power = power_probe()
    captured_at = parse_iso(capture.get('captured_at') or capture.get('capturedAt'))
    capture_age = max(0, int((now - captured_at).total_seconds())) if captured_at else None
    capture_ok = capture.get('ok') is True
    latest_exists = IMAGE_PATH.is_file()
    warning_age = max(15 * 60, interval * 3 * 60)
    offline_age = max(60 * 60, interval * 12 * 60)
    issues: list[dict[str, str]] = []

    capture_status = 'healthy'
    capture_message = 'Camera captures are current.'
    if not capture_timer_active:
        capture_status = 'offline'
        capture_message = f'Capture timer is {capture_timer_state}.'
        issues.append(health_issue('capture_timer_inactive', 'critical', capture_message))
    elif not captured_at or not latest_exists:
        capture_status = 'offline'
        capture_message = 'No current capture image or timestamp is available.'
        issues.append(health_issue('capture_missing', 'critical', capture_message))
    elif not capture_ok:
        capture_status = 'attention'
        capture_message = safe_text(capture.get('error') or 'The latest camera capture reported an error.', 220)
        issues.append(health_issue('capture_error', 'warning', capture_message))
    elif capture_age is not None and capture_age >= offline_age:
        capture_status = 'offline'
        capture_message = f'Latest capture is {capture_age // 60} minutes old.'
        issues.append(health_issue('capture_offline', 'critical', capture_message))
    elif capture_age is not None and capture_age >= warning_age:
        capture_status = 'attention'
        capture_message = f'Latest capture is {capture_age // 60} minutes old.'
        issues.append(health_issue('capture_stale', 'warning', capture_message))

    publisher_status = 'healthy' if publish_timer_active else 'attention'
    publisher_message = 'Publishing timer is active.' if publish_timer_active else f'Publishing timer is {publish_timer_state}.'
    if not publish_timer_active:
        issues.append(health_issue('publisher_timer_inactive', 'warning', publisher_message))

    storage_status = 'healthy'
    storage_message = 'Observer drive is mounted and writable.'
    if not storage['mounted']:
        storage_status = 'offline'
        storage_message = 'Observer drive is not mounted at /mnt/reef-ssd.'
        issues.append(health_issue('storage_unmounted', 'critical', storage_message))
    elif not storage['writable']:
        storage_status = 'offline'
        storage_message = 'Observer drive is mounted but not writable.'
        issues.append(health_issue('storage_read_only', 'critical', storage_message))
    elif storage['usedPercent'] >= 98:
        storage_status = 'offline'
        storage_message = f"Observer drive is {storage['usedPercent']:.1f}% full."
        issues.append(health_issue('storage_critical', 'critical', storage_message))
    elif storage['usedPercent'] >= 90 or (storage['availableBytes'] and storage['availableBytes'] < 10 * 1024 ** 3):
        storage_status = 'attention'
        storage_message = f"Observer drive is {storage['usedPercent']:.1f}% full."
        issues.append(health_issue('storage_low', 'warning', storage_message))

    power_status = 'healthy'
    if power['undervoltageNow'] or power['throttledNow']:
        power_status = 'attention'
        power_message = 'The Pi is currently reporting undervoltage or throttling.'
        issues.append(health_issue('power_current', 'warning', power_message))
    elif power['undervoltageOccurred'] or power['throttledOccurred']:
        power_message = 'A past undervoltage or throttling flag is stored, but it is not active now.'
        issues.append(health_issue('power_historical', 'info', power_message))
    elif power['available']:
        power_message = 'No undervoltage or throttling flags are set.'
    else:
        power_message = 'Pi power flags could not be read.'
        issues.append(health_issue('power_unavailable', 'info', power_message))

    ready_slots: list[str] = []
    if len(catalog) >= 2:
        ready_slots.append('previous')
    if captured_at and nearest_capture(catalog, captured_at - timedelta(days=1), timedelta(hours=6), captured_at):
        ready_slots.append('dayAgo')
    if captured_at and nearest_capture(catalog, captured_at - timedelta(days=7), timedelta(hours=18), captured_at):
        ready_slots.append('weekAgo')
    archive_status = 'healthy' if catalog else 'attention'
    archive_message = f'{len(catalog)} archived captures found.' if catalog else 'No archived captures were found.'
    if not catalog:
        issues.append(health_issue('archive_empty', 'warning', archive_message))

    critical = any(item['severity'] == 'critical' for item in issues)
    warning = any(item['severity'] == 'warning' for item in issues)
    overall = 'offline' if critical else ('attention' if warning else 'healthy')
    summary = {
        'healthy': 'Observer capture, publishing, storage, and power checks are healthy.',
        'attention': 'Observer is running, but one or more checks need attention.',
        'offline': 'A critical Observer component is unavailable.',
    }[overall]

    return {
        'status': overall,
        'summary': summary,
        'checkedAt': now.isoformat(),
        'issues': issues,
        'capture': {
            'status': capture_status,
            'message': capture_message,
            'capturedAt': captured_at.isoformat() if captured_at else None,
            'ageSeconds': capture_age,
            'timerActive': capture_timer_active,
            'timerState': capture_timer_state,
            'latestImageExists': latest_exists,
        },
        'publisher': {
            'status': publisher_status,
            'message': publisher_message,
            'timerActive': publish_timer_active,
            'timerState': publish_timer_state,
            'version': PUBLISHER_VERSION,
        },
        'storage': {
            'status': storage_status,
            'message': storage_message,
            **storage,
        },
        'power': {
            'status': power_status,
            'message': power_message,
            **power,
        },
        'archive': {
            'status': archive_status,
            'message': archive_message,
            'captureCount': len(catalog),
            'oldestCaptureAt': catalog[0][0].isoformat() if catalog else None,
            'newestCaptureAt': catalog[-1][0].isoformat() if catalog else None,
            'historySlotsReady': ready_slots,
        },
        'services': {
            'captureTimerActive': capture_timer_active,
            'captureTimerState': capture_timer_state,
            'publishTimerActive': publish_timer_active,
            'publishTimerState': publish_timer_state,
        },
    }


def build_payload(config: dict[str, Any], capture: dict[str, Any], image: bytes, history: list[dict[str, Any]], health: dict[str, Any]) -> dict[str, Any]:
    storage = health.get('storage') or {}
    return {
        'publisherVersion': PUBLISHER_VERSION,
        'ok': health.get('status') != 'offline',
        'capturedAt': capture.get('captured_at') or capture.get('capturedAt'),
        'cameraLabel': safe_text(config.get('camera_label') or 'Sump camera', 80),
        'stream': safe_text(capture.get('stream') or 'stream2', 30),
        'resolution': safe_text(config.get('resolution') or '1280×720', 40),
        'captureIntervalMinutes': int(config.get('capture_interval_minutes') or 5),
        'sizeBytes': len(image),
        'durationSeconds': capture.get('duration_seconds') or capture.get('durationSeconds') or 0,
        'storage': {
            'label': safe_text(config.get('storage_label') or 'Local Pi drive', 80),
            'totalBytes': storage.get('totalBytes') or 0,
            'availableBytes': storage.get('availableBytes') or 0,
            'usedPercent': storage.get('usedPercent') or 0,
        },
        'message': safe_text(capture.get('error') or '', 240),
        'health': health,
        'imageContentType': 'image/jpeg',
        'imageBase64': base64.b64encode(image).decode('ascii'),
        'historyImages': history,
    }


def derive_status_endpoint(publish_endpoint: str) -> str:
    if publish_endpoint.endswith('/observer-publish'):
        return publish_endpoint[:-len('/observer-publish')] + '/observer-status'
    return publish_endpoint.rsplit('/', 1)[0] + '/observer-status'


def post_json(endpoint: str, token: str, payload: dict[str, Any], timeout: int = 55) -> dict[str, Any]:
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
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode('utf-8', errors='replace')
        result = json.loads(body) if body else {}
        if response.status != 200 or result.get('ok') is not True:
            raise RuntimeError(f'Publish returned HTTP {response.status}')
        return result


def main() -> int:
    started_at = utc_now()
    config: dict[str, Any] = {}
    capture: dict[str, Any] = {}
    try:
        config = read_json(CONFIG_PATH)
        endpoint = str(config.get('endpoint') or '').strip()
        token = str(config.get('token') or '').strip()
        if not endpoint.startswith('https://'):
            raise ValueError('Publisher endpoint must use HTTPS')
        if not token:
            raise ValueError('Publisher token is missing')

        try:
            capture = read_json(CAPTURE_STATUS_PATH)
        except Exception as error:
            capture = {'ok': False, 'error': f'Capture status unavailable: {error}'}
        catalog = capture_catalog()
        health = collect_health(config, capture, catalog)
        captured_raw = str(capture.get('captured_at') or capture.get('capturedAt') or '')
        captured_at = parse_iso(captured_raw)

        try:
            if not captured_at:
                raise ValueError('Capture status is missing a valid captured_at')
            image = read_jpeg(IMAGE_PATH)
            history = select_history(catalog, captured_at)
            payload = build_payload(config, capture, image, history, health)
            result = post_json(endpoint, token, payload)
            slots = result.get('historySlots') or []
            published_at = result.get('publishedAt') or utc_now()
            try_write_status({
                'ok': True,
                'capturedAt': captured_raw,
                'publishedAt': published_at,
                'sizeBytes': len(image),
                'historySlots': slots,
                'healthStatus': health.get('status'),
                'publisherVersion': PUBLISHER_VERSION,
            })
            print(f"PUBLISH_OK {captured_raw} {len(image)} bytes history={','.join(slots) or 'none'} health={health.get('status')}")
            return 0
        except (OSError, ValueError) as local_error:
            health = collect_health(config, capture, catalog)
            health['status'] = 'offline'
            health['summary'] = 'The publisher is reachable, but a local capture or storage problem prevents image upload.'
            health.setdefault('issues', []).append(health_issue('image_publish_unavailable', 'critical', str(local_error)))
            status_payload = {
                'publisherVersion': PUBLISHER_VERSION,
                'ok': False,
                'capturedAt': captured_raw or None,
                'cameraLabel': safe_text(config.get('camera_label') or 'Sump camera', 80),
                'stream': safe_text(capture.get('stream') or 'stream2', 30),
                'resolution': safe_text(config.get('resolution') or '1280×720', 40),
                'captureIntervalMinutes': int(config.get('capture_interval_minutes') or 5),
                'health': health,
                'message': safe_text(local_error, 240),
            }
            result = post_json(derive_status_endpoint(endpoint), token, status_payload, timeout=30)
            try_write_status({
                'ok': False,
                'reportedAt': result.get('receivedAt') or utc_now(),
                'capturedAt': captured_raw or None,
                'error': safe_text(local_error, 400),
                'healthStatus': 'offline',
                'publisherVersion': PUBLISHER_VERSION,
            })
            print(f'HEALTH_REPORTED image unavailable: {local_error}')
            return 1

    except urllib.error.HTTPError as error:
        body = error.read().decode('utf-8', errors='replace')[:400]
        message = f'HTTP {error.code}: {body or error.reason}'
    except urllib.error.URLError as error:
        message = f'Network error: {error.reason}'
    except Exception as error:
        message = str(error)

    try_write_status({
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
