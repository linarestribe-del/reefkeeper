#!/usr/bin/env python3
"""Publish dual-camera Observer captures, local monitoring, health, history, and one daily summary."""
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
MONITOR_CONFIG_PATH = Path('/etc/reefkeeper-observer/monitoring.json')
RETURN_MONITOR_CONFIG_PATH = Path('/etc/reefkeeper-observer/return-monitoring.json')
MOUNT_DIR = Path('/mnt/reef-ssd')
BASE_DIR = MOUNT_DIR / 'aquarium-observer'
IMAGE_PATH = BASE_DIR / 'latest.jpg'
CAPTURES_DIR = BASE_DIR / 'captures'
CAPTURE_STATUS_PATH = BASE_DIR / 'status.json'
PUBLISH_STATUS_PATH = BASE_DIR / 'publish-status.json'
MONITOR_STATUS_PATH = BASE_DIR / 'monitor-status.json'
RETURN_BASE_DIR = BASE_DIR / 'return-chamber'
RETURN_IMAGE_PATH = RETURN_BASE_DIR / 'latest.jpg'
RETURN_CAPTURES_DIR = RETURN_BASE_DIR / 'captures'
RETURN_CAPTURE_STATUS_PATH = RETURN_BASE_DIR / 'status.json'
RETURN_MONITOR_STATUS_PATH = RETURN_BASE_DIR / 'monitor-status.json'
FILTER_ROLL_CONFIG_PATH = Path('/etc/reefkeeper-observer/filter-roller-monitoring.json')
FILTER_ROLL_STATUS_PATH = BASE_DIR / 'filter-roller-status.json'
FILTER_ROLL_ANALYSIS_WIDTH = 320
FILTER_ROLL_ANALYSIS_HEIGHT = 240
MAX_IMAGE_BYTES = 2 * 1024 * 1024
PUBLISHER_VERSION = '2.8.4'
MONITOR_WIDTH = 128
MONITOR_HEIGHT = 72
CAPTURE_TIMER = 'reefkeeper-camera-capture.timer'
RETURN_CAPTURE_TIMER = 'reefkeeper-return-capture.timer'
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


def capture_image_path(capture: dict[str, Any], fallback: Path) -> Path:
    """Prefer the immutable capture file recorded after a completed camera write.

    The rolling latest.jpg can be replaced while the publisher reads it. The dated
    capture path in status.json is stable and avoids transient partial-file reads.
    """
    for key in ('image', 'capture_image', 'captureImage'):
        raw = str(capture.get(key) or '').strip()
        if not raw:
            continue
        candidate = Path(raw)
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            continue
    for key in ('latest_image', 'latestImage'):
        raw = str(capture.get(key) or '').strip()
        if not raw:
            continue
        candidate = Path(raw)
        try:
            if candidate.is_file():
                return candidate
        except OSError:
            continue
    return fallback


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


def capture_catalog(captures_dir: Path = CAPTURES_DIR) -> list[tuple[datetime, Path]]:
    catalog: list[tuple[datetime, Path]] = []
    if not captures_dir.exists():
        return catalog
    try:
        paths = captures_dir.rglob('*.jpg')
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


def representative_for_local_day(catalog: list[tuple[datetime, Path]], target_local: datetime) -> tuple[datetime, Path] | None:
    candidates = [item for item in catalog if item[0].astimezone().date() == target_local.date()]
    if not candidates:
        return None
    return min(candidates, key=lambda item: abs(item[0] - target_local.astimezone(timezone.utc)))


def select_daily_images(config: dict[str, Any], catalog: list[tuple[datetime, Path]], now: datetime) -> list[dict[str, Any]]:
    local_now = now.astimezone()
    hour = max(0, min(23, int(config.get('daily_summary_hour_local') or 12)))
    delay_minutes = max(0, min(180, int(config.get('daily_summary_delay_minutes') or 20)))
    current_target = local_now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if local_now < current_target + timedelta(minutes=delay_minutes):
        return []
    previous_target = current_target - timedelta(days=1)
    selections = [
        ('dailyPrevious', representative_for_local_day(catalog, previous_target)),
        ('dailyCurrent', representative_for_local_day(catalog, current_target)),
    ]
    output: list[dict[str, Any]] = []
    for slot, selected in selections:
        if not selected:
            return []
        captured_at, path = selected
        try:
            image = read_jpeg(path)
        except (OSError, ValueError):
            return []
        output.append({
            'slot': slot,
            'capturedAt': captured_at.isoformat(),
            'imageBase64': base64.b64encode(image).decode('ascii'),
        })
    return output


def daily_summary_policy(config: dict[str, Any]) -> dict[str, int]:
    retry_minutes = max(30, min(1440, int(config.get('daily_summary_retry_minutes') or 180)))
    max_attempts = max(1, min(6, int(config.get('daily_summary_max_attempts') or 3)))
    return {
        'retryMinutes': retry_minutes,
        'maxAttempts': max_attempts,
    }


def daily_summary_attempt_decision(config: dict[str, Any], previous_status: dict[str, Any], current_captured_at: str, now: datetime) -> dict[str, Any]:
    policy = daily_summary_policy(config)
    completed_current = safe_text(previous_status.get('dailySummaryCurrentCapturedAt') or '', 80)
    attempted_current = safe_text(previous_status.get('dailySummaryAttemptCurrentCapturedAt') or '', 80)
    same_attempt_frame = attempted_current == current_captured_at
    attempts = max(0, int(previous_status.get('dailySummaryAttemptCount') or 0)) if same_attempt_frame else 0
    next_attempt_at = parse_iso(previous_status.get('dailySummaryNextAttemptAt')) if same_attempt_frame else None

    if completed_current == current_captured_at:
        return {'action': 'current', 'status': 'current', 'attemptCount': attempts, **policy}
    if attempts >= policy['maxAttempts']:
        return {'action': 'paused', 'status': 'paused_after_retries', 'attemptCount': attempts, **policy}
    if next_attempt_at and now < next_attempt_at:
        return {
            'action': 'wait',
            'status': 'retry_scheduled',
            'attemptCount': attempts,
            'nextAttemptAt': next_attempt_at.isoformat(),
            **policy,
        }
    return {'action': 'attempt', 'status': 'attempting', 'attemptCount': attempts, **policy}


def daily_summary_health(config: dict[str, Any], previous_status: dict[str, Any], daily_images: list[dict[str, Any]]) -> dict[str, Any]:
    policy = daily_summary_policy(config)
    state = safe_text(previous_status.get('dailySummaryStatus') or 'waiting_for_frames', 40)
    generated_at = parse_iso(previous_status.get('dailySummaryGeneratedAt'))
    next_attempt_at = parse_iso(previous_status.get('dailySummaryNextAttemptAt'))
    attempts = max(0, int(previous_status.get('dailySummaryAttemptCount') or 0))
    frames_ready = len(daily_images) == 2
    selected_current = next((item['capturedAt'] for item in daily_images if item.get('slot') == 'dailyCurrent'), '')
    completed_current = safe_text(previous_status.get('dailySummaryCurrentCapturedAt') or '', 80)
    attempted_current = safe_text(previous_status.get('dailySummaryAttemptCurrentCapturedAt') or '', 80)
    completed_for_selected = bool(selected_current and completed_current == selected_current)
    attempt_for_selected = bool(selected_current and attempted_current == selected_current)

    status = 'pending'
    message = 'Waiting for today and the prior-day representative frames.'
    if frames_ready and completed_for_selected and state in {'generated', 'reused', 'current'}:
        status = 'healthy'
        message = 'Today’s daily visual summary has been generated.'
    elif frames_ready and attempt_for_selected and state == 'paused_after_retries':
        status = 'attention'
        message = f'Daily visual summary paused after {attempts} failed attempts; it will reset with the next daily frame.'
    elif frames_ready and attempt_for_selected and state in {'retry_scheduled', 'retrying'}:
        status = 'attention'
        if next_attempt_at:
            message = f'Daily visual summary retry is scheduled for {next_attempt_at.astimezone().strftime("%b %-d at %-I:%M %p")}.'
        else:
            message = 'Daily visual summary will retry later without repeated five-minute AI calls.'
    elif frames_ready:
        message = 'Daily comparison frames are ready and awaiting the scheduled summary attempt.'

    return {
        'status': status,
        'message': message,
        'framesReady': frames_ready,
        'state': state,
        'generatedAt': generated_at.isoformat() if generated_at else None,
        'nextAttemptAt': next_attempt_at.isoformat() if next_attempt_at else None,
        'attemptCount': attempts,
        'maxAttempts': policy['maxAttempts'],
        'retryMinutes': policy['retryMinutes'],
    }


def derive_daily_summary_endpoint(publish_endpoint: str) -> str:
    if publish_endpoint.endswith('/observer-publish'):
        return publish_endpoint[:-len('/observer-publish')] + '/observer-daily-summary'
    return publish_endpoint.rsplit('/', 1)[0] + '/observer-daily-summary'


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


def monitor_config(primary: dict[str, Any], config_path: Path | None = None, source_key: str = 'local_monitoring') -> dict[str, Any]:
    config_path = config_path or MONITOR_CONFIG_PATH
    defaults: dict[str, Any] = {
        'enabled': True,
        'scene_change_threshold': 0.18,
        'anchor_change_threshold': 0.12,
        'scene_alert_streak': 3,
        'camera_movement_streak': 2,
        'maintenance_settle_streak': 4,
        'obstruction_alert_streak': 2,
        'baseline_learning_rate': 0.025,
        'maintenance_learning_rate': 0.16,
        'scene_anchor_zones': [
            {'x': 0.76, 'y': 0.0, 'width': 0.24, 'height': 1.0, 'weight': 1.0},
            {'x': 0.50, 'y': 0.68, 'width': 0.50, 'height': 0.32, 'weight': 0.65},
        ],
        'water_level': {
            'enabled': False,
            'roi': None,
            'baseline_y_percent': None,
            'warning_delta_percent': 5.0,
            'urgent_delta_percent': 10.0,
            'alert_streak': 2,
            'minimum_confidence': 0.45,
            'allow_offline': False,
            'max_line_jump_percent': 12.0,
        },
    }
    source = primary.get(source_key) if isinstance(primary.get(source_key), dict) else {}
    override: dict[str, Any] = {}
    try:
        override = read_json(config_path)
    except Exception:
        override = {}

    merged = {**defaults, **source, **override}
    water_source = source.get('water_level') if isinstance(source.get('water_level'), dict) else {}
    water_override = override.get('water_level') if isinstance(override.get('water_level'), dict) else {}
    merged['water_level'] = {**defaults['water_level'], **water_source, **water_override}
    zones = parse_monitor_zones(merged.get('scene_anchor_zones'))
    merged['scene_anchor_zones'] = zones or parse_monitor_zones(defaults['scene_anchor_zones'])
    return merged


def clamp_number(value: Any, minimum: float, maximum: float, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, number))


def compact_float(value: Any, digits: int = 2) -> float | None:
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def water_level_learning_summary(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    allowed_numbers = [
        'sampleCount', 'acceptedCount', 'rejectedCount', 'confidenceMedian', 'confidenceMinimum',
        'baselineYPercent', 'medianYPercent', 'normalBandPercent', 'p90AbsDeltaPercent',
        'p95AbsDeltaPercent', 'maxAbsDeltaPercent', 'maxFrameJumpPercent',
        'recommendedWarningPercent', 'recommendedUrgentPercent', 'recommendedMaxLineJumpPercent',
    ]
    summary: dict[str, Any] = {}
    for key in allowed_numbers:
        if key not in value:
            continue
        number = compact_float(value.get(key), 3 if 'confidence' in key.lower() else 2)
        if number is not None:
            summary[key] = number
    for key in ['learnedAt', 'camera', 'roi']:
        if key in value:
            summary[key] = value.get(key)
    if not summary:
        return None
    return summary


def decode_monitor_frame(path: Path, width: int = MONITOR_WIDTH, height: int = MONITOR_HEIGHT) -> list[int]:
    ffmpeg = shutil.which('ffmpeg') or '/usr/bin/ffmpeg'
    command = [
        ffmpeg,
        '-v', 'error',
        '-i', str(path),
        '-vf', f'scale={width}:{height}:flags=area,format=gray',
        '-frames:v', '1',
        '-f', 'rawvideo',
        '-pix_fmt', 'gray',
        'pipe:1',
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=15, check=False)
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError(f'Local image decoder failed: {safe_text(error, 180)}') from error
    expected = width * height
    if result.returncode != 0 or len(result.stdout) != expected:
        detail = result.stderr.decode('utf-8', errors='replace') if isinstance(result.stderr, bytes) else str(result.stderr or '')
        raise RuntimeError(f'Local image decoder returned no usable frame: {safe_text(detail, 180)}')
    return list(result.stdout)


def frame_metrics(pixels: list[int], width: int = MONITOR_WIDTH, height: int = MONITOR_HEIGHT) -> dict[str, float]:
    expected = width * height
    if len(pixels) != expected or expected <= 0:
        raise ValueError('Monitor frame dimensions do not match the pixel buffer')
    mean = sum(pixels) / expected
    variance = sum((value - mean) ** 2 for value in pixels) / expected
    horizontal = sum(abs(pixels[row * width + column] - pixels[row * width + column - 1]) for row in range(height) for column in range(1, width))
    vertical = sum(abs(pixels[row * width + column] - pixels[(row - 1) * width + column]) for row in range(1, height) for column in range(width))
    edge_count = height * (width - 1) + (height - 1) * width
    return {
        'meanBrightness': round(mean, 3),
        'contrast': round(variance ** 0.5, 3),
        'edgeEnergy': round((horizontal + vertical) / max(1, edge_count), 3),
        'darkFraction': round(sum(1 for value in pixels if value <= 15) / expected, 4),
        'brightFraction': round(sum(1 for value in pixels if value >= 240) / expected, 4),
    }


def visual_mode(metrics: dict[str, float]) -> str:
    mean = float(metrics.get('meanBrightness') or 0)
    if mean < 58:
        return 'dark'
    if mean > 188:
        return 'bright'
    return 'normal'


def normalized_signature(pixels: list[int], mean: float) -> list[int]:
    offset = 128.0 - mean
    return [max(0, min(255, int(round(value + offset)))) for value in pixels]


def parse_monitor_zones(value: Any) -> list[dict[str, float]]:
    if not isinstance(value, list):
        return []
    zones: list[dict[str, float]] = []
    for item in value[:8]:
        if isinstance(item, dict):
            raw = [item.get('x'), item.get('y'), item.get('width'), item.get('height')]
            weight_raw = item.get('weight', 1.0)
        elif isinstance(item, (list, tuple)) and len(item) >= 4:
            raw = list(item[:4])
            weight_raw = item[4] if len(item) >= 5 else 1.0
        else:
            continue
        roi = parse_roi(raw)
        if not roi:
            continue
        try:
            weight = float(weight_raw)
        except (TypeError, ValueError):
            weight = 1.0
        x, y, width, height = roi
        zones.append({
            'x': round(x, 6),
            'y': round(y, 6),
            'width': round(width, 6),
            'height': round(height, 6),
            'weight': round(max(0.1, min(3.0, weight)), 3),
        })
    return zones


def shifted_difference(
    current: list[int],
    reference: list[int],
    width: int,
    height: int,
    dx: int = 0,
    dy: int = 0,
    zones: list[dict[str, float]] | None = None,
) -> float:
    selected = zones or [{'x': 0.0, 'y': 0.0, 'width': 1.0, 'height': 1.0, 'weight': 1.0}]
    total = 0.0
    weighted_count = 0.0
    for zone in selected:
        x0 = max(0, min(width - 1, int(round(float(zone.get('x') or 0.0) * width))))
        y0 = max(0, min(height - 1, int(round(float(zone.get('y') or 0.0) * height))))
        x1 = max(x0 + 1, min(width, int(round((float(zone.get('x') or 0.0) + float(zone.get('width') or 0.0)) * width))))
        y1 = max(y0 + 1, min(height, int(round((float(zone.get('y') or 0.0) + float(zone.get('height') or 0.0)) * height))))
        weight = max(0.1, min(3.0, float(zone.get('weight') or 1.0)))
        for y in range(y0, y1):
            reference_y = y - dy
            if reference_y < 0 or reference_y >= height:
                continue
            current_row = y * width
            reference_row = reference_y * width
            for x in range(x0, x1):
                reference_x = x - dx
                if reference_x < 0 or reference_x >= width:
                    continue
                total += abs(current[current_row + x] - reference[reference_row + reference_x]) * weight
                weighted_count += weight
    if weighted_count <= 0:
        return 1.0
    return (total / weighted_count) / 255.0


def compare_to_baseline(
    current: list[int],
    reference: list[int],
    width: int = MONITOR_WIDTH,
    height: int = MONITOR_HEIGHT,
    zones: list[dict[str, float]] | None = None,
) -> dict[str, Any]:
    if len(current) != width * height or len(reference) != width * height:
        return {'available': False, 'changeScore': 0.0, 'unshiftedScore': 0.0, 'shiftX': 0, 'shiftY': 0, 'movementLikely': False}
    unshifted = shifted_difference(current, reference, width, height, zones=zones)
    best_score = unshifted
    best_dx = best_dy = 0
    for dy in range(-2, 3):
        for dx in range(-3, 4):
            if dx == 0 and dy == 0:
                continue
            score = shifted_difference(current, reference, width, height, dx, dy, zones=zones)
            if score < best_score:
                best_score = score
                best_dx, best_dy = dx, dy
    improvement = unshifted - best_score
    movement = (abs(best_dx) >= 2 or abs(best_dy) >= 2) and improvement >= 0.018 and best_score <= unshifted * 0.86
    return {
        'available': True,
        'changeScore': round(best_score, 4),
        'unshiftedScore': round(unshifted, 4),
        'shiftX': best_dx,
        'shiftY': best_dy,
        'movementLikely': movement,
    }


def blend_signature(reference: list[int], current: list[int], rate: float) -> list[int]:
    if len(reference) != len(current):
        return current[:]
    alpha = max(0.001, min(0.2, rate))
    return [int(round(old * (1.0 - alpha) + new * alpha)) for old, new in zip(reference, current)]


def parse_roi(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        x, y, width, height = (float(item) for item in value)
    except (TypeError, ValueError):
        return None
    if width <= 0 or height <= 0:
        return None
    x = max(0.0, min(0.99, x))
    y = max(0.0, min(0.99, y))
    width = min(width, 1.0 - x)
    height = min(height, 1.0 - y)
    if width < 0.08 or height < 0.08:
        return None
    return x, y, width, height


def detect_water_line(pixels: list[int], roi: tuple[float, float, float, float], width: int = MONITOR_WIDTH, height: int = MONITOR_HEIGHT) -> dict[str, Any]:
    x, y, roi_width, roi_height = roi
    left = max(1, int(round(x * width)))
    right = min(width - 1, int(round((x + roi_width) * width)))
    top = max(1, int(round(y * height)))
    bottom = min(height - 2, int(round((y + roi_height) * height)))
    if right - left < 8 or bottom - top < 5:
        return {'available': False, 'confidence': 0.0, 'message': 'Water-level region is too small.'}

    scores: list[tuple[int, float, float]] = []
    for row in range(top + 1, bottom):
        gradients = [abs(pixels[(row + 1) * width + column] - pixels[(row - 1) * width + column]) for column in range(left, right)]
        gradients.sort(reverse=True)
        keep = max(4, int(len(gradients) * 0.65))
        selected = gradients[:keep]
        mean_gradient = sum(selected) / max(1, len(selected))
        coverage = sum(1 for value in gradients if value >= 10) / max(1, len(gradients))
        scores.append((row, mean_gradient * (0.35 + 0.65 * coverage), coverage))
    if not scores:
        return {'available': False, 'confidence': 0.0, 'message': 'No water-level edge could be evaluated.'}
    scores.sort(key=lambda item: item[1], reverse=True)
    best_row, best_score, coverage = scores[0]
    median_score = sorted(item[1] for item in scores)[len(scores) // 2]
    prominence = best_score / max(1.0, median_score)
    absolute_strength = min(1.0, best_score / 35.0)
    confidence = max(0.0, min(1.0, (prominence - 1.0) / 2.5 * 0.55 + absolute_strength * 0.45))
    y_percent = ((best_row - top) / max(1, bottom - top)) * 100.0
    return {
        'available': True,
        'confidence': round(confidence, 3),
        'yPercent': round(y_percent, 2),
        'edgeScore': round(best_score, 3),
        'coverage': round(coverage, 3),
        'message': 'Water-surface edge detected.' if confidence >= 0.45 else 'Possible water-surface edge detected with low confidence.',
    }



def filter_roll_default() -> dict[str, Any]:
    return {
        'enabled': True,
        'configured': False,
        'available': False,
        'cameraId': 'overview',
        'state': 'pending',
        'status': 'pending',
        'message': 'Filter-roller visual measurement is waiting for a configured region of interest.',
        'analysisMessage': '',
        'rejectionReason': '',
        'note': 'Low-frequency overview-camera measurement.',
        'measurementId': '',
        'sourceImageId': '',
        'measuredAt': None,
        'confidence': 0.0,
        'remainingPct': None,
        'apparentOuterRadius': None,
        'apparentCoreRadius': None,
        'apparentThicknessPct': None,
        'roi': None,
        'lastAccepted': None,
        'lastAttempt': None,
        'attemptHistory': [],
        'schedule': {
            'hoursLocal': [9, 15],
            'measurementsPerDay': 2,
            'minSpacingMinutes': 240,
        },
    }


def filter_roll_config(primary: dict[str, Any], config_path: Path | None = None, source_key: str = 'filter_roll_monitoring') -> dict[str, Any]:
    config_path = config_path or FILTER_ROLL_CONFIG_PATH
    defaults: dict[str, Any] = {
        'enabled': True,
        'roi': None,
        'probe_y': 0.5,
        'measurement_hours_local': [9, 15],
        'min_spacing_minutes': 240,
        'minimum_confidence': 0.65,
        'consensus_frames': 3,
        'minimum_consensus_frames': 2,
        'consensus_max_age_minutes': 20,
        'maximum_radius_deviation_px': 4.5,
        'maximum_radius_drop_fraction_per_day': 0.08,
        'minimum_large_change_fraction': 0.06,
        'large_change_confirmations': 2,
    }
    source = primary.get(source_key) if isinstance(primary.get(source_key), dict) else {}
    override: dict[str, Any] = {}
    try:
        override = read_json(config_path)
    except Exception:
        override = {}
    merged = {**defaults, **source, **override}
    hours_raw = merged.get('measurement_hours_local')
    if not isinstance(hours_raw, list):
        hours_raw = defaults['measurement_hours_local']
    hours: list[int] = []
    for value in hours_raw[:6]:
        try:
            hour = int(value)
        except (TypeError, ValueError):
            continue
        hours.append(max(0, min(23, hour)))
    merged['measurement_hours_local'] = sorted(set(hours or defaults['measurement_hours_local']))
    merged['probe_y'] = clamp_number(merged.get('probe_y'), 0.1, 0.9, 0.5)
    merged['min_spacing_minutes'] = int(clamp_number(merged.get('min_spacing_minutes'), 30, 1440, 240))
    merged['minimum_confidence'] = clamp_number(merged.get('minimum_confidence'), 0.35, 0.95, 0.65)
    merged['consensus_frames'] = int(clamp_number(merged.get('consensus_frames'), 1, 5, 3))
    merged['minimum_consensus_frames'] = int(clamp_number(merged.get('minimum_consensus_frames'), 1, merged['consensus_frames'], 2))
    merged['consensus_max_age_minutes'] = int(clamp_number(merged.get('consensus_max_age_minutes'), 5, 60, 20))
    merged['maximum_radius_deviation_px'] = clamp_number(merged.get('maximum_radius_deviation_px'), 1.0, 20.0, 4.5)
    merged['maximum_radius_drop_fraction_per_day'] = clamp_number(merged.get('maximum_radius_drop_fraction_per_day'), 0.02, 0.5, 0.08)
    merged['minimum_large_change_fraction'] = clamp_number(merged.get('minimum_large_change_fraction'), 0.02, 0.25, 0.06)
    merged['large_change_confirmations'] = int(clamp_number(merged.get('large_change_confirmations'), 2, 4, 2))
    return merged


def decode_monitor_region(path: Path, roi: tuple[float, float, float, float], width: int = FILTER_ROLL_ANALYSIS_WIDTH, height: int = FILTER_ROLL_ANALYSIS_HEIGHT) -> list[int]:
    x, y, roi_width, roi_height = roi
    ffmpeg = shutil.which('ffmpeg') or '/usr/bin/ffmpeg'
    crop = f"crop=iw*{roi_width:.6f}:ih*{roi_height:.6f}:iw*{x:.6f}:ih*{y:.6f},scale={width}:{height}:flags=lanczos,format=gray"
    command = [
        ffmpeg,
        '-v', 'error',
        '-i', str(path),
        '-vf', crop,
        '-frames:v', '1',
        '-f', 'rawvideo',
        '-pix_fmt', 'gray',
        'pipe:1',
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=15, check=False)
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError(f'Filter-roll decoder failed: {safe_text(error, 180)}') from error
    expected = width * height
    if result.returncode != 0 or len(result.stdout) != expected:
        detail = result.stderr.decode('utf-8', errors='replace') if isinstance(result.stderr, bytes) else str(result.stderr or '')
        raise RuntimeError(f'Filter-roll decoder returned no usable frame: {safe_text(detail, 180)}')
    return list(result.stdout)


def smooth_series(values: list[float], radius: int = 2) -> list[float]:
    if radius <= 0 or len(values) < 3:
        return values[:]
    output: list[float] = []
    for index in range(len(values)):
        left = max(0, index - radius)
        right = min(len(values), index + radius + 1)
        output.append(sum(values[left:right]) / max(1, right - left))
    return output


def find_peak_index(values: list[float], start: int, end: int) -> int | None:
    start = max(0, start)
    end = min(len(values), end)
    if end - start < 3:
        return None
    best_index = start
    best_value = values[start]
    for index in range(start + 1, end):
        if values[index] > best_value:
            best_index = index
            best_value = values[index]
    return best_index


def median_number(values: list[float]) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[middle])
    return (float(ordered[middle - 1]) + float(ordered[middle])) / 2.0


def analyze_filter_roll_frame(image_path: Path, roi: tuple[float, float, float, float], probe_y: float = 0.5) -> dict[str, Any]:
    """Measure only the roll's outer silhouette in one fixed-view frame."""
    pixels = decode_monitor_region(image_path, roi)
    width = FILTER_ROLL_ANALYSIS_WIDTH
    height = FILTER_ROLL_ANALYSIS_HEIGHT
    center_row = max(8, min(height - 9, int(round(probe_y * (height - 1)))))
    offsets = [-8, -6, -4, -2, 0, 2, 4, 6, 8]
    samples: list[dict[str, float]] = []

    for offset in offsets:
        row = max(3, min(height - 4, center_row + offset))
        scanline: list[float] = []
        for column in range(width):
            values = [pixels[(row + vertical) * width + column] for vertical in (-2, -1, 0, 1, 2)]
            scanline.append(sum(values) / len(values))
        smoothed = smooth_series(scanline, 3)
        gradients = [abs(smoothed[index + 1] - smoothed[index]) for index in range(width - 1)]
        if not gradients:
            continue
        left = find_peak_index(gradients, int(width * 0.03), int(width * 0.46))
        right = find_peak_index(gradients, int(width * 0.54), int(width * 0.97))
        if left is None or right is None:
            continue
        span = right - left
        if span < int(width * 0.28) or span > int(width * 0.96):
            continue
        baseline = median_number(gradients)
        left_strength = gradients[left]
        right_strength = gradients[right]
        prominence = ((left_strength + right_strength) / 2.0) / max(1.0, baseline)
        samples.append({
            'row': float(row),
            'left': float(left),
            'right': float(right),
            'span': float(span),
            'center': (left + right) / 2.0,
            'edgeStrength': (left_strength + right_strength) / 2.0,
            'prominence': prominence,
        })

    if len(samples) < 4:
        return {
            'available': False,
            'confidence': 0.0,
            'sampleCount': len(samples),
            'message': 'The outer filter-roll silhouette was not consistent across enough scan lines.',
        }

    spans = [item['span'] for item in samples]
    centers = [item['center'] for item in samples]
    strengths = [item['edgeStrength'] for item in samples]
    prominences = [item['prominence'] for item in samples]
    median_span = median_number(spans)
    median_center = median_number(centers)
    median_strength = median_number(strengths)
    median_prominence = median_number(prominences)
    span_deviation = median_number([abs(value - median_span) for value in spans])
    center_deviation = median_number([abs(value - median_center) for value in centers])
    consistency = max(0.0, min(1.0, 1.0 - (span_deviation / max(1.0, median_span) * 7.0) - (center_deviation / max(1.0, median_span) * 5.0)))
    prominence_score = max(0.0, min(1.0, (median_prominence - 1.0) / 5.0))
    strength_score = max(0.0, min(1.0, median_strength / 24.0))
    sample_score = max(0.0, min(1.0, len(samples) / len(offsets)))
    confidence = max(0.0, min(1.0, consistency * 0.48 + prominence_score * 0.20 + strength_score * 0.18 + sample_score * 0.14))
    left = median_center - median_span / 2.0
    right = median_center + median_span / 2.0
    return {
        'available': True,
        'confidence': round(confidence, 3),
        'rowCenterPx': center_row,
        'sampleCount': len(samples),
        'outerLeftPx': round(left, 3),
        'outerRightPx': round(right, 3),
        'outerCenterPx': round(median_center, 3),
        'apparentOuterRadius': round(median_span / 2.0, 3),
        'apparentCoreRadius': None,
        'apparentThicknessPct': None,
        'spanDeviationPx': round(span_deviation, 3),
        'centerDeviationPx': round(center_deviation, 3),
        'message': 'Filter-roll outer silhouette detected from multiple nearby scan lines.',
    }


def recent_filter_roll_images(image_path: Path, captured_at: datetime, settings: dict[str, Any]) -> list[tuple[datetime, Path]]:
    frame_limit = int(settings.get('consensus_frames') or 3)
    maximum_age = timedelta(minutes=int(settings.get('consensus_max_age_minutes') or 20))
    candidates: list[tuple[datetime, Path]] = []
    seen: set[Path] = set()

    def add(path: Path, timestamp: datetime | None = None) -> None:
        try:
            resolved = path.resolve()
        except OSError:
            resolved = path
        if resolved in seen or not path.is_file():
            return
        time_value = timestamp or parse_capture_datetime(path) or captured_at
        if time_value > captured_at + timedelta(minutes=2) or captured_at - time_value > maximum_age:
            return
        seen.add(resolved)
        candidates.append((time_value, path))

    add(image_path, captured_at)
    try:
        if image_path.parent.exists():
            for sibling in image_path.parent.glob('*.jpg'):
                add(sibling)
    except OSError:
        pass
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[:frame_limit]


def analyze_filter_roll_consensus(
    image_path: Path,
    captured_at: datetime,
    roi: tuple[float, float, float, float],
    probe_y: float,
    settings: dict[str, Any],
) -> dict[str, Any]:
    frames = recent_filter_roll_images(image_path, captured_at, settings)
    results: list[dict[str, Any]] = []
    failures: list[str] = []
    for frame_at, frame_path in frames:
        try:
            analysis = analyze_filter_roll_frame(frame_path, roi, probe_y)
        except Exception as error:
            failures.append(safe_text(error, 120))
            continue
        if analysis.get('available') is True and analysis.get('apparentOuterRadius') is not None:
            results.append({**analysis, 'frameCapturedAt': frame_at.isoformat(), 'frameName': frame_path.name})
        else:
            failures.append(safe_text(analysis.get('message') or 'No outer silhouette.', 120))

    minimum_frames = int(settings.get('minimum_consensus_frames') or 2)
    if len(results) < minimum_frames:
        return {
            'available': False,
            'confidence': 0.0,
            'frameCount': len(frames),
            'successfulFrameCount': len(results),
            'rejectionReason': f'Only {len(results)} of {len(frames)} recent frames produced a usable roll edge; {minimum_frames} agreeing frames are required.',
            'message': 'Recent frames did not provide enough agreeing filter-roll measurements.',
            'frameFailures': failures[:3],
        }

    radii = [float(item['apparentOuterRadius']) for item in results]
    confidences = [float(item.get('confidence') or 0.0) for item in results]
    median_radius = median_number(radii)
    radius_deviation = median_number([abs(value - median_radius) for value in radii])
    maximum_deviation = float(settings.get('maximum_radius_deviation_px') or 4.5)
    if radius_deviation > maximum_deviation:
        return {
            'available': False,
            'confidence': round(median_number(confidences), 3),
            'frameCount': len(frames),
            'successfulFrameCount': len(results),
            'apparentOuterRadius': round(median_radius, 3),
            'radiusDeviationPx': round(radius_deviation, 3),
            'rejectionReason': f'Recent roll-edge readings disagreed by {radius_deviation:.1f} px; maximum allowed deviation is {maximum_deviation:.1f} px.',
            'message': 'Recent filter-roll frames did not agree closely enough.',
        }

    consistency = max(0.0, min(1.0, 1.0 - radius_deviation / max(1.0, maximum_deviation)))
    confidence = max(0.0, min(1.0, median_number(confidences) * (0.72 + 0.28 * consistency)))
    representative = min(results, key=lambda item: abs(float(item['apparentOuterRadius']) - median_radius))
    return {
        **representative,
        'available': True,
        'confidence': round(confidence, 3),
        'apparentOuterRadius': round(median_radius, 3),
        'frameCount': len(frames),
        'successfulFrameCount': len(results),
        'radiusDeviationPx': round(radius_deviation, 3),
        'message': f'Filter-roll radius agreed across {len(results)} recent frames.',
    }


def filter_roll_accepted_record(state: dict[str, Any]) -> dict[str, Any] | None:
    accepted = state.get('lastAccepted') if isinstance(state.get('lastAccepted'), dict) else None
    if accepted:
        return dict(accepted)
    if state.get('available') is True and state.get('measuredAt'):
        return {key: state.get(key) for key in [
            'measurementId', 'sourceImageId', 'measuredAt', 'confidence', 'remainingPct',
            'apparentOuterRadius', 'apparentCoreRadius', 'apparentThicknessPct', 'analysisMessage',
            'note', 'state', 'status', 'available', 'referenceOnly', 'frameCount', 'successfulFrameCount',
        ]}
    return None


def filter_roll_candidate_match(candidate: dict[str, Any] | None, radius: float) -> bool:
    if not candidate or candidate.get('apparentOuterRadius') is None:
        return False
    prior = float(candidate.get('apparentOuterRadius') or 0.0)
    return prior > 0 and abs(radius - prior) / prior <= 0.06


def evaluate_filter_roll(
    config: dict[str, Any],
    capture: dict[str, Any],
    image_path: Path | None = None,
    now: datetime | None = None,
    config_path: Path | None = None,
    state_path: Path | None = None,
) -> dict[str, Any]:
    image_path = image_path or IMAGE_PATH
    now = now or utc_now_dt()
    state_path = state_path or FILTER_ROLL_STATUS_PATH
    settings = filter_roll_config(config, config_path)
    result = filter_roll_default()
    result['enabled'] = settings.get('enabled') is not False
    result['schedule'] = {
        'hoursLocal': settings.get('measurement_hours_local') or [9, 15],
        'measurementsPerDay': len(settings.get('measurement_hours_local') or [9, 15]),
        'minSpacingMinutes': int(settings.get('min_spacing_minutes') or 240),
    }
    roi = parse_roi(settings.get('roi'))
    result['configured'] = bool(result['enabled'] and roi)
    result['roi'] = [round(value, 4) for value in roi] if roi else None
    if result['enabled'] is False:
        result.update({'status': 'healthy', 'state': 'disabled', 'message': 'Filter-roll visual measurement is disabled in the private Pi configuration.'})
        return result

    try:
        state = read_json(state_path)
    except Exception:
        state = {}
    accepted = filter_roll_accepted_record(state)
    last_attempt = state.get('lastAttempt') if isinstance(state.get('lastAttempt'), dict) else None
    attempt_history = state.get('attemptHistory') if isinstance(state.get('attemptHistory'), list) else []
    if accepted:
        for key, value in accepted.items():
            if value is not None:
                result[key] = value
        result['available'] = True
        result['lastAccepted'] = accepted
    result['lastAttempt'] = last_attempt
    result['attemptHistory'] = attempt_history[-12:]
    if not result['configured']:
        result['message'] = 'Filter-roller region of interest is not configured yet on the Pi.'
        return result

    captured_raw = str(capture.get('captured_at') or capture.get('capturedAt') or now.isoformat())
    captured_at = parse_iso(captured_raw) or now
    source_image_id = captured_at.isoformat()
    last_attempt_at = parse_iso(last_attempt.get('attemptedAt')) if last_attempt else None
    local_now = now.astimezone()
    allowed_hours = settings.get('measurement_hours_local') or [9, 15]
    in_window = local_now.hour in allowed_hours
    spacing_ok = last_attempt_at is None or (now - last_attempt_at) >= timedelta(minutes=int(settings.get('min_spacing_minutes') or 240))
    last_attempt_source = str(last_attempt.get('sourceImageId') or '') if last_attempt else ''
    needs_measurement = in_window and spacing_ok and source_image_id != last_attempt_source
    if not needs_measurement:
        result['state'] = 'idle' if accepted else 'scheduled'
        result['status'] = 'healthy' if accepted else 'pending'
        result['message'] = 'Waiting for the next scheduled filter-roll measurement window.'
        return result

    analysis = analyze_filter_roll_consensus(image_path, captured_at, roi, float(settings.get('probe_y') or 0.5), settings)
    confidence = round(float(analysis.get('confidence') or 0.0), 3)
    radius = analysis.get('apparentOuterRadius')
    rejection_reasons: list[str] = []
    initial_rejection_reason = safe_text(analysis.get('rejectionReason') or '', 300)
    if initial_rejection_reason:
        rejection_reasons.append(initial_rejection_reason)
    minimum_confidence = float(settings.get('minimum_confidence') or 0.65)
    accepted_measurement = analysis.get('available') is True and confidence >= minimum_confidence and radius is not None
    low_confidence = analysis.get('available') is True and confidence < minimum_confidence
    if low_confidence:
        rejection_reasons.append(f'Detector confidence {confidence:.0%} was below the {minimum_confidence:.0%} acceptance threshold.')
        accepted_measurement = False

    pending_candidate = state.get('pendingCandidate') if isinstance(state.get('pendingCandidate'), dict) else None
    if radius is not None and accepted and accepted.get('apparentOuterRadius') is not None:
        prior_radius = float(accepted.get('apparentOuterRadius') or 0.0)
        elapsed_days = max(1 / 24, (captured_at - (parse_iso(accepted.get('measuredAt')) or captured_at)).total_seconds() / 86400)
        drop_fraction = max(0.0, (prior_radius - float(radius)) / max(1.0, prior_radius))
        allowed_drop = min(0.20, max(float(settings.get('minimum_large_change_fraction') or 0.06), float(settings.get('maximum_radius_drop_fraction_per_day') or 0.08) * elapsed_days))
        if drop_fraction > allowed_drop:
            if accepted_measurement:
                confirmations = int(pending_candidate.get('confirmations') or 0) + 1 if filter_roll_candidate_match(pending_candidate, float(radius)) else 1
                pending_candidate = {
                    'apparentOuterRadius': round(float(radius), 3),
                    'firstSeenAt': pending_candidate.get('firstSeenAt') if confirmations > 1 else captured_at.isoformat(),
                    'lastSeenAt': captured_at.isoformat(),
                    'confirmations': confirmations,
                    'reason': f'Radius fell {drop_fraction:.0%}; allowed change for this interval is {allowed_drop:.0%}.',
                }
                if confirmations < int(settings.get('large_change_confirmations') or 2):
                    rejection_reasons.append(f'Large radius decrease ({drop_fraction:.0%}) requires confirmation in a later scheduled window.')
                    accepted_measurement = False
                else:
                    pending_candidate = None
            else:
                rejection_reasons.append(f'Large radius decrease ({drop_fraction:.0%}) would require confirmation before replacing the last accepted reading.')
        else:
            pending_candidate = None
    rejection_reason = '; '.join(dict.fromkeys(reason for reason in rejection_reasons if reason))

    attempt = {
        'measurementId': f'filter-roll-attempt-{captured_at.isoformat()}',
        'sourceImageId': source_image_id,
        'attemptedAt': captured_at.isoformat(),
        'measuredAt': captured_at.isoformat(),
        'cameraId': 'overview',
        'accepted': accepted_measurement,
        'available': accepted_measurement,
        'state': 'measured' if accepted_measurement else 'rejected',
        'status': 'healthy' if accepted_measurement else 'pending',
        'confidence': confidence,
        'apparentOuterRadius': radius,
        'apparentCoreRadius': analysis.get('apparentCoreRadius'),
        'apparentThicknessPct': analysis.get('apparentThicknessPct'),
        'remainingPct': None,
        'frameCount': int(analysis.get('frameCount') or 0),
        'successfulFrameCount': int(analysis.get('successfulFrameCount') or 0),
        'radiusDeviationPx': analysis.get('radiusDeviationPx'),
        'analysisMessage': safe_text(analysis.get('message') or '', 240),
        'rejectionReason': '' if accepted_measurement else (rejection_reason or 'The scheduled filter-roll attempt did not pass validation.'),
        'message': safe_text(analysis.get('message') or '', 240),
        'note': 'Consensus measurement from recent fixed-view overview-camera frames.',
    }
    history = [item for item in attempt_history if isinstance(item, dict) and item.get('sourceImageId') != source_image_id]
    history.append(attempt)
    history = history[-12:]
    if accepted_measurement:
        accepted = {
            **attempt,
            'measurementId': f'filter-roll-{captured_at.isoformat()}',
            'accepted': True,
            'available': True,
            'state': 'measured',
            'status': 'healthy',
            'rejectionReason': '',
        }

    state_out = {
        'schemaVersion': 2,
        'updatedAt': now.isoformat(),
        'lastAccepted': accepted,
        'lastAttempt': attempt,
        'attemptHistory': history,
        'pendingCandidate': pending_candidate,
    }
    write_json_atomic(state_path, state_out)

    result = filter_roll_default()
    result['configured'] = True
    result['enabled'] = True
    result['roi'] = [round(value, 4) for value in roi]
    result['schedule'] = {
        'hoursLocal': allowed_hours,
        'measurementsPerDay': len(allowed_hours),
        'minSpacingMinutes': int(settings.get('min_spacing_minutes') or 240),
    }
    result['lastAttempt'] = attempt
    result['attemptHistory'] = history
    result['lastAccepted'] = accepted
    if accepted:
        for key, value in accepted.items():
            if value is not None:
                result[key] = value
        result['available'] = True
        result['status'] = 'healthy'
        result['state'] = 'measured' if accepted_measurement else 'idle'
        result['message'] = accepted.get('analysisMessage') or accepted.get('message') or 'Accepted filter-roll measurement is available.'
    else:
        result['status'] = 'pending'
        result['state'] = 'rejected'
        result['message'] = attempt['rejectionReason']
    return result


def local_monitor_default() -> dict[str, Any]:
    return {
        'status': 'pending',
        'message': 'Local visual monitoring has not evaluated a frame yet.',
        'enabled': True,
        'evaluatedAt': None,
        'mode': 'unknown',
        'imageQuality': {'status': 'pending', 'message': 'Waiting for image-quality analysis.'},
        'scene': {'status': 'pending', 'message': 'Learning fixed camera anchors.', 'baselineReady': False, 'changeScore': 0.0, 'anchorChangeScore': 0.0, 'fullChangeScore': 0.0, 'shiftX': 0, 'shiftY': 0, 'movementLikely': False, 'maintenanceVariation': False, 'learningState': 'initial', 'streak': 0},
        'waterLevel': {'status': 'pending', 'message': 'Water-level monitoring is not calibrated.', 'configured': False, 'confidence': 0.0, 'streak': 0},
    }


def evaluate_local_monitor(
    config: dict[str, Any],
    image_path: Path | None = None,
    now: datetime | None = None,
    config_path: Path | None = None,
    state_path: Path | None = None,
    source_key: str = 'local_monitoring',
    capture_key: str | None = None,
) -> dict[str, Any]:
    image_path = image_path or IMAGE_PATH
    config_path = config_path or MONITOR_CONFIG_PATH
    state_path = state_path or MONITOR_STATUS_PATH
    settings = monitor_config(config, config_path, source_key)
    if settings.get('enabled') is False:
        disabled = local_monitor_default()
        disabled.update({'status': 'healthy', 'enabled': False, 'message': 'Local visual monitoring is disabled in the private Pi configuration.'})
        return disabled
    now = now or utc_now_dt()
    try:
        state = read_json(state_path)
    except Exception:
        state = {}
    resolved_capture_key = safe_text(capture_key, 300) or now.isoformat()
    previous_capture_key = safe_text(state.get('lastCaptureKey'), 300)
    is_new_capture = resolved_capture_key != previous_capture_key
    result = local_monitor_default()
    result['evaluatedAt'] = now.isoformat()
    try:
        pixels = decode_monitor_frame(image_path)
        metrics = frame_metrics(pixels)
    except Exception as error:
        message = safe_text(error, 240)
        result.update({'status': 'attention', 'message': message, 'issues': [health_issue('local_monitor_unavailable', 'warning', message)]})
        result['imageQuality'] = {'status': 'attention', 'message': message}
        return result

    mode = visual_mode(metrics)
    signature = normalized_signature(pixels, metrics['meanBrightness'])
    baselines = state.get('baselines') if isinstance(state.get('baselines'), dict) else {}
    baseline = baselines.get(mode) if isinstance(baselines.get(mode), dict) else None
    reference = baseline.get('signature') if baseline and isinstance(baseline.get('signature'), list) else None
    anchor_zones = parse_monitor_zones(settings.get('scene_anchor_zones'))
    full_comparison = compare_to_baseline(signature, reference) if reference else {'available': False, 'changeScore': 0.0, 'unshiftedScore': 0.0, 'shiftX': 0, 'shiftY': 0, 'movementLikely': False}
    anchor_comparison = compare_to_baseline(signature, reference, zones=anchor_zones) if reference else {'available': False, 'changeScore': 0.0, 'unshiftedScore': 0.0, 'shiftX': 0, 'shiftY': 0, 'movementLikely': False}
    baseline_metrics = baseline.get('metrics') if baseline and isinstance(baseline.get('metrics'), dict) else {}

    absolute_blank = (metrics['contrast'] < 4.0 and metrics['edgeEnergy'] < 2.0) or metrics['darkFraction'] > 0.985 or metrics['brightFraction'] > 0.985
    relative_flat = bool(baseline_metrics) and metrics['contrast'] < max(4.0, float(baseline_metrics.get('contrast') or 0) * 0.34) and metrics['edgeEnergy'] < max(2.0, float(baseline_metrics.get('edgeEnergy') or 0) * 0.34)
    obstruction_candidate = absolute_blank or relative_flat
    previous_obstruction_streak = int(state.get('obstructionStreak') or 0)
    obstruction_streak = previous_obstruction_streak + 1 if is_new_capture and obstruction_candidate else (0 if is_new_capture else previous_obstruction_streak)
    obstruction_limit = int(clamp_number(settings.get('obstruction_alert_streak'), 1, 6, 2))
    quality_status = 'attention' if obstruction_streak >= obstruction_limit else ('pending' if obstruction_candidate else 'healthy')
    if quality_status == 'attention':
        quality_message = 'The camera view appears blocked, blank, or severely degraded across repeated captures.'
    elif obstruction_candidate:
        quality_message = 'The latest frame may be blocked or degraded; waiting for confirmation from the next capture.'
    else:
        quality_message = f'Image texture and exposure are usable in {mode} mode.'

    dynamic_threshold = clamp_number(settings.get('scene_change_threshold'), 0.08, 0.5, 0.18)
    anchor_threshold = clamp_number(settings.get('anchor_change_threshold'), 0.05, 0.4, 0.12)
    dynamic_candidate = full_comparison.get('available') and full_comparison['changeScore'] >= dynamic_threshold
    anchor_candidate = anchor_comparison.get('available') and anchor_comparison['changeScore'] >= anchor_threshold
    movement_candidate = anchor_comparison.get('movementLikely') is True
    expected_maintenance_variation = bool(dynamic_candidate and not anchor_candidate and not movement_candidate and not obstruction_candidate)

    prior_anchor_streak = int(state.get('anchorChangeStreak') or state.get('sceneStreak') or 0)
    prior_movement_streak = int(state.get('movementStreak') or 0)
    prior_maintenance_streak = int(state.get('maintenanceVariationStreak') or 0)
    if is_new_capture:
        anchor_streak = prior_anchor_streak + 1 if anchor_candidate else 0
        movement_streak = prior_movement_streak + 1 if movement_candidate else 0
        maintenance_streak = prior_maintenance_streak + 1 if expected_maintenance_variation else 0
    else:
        anchor_streak = prior_anchor_streak
        movement_streak = prior_movement_streak
        maintenance_streak = prior_maintenance_streak

    anchor_limit = int(clamp_number(settings.get('scene_alert_streak'), 2, 8, 3))
    movement_limit = int(clamp_number(settings.get('camera_movement_streak'), 1, 5, 2))
    settle_limit = int(clamp_number(settings.get('maintenance_settle_streak'), 2, 12, 4))
    maintenance_variation = expected_maintenance_variation or maintenance_streak > 0
    learning_state = 'stable'
    if not anchor_comparison.get('available'):
        scene_status = 'pending'
        scene_message = f'Learning fixed camera anchors for {mode} lighting.'
        learning_state = 'initial'
    elif movement_streak >= movement_limit:
        scene_status = 'attention'
        scene_message = f"Camera framing appears shifted ({anchor_comparison['shiftX']}, {anchor_comparison['shiftY']} low-resolution pixels in fixed anchor zones)."
        learning_state = 'camera-moved'
    elif anchor_streak >= anchor_limit:
        scene_status = 'attention'
        scene_message = f"A persistent change is present in fixed camera-anchor areas (score {anchor_comparison['changeScore']:.2f})."
        learning_state = 'anchor-changed'
    elif expected_maintenance_variation and maintenance_streak < settle_limit:
        scene_status = 'pending'
        scene_message = f'Expected equipment variation is settling; fixed camera anchors remain stable ({maintenance_streak}/{settle_limit}).'
        learning_state = 'maintenance-settling'
    elif expected_maintenance_variation:
        scene_status = 'healthy'
        scene_message = 'Movable sump equipment differs from the earlier view, while fixed camera anchors remain stable. The normal view is adapting automatically.'
        learning_state = 'maintenance-adapting'
    elif anchor_candidate:
        scene_status = 'pending'
        scene_message = f"A possible fixed-anchor change is being confirmed (score {anchor_comparison['changeScore']:.2f})."
        learning_state = 'confirming-anchor'
    else:
        scene_status = 'healthy'
        scene_message = f'Fixed camera anchors are stable in {mode} lighting.'

    water_settings = settings.get('water_level') if isinstance(settings.get('water_level'), dict) else {}
    water_enabled = water_settings.get('enabled') is True
    roi = parse_roi(water_settings.get('roi')) if water_enabled else None
    baseline_y = water_settings.get('baseline_y_percent')
    try:
        baseline_y_value = float(baseline_y) if baseline_y is not None else None
    except (TypeError, ValueError):
        baseline_y_value = None
    water_streak = 0
    water_result: dict[str, Any] = {
        'enabled': bool(water_enabled),
        'status': 'healthy' if not water_enabled else 'pending',
        'message': 'Water-level tracking is disabled; return camera health uses image quality and scene stability.' if not water_enabled else 'Water-level monitoring is not calibrated.',
        'configured': bool(water_enabled and roi and baseline_y_value is not None),
        'confidence': 0.0,
        'streak': 0,
    }
    if water_enabled and roi:
        detected = detect_water_line(pixels, roi)
        minimum_confidence = clamp_number(water_settings.get('minimum_confidence'), 0.2, 0.9, 0.45)
        learned_normal = water_level_learning_summary(water_settings.get('learned_normal'))
        water_result.update({
            'enabled': True,
            'confidence': detected.get('confidence', 0.0),
            'currentYPercent': detected.get('yPercent'),
            'edgeScore': detected.get('edgeScore'),
            'roi': [round(value, 4) for value in roi],
            'minimumConfidence': round(minimum_confidence, 2),
        })
        if learned_normal:
            water_result['learnedNormal'] = learned_normal
        if baseline_y_value is None:
            water_result['message'] = 'Water-level region is configured but needs a baseline calibration.'
        elif not detected.get('available') or float(detected.get('confidence') or 0) < minimum_confidence:
            water_result['status'] = 'pending'
            water_result['state'] = 'tracking_paused'
            water_result['message'] = 'Water-level tracking paused because the configured water line is not clear enough in this frame.'
            water_result['baselineYPercent'] = round(baseline_y_value, 2)
        else:
            current_y = float(detected['yPercent'])
            delta = baseline_y_value - current_y
            warning_delta = clamp_number(water_settings.get('warning_delta_percent'), 1.0, 30.0, 5.0)
            urgent_delta = max(warning_delta + 1.0, clamp_number(water_settings.get('urgent_delta_percent'), 2.0, 45.0, 10.0))
            max_line_jump = clamp_number(water_settings.get('max_line_jump_percent'), 4.0, 45.0, 12.0)
            water_result.update({
                'warningDeltaPercent': round(warning_delta, 2),
                'urgentDeltaPercent': round(urgent_delta, 2),
                'maxLineJumpPercent': round(max_line_jump, 2),
            })
            allow_offline = water_settings.get('allow_offline') is True
            previous = state.get('lastWaterLevel') if isinstance(state.get('lastWaterLevel'), dict) else {}
            previous_y_value = previous.get('currentYPercent')
            try:
                previous_y = float(previous_y_value) if previous_y_value is not None else None
            except (TypeError, ValueError):
                previous_y = None
            line_jump = abs(current_y - previous_y) if previous_y is not None else 0.0
            line_jump_candidate = previous_y is not None and line_jump >= max_line_jump
            candidate = abs(delta) >= warning_delta
            previous_water_streak = int(state.get('waterLevelStreak') or 0)
            water_limit = int(clamp_number(water_settings.get('alert_streak'), 1, 6, 2))
            if line_jump_candidate and is_new_capture:
                water_streak = 0
                water_result.update({
                    'configured': True,
                    'baselineYPercent': round(baseline_y_value, 2),
                    'currentYPercent': round(current_y, 2),
                    'deltaPercent': round(delta, 2),
                    'direction': 'higher' if delta > 0 else ('lower' if delta < 0 else 'stable'),
                    'streak': water_streak,
                    'state': 'tracking_paused',
                    'lineJumpPercent': round(line_jump, 2),
                    'previousYPercent': round(previous_y, 2),
                })
                water_result['status'] = 'pending'
                water_result['message'] = f'Water-level tracking paused because the detector jumped {line_jump:.1f}% between possible waterline edges.'
            else:
                water_streak = previous_water_streak + 1 if is_new_capture and candidate else (0 if is_new_capture else previous_water_streak)
                water_result.update({
                    'configured': True,
                    'baselineYPercent': round(baseline_y_value, 2),
                    'currentYPercent': round(current_y, 2),
                    'deltaPercent': round(delta, 2),
                    'direction': 'higher' if delta > 0 else ('lower' if delta < 0 else 'stable'),
                    'streak': water_streak,
                    'lineJumpPercent': round(line_jump, 2) if previous_y is not None else 0.0,
                })
                if water_streak >= water_limit and abs(delta) >= urgent_delta:
                    water_result['status'] = 'offline' if allow_offline else 'attention'
                    water_result['state'] = 'urgent_confirmed'
                    water_result['message'] = f"Water level appears {abs(delta):.1f}% of the monitored region {'higher' if delta > 0 else 'lower'} than baseline. Check the return chamber and ATO."
                elif water_streak >= water_limit:
                    water_result['status'] = 'attention'
                    water_result['state'] = 'warning_confirmed'
                    water_result['message'] = f"Water level appears {abs(delta):.1f}% of the monitored region {'higher' if delta > 0 else 'lower'} than baseline."
                elif candidate:
                    water_result['status'] = 'pending'
                    water_result['state'] = 'confirming'
                    water_result['message'] = 'A possible water-level shift is being confirmed with the next capture.'
                else:
                    water_result['status'] = 'healthy'
                    water_result['state'] = 'stable'
                    water_result['message'] = f'Water level is within {warning_delta:.1f}% of its calibrated baseline.'

    issues: list[dict[str, str]] = []
    if quality_status == 'attention':
        issues.append(health_issue('camera_view_obstructed', 'warning', quality_message))
    if movement_streak >= movement_limit:
        issues.append(health_issue('camera_view_shifted', 'warning', scene_message))
    elif anchor_streak >= anchor_limit:
        issues.append(health_issue('camera_anchor_changed', 'warning', scene_message))
    if water_result['status'] == 'offline':
        issues.append(health_issue('water_level_urgent', 'critical', water_result['message']))
    elif water_result['status'] == 'attention':
        issues.append(health_issue('water_level_watch', 'warning', water_result['message']))

    if baseline is None:
        baselines[mode] = {'signature': signature, 'metrics': metrics, 'learnedAt': now.isoformat(), 'samples': 1, 'anchorZones': anchor_zones}
    elif is_new_capture and not obstruction_candidate and not movement_candidate and not anchor_candidate:
        normal_learning = full_comparison.get('available') and full_comparison['changeScore'] < min(dynamic_threshold * 0.55, 0.09)
        maintenance_learning = expected_maintenance_variation and maintenance_streak >= settle_limit
        if normal_learning or maintenance_learning:
            rate_key = 'maintenance_learning_rate' if maintenance_learning else 'baseline_learning_rate'
            fallback_rate = 0.16 if maintenance_learning else 0.025
            learning_rate = clamp_number(settings.get(rate_key), 0.002, 0.3, fallback_rate)
            baselines[mode] = {
                **baseline,
                'signature': blend_signature(reference, signature, learning_rate),
                'metrics': {key: round(float(baseline_metrics.get(key, value)) * (1.0 - learning_rate) + float(value) * learning_rate, 4) for key, value in metrics.items()},
                'updatedAt': now.isoformat(),
                'samples': int(baseline.get('samples') or 1) + 1,
                'anchorZones': anchor_zones,
                'lastLearningMode': 'maintenance' if maintenance_learning else 'normal',
            }

    new_state = {
        'schemaVersion': 2,
        'updatedAt': now.isoformat(),
        'baselines': baselines,
        'obstructionStreak': obstruction_streak,
        'anchorChangeStreak': anchor_streak,
        'sceneStreak': anchor_streak,
        'movementStreak': movement_streak,
        'maintenanceVariationStreak': maintenance_streak,
        'waterLevelStreak': water_streak,
        'lastCaptureKey': resolved_capture_key,
        'lastCaptureWasNew': is_new_capture,
        'lastMode': mode,
        'lastMetrics': metrics,
        'lastComparison': anchor_comparison,
        'lastFullComparison': full_comparison,
        'lastWaterLevel': water_result,
    }
    try:
        write_json_atomic(state_path, new_state)
    except Exception as error:
        issues.append(health_issue('local_monitor_state_error', 'warning', f'Local monitoring state could not be saved: {safe_text(error, 160)}'))

    component_statuses = [quality_status, scene_status, water_result['status'] if water_result.get('configured') else 'healthy']
    overall = 'offline' if 'offline' in component_statuses else ('attention' if 'attention' in component_statuses else ('pending' if 'pending' in component_statuses else 'healthy'))
    message = {
        'healthy': 'Image quality and fixed camera anchors are stable; expected equipment movement is tolerated.',
        'attention': 'Local monitoring found a camera-anchor, obstruction, or configured water-level condition that should be checked.',
        'offline': 'Local monitoring found a critical camera or image-quality condition.',
        'pending': 'Local monitoring is learning anchors or allowing expected maintenance changes to settle.',
    }[overall]
    result.update({
        'status': overall,
        'message': message,
        'enabled': True,
        'evaluatedAt': now.isoformat(),
        'mode': mode,
        'issues': issues,
        'imageQuality': {
            'status': quality_status,
            'message': quality_message,
            **metrics,
            'obstructionStreak': obstruction_streak,
        },
        'scene': {
            'status': scene_status,
            'message': scene_message,
            'baselineReady': anchor_comparison.get('available') is True,
            'changeScore': anchor_comparison.get('changeScore', 0.0),
            'anchorChangeScore': anchor_comparison.get('changeScore', 0.0),
            'fullChangeScore': full_comparison.get('changeScore', 0.0),
            'unshiftedScore': anchor_comparison.get('unshiftedScore', 0.0),
            'shiftX': anchor_comparison.get('shiftX', 0),
            'shiftY': anchor_comparison.get('shiftY', 0),
            'movementLikely': movement_candidate,
            'maintenanceVariation': maintenance_variation,
            'learningState': learning_state,
            'anchorZones': anchor_zones,
            'streak': max(anchor_streak, movement_streak, maintenance_streak),
        },
        'waterLevel': water_result,
    })
    return result


def health_issue(code: str, severity: str, message: str) -> dict[str, str]:
    return {'code': code, 'severity': severity, 'message': safe_text(message, 240)}


def collect_health(
    config: dict[str, Any],
    capture: dict[str, Any],
    catalog: list[tuple[datetime, Path]],
    previous_status: dict[str, Any] | None = None,
    daily_images: list[dict[str, Any]] | None = None,
    local_monitor: dict[str, Any] | None = None,
    image_path: Path = IMAGE_PATH,
    capture_timer: str = CAPTURE_TIMER,
    include_daily: bool = True,
    camera_name: str = 'Observer',
) -> dict[str, Any]:
    now = utc_now_dt()
    previous_status = previous_status or {}
    daily_images = daily_images if daily_images is not None else (select_daily_images(config, catalog, now) if include_daily else [])
    local_monitor = local_monitor if local_monitor is not None else local_monitor_default()
    interval = max(1, int(config.get('capture_interval_minutes') or 5))
    capture_timer_active, capture_timer_state = unit_state(capture_timer)
    publish_timer_active, publish_timer_state = unit_state(PUBLISH_TIMER)
    storage = storage_probe()
    power = power_probe()
    captured_at = parse_iso(capture.get('captured_at') or capture.get('capturedAt'))
    capture_age = max(0, int((now - captured_at).total_seconds())) if captured_at else None
    capture_ok = capture.get('ok') is True
    latest_exists = image_path.is_file()
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

    daily_summary = daily_summary_health(config, previous_status, daily_images) if include_daily else {
        'status': 'healthy',
        'message': 'Daily visual summaries use the overview camera.',
        'framesReady': False,
        'state': 'not_applicable',
        'generatedAt': None,
        'nextAttemptAt': None,
        'attemptCount': 0,
        'maxAttempts': 3,
        'retryMinutes': 180,
    }
    if daily_summary['status'] == 'attention':
        issue_code = 'daily_summary_paused' if daily_summary['state'] == 'paused_after_retries' else 'daily_summary_retry'
        issues.append(health_issue(issue_code, 'warning', daily_summary['message']))

    monitor_issues = local_monitor.get('issues') if isinstance(local_monitor.get('issues'), list) else []
    for item in monitor_issues:
        if isinstance(item, dict):
            issues.append(health_issue(str(item.get('code') or 'local_monitor_issue'), str(item.get('severity') or 'info'), str(item.get('message') or 'Local monitoring reported an issue.')))

    critical = any(item['severity'] == 'critical' for item in issues)
    warning = any(item['severity'] == 'warning' for item in issues)
    overall = 'offline' if critical else ('attention' if warning else 'healthy')
    summary = {
        'healthy': f'{camera_name} capture, publishing, storage, power, and local visual checks are healthy.',
        'attention': f'{camera_name} is running, but one or more checks need attention.',
        'offline': f'A critical {camera_name.lower()} component is unavailable.',
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
        'dailySummary': daily_summary,
        'localMonitoring': local_monitor,
        'archive': {
            'status': archive_status,
            'message': archive_message,
            'captureCount': len(catalog),
            'oldestCaptureAt': catalog[0][0].isoformat() if catalog else None,
            'newestCaptureAt': catalog[-1][0].isoformat() if catalog else None,
            'historySlotsReady': ready_slots,
            'dailySummaryFramesReady': len(daily_images) == 2,
        },
        'services': {
            'captureTimerActive': capture_timer_active,
            'captureTimerState': capture_timer_state,
            'publishTimerActive': publish_timer_active,
            'publishTimerState': publish_timer_state,
        },
    }


def build_payload(config: dict[str, Any], capture: dict[str, Any], image: bytes, history: list[dict[str, Any]], health: dict[str, Any], filter_roll: dict[str, Any] | None = None) -> dict[str, Any]:
    storage = health.get('storage') or {}
    return {
        'cameraId': 'overview',
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
        'filterRoll': filter_roll or filter_roll_default(),
        'imageContentType': 'image/jpeg',
        'imageBase64': base64.b64encode(image).decode('ascii'),
        'historyImages': history,
    }


def build_camera_payload(
    camera_id: str,
    config: dict[str, Any],
    capture: dict[str, Any],
    image: bytes,
    health: dict[str, Any],
    label: str,
) -> dict[str, Any]:
    storage = health.get('storage') or {}
    return {
        'cameraId': camera_id,
        'publisherVersion': PUBLISHER_VERSION,
        'ok': health.get('status') != 'offline',
        'capturedAt': capture.get('captured_at') or capture.get('capturedAt'),
        'cameraLabel': label,
        'stream': safe_text(capture.get('stream') or 'stream1', 30),
        'resolution': safe_text(config.get('return_resolution') or '2560×1440', 40),
        'captureIntervalMinutes': int(config.get('return_capture_interval_minutes') or 5),
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
    }


def endpoint_with_camera(endpoint: str, camera_id: str) -> str:
    separator = '&' if '?' in endpoint else '?'
    return f'{endpoint}{separator}camera={camera_id}'


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


def post_daily_summary_json(endpoint: str, token: str, payload: dict[str, Any], timeout: int = 55) -> dict[str, Any]:
    """Post the daily summary frame pair.

    Cloudflare Worker/R2 is intentionally storage-only for daily summaries during
    the Vercel cost-reduction phase. Older Worker responses may acknowledge the
    request with HTTP 200 but omit the exact {ok: true} contract expected by the
    main image publisher. Treat that storage-only acknowledgement as a successful
    reused summary so the Pi does not keep scheduling false retries.
    """
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
        raw_body = response.read().decode('utf-8', errors='replace')
        try:
            result = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            result = {}
        if response.status != 200:
            detail = safe_text(result.get('error') if isinstance(result, dict) else raw_body, 160)
            raise RuntimeError(f'Daily summary returned HTTP {response.status}' + (f': {detail}' if detail else ''))
        if isinstance(result, dict) and result.get('ok') is True:
            return result
        if endpoint.rstrip('/').endswith('/observer-daily-summary'):
            state = safe_text(result.get('state') if isinstance(result, dict) else '', 80)
            message = safe_text(result.get('message') if isinstance(result, dict) else raw_body, 180)
            if state in {'worker_storage_only', 'storage_only', 'paused', 'disabled'} or message:
                output = dict(result) if isinstance(result, dict) else {}
                output.update({
                    'ok': True,
                    'reused': True,
                    'state': state or 'worker_storage_only',
                    'generatedAt': safe_text(output.get('generatedAt') or utc_now(), 80),
                    'message': message or 'Daily summary acknowledged by storage-only Observer backend.',
                })
                return output
        raise RuntimeError('Daily summary publish returned an unexpected HTTP 200 response.')


def publish_return_camera(
    config: dict[str, Any],
    endpoint: str,
    token: str,
    previous_publish_status: dict[str, Any],
) -> dict[str, Any]:
    try:
        capture = read_json(RETURN_CAPTURE_STATUS_PATH)
    except Exception as error:
        capture = {'ok': False, 'error': f'Return camera status unavailable: {error}'}
    catalog = capture_catalog(RETURN_CAPTURES_DIR)
    captured_raw = str(capture.get('captured_at') or capture.get('capturedAt') or '')
    captured_at = parse_iso(captured_raw)
    return_image_path = capture_image_path(capture, RETURN_IMAGE_PATH)
    local_monitor = evaluate_local_monitor(
        config,
        image_path=return_image_path,
        config_path=RETURN_MONITOR_CONFIG_PATH,
        state_path=RETURN_MONITOR_STATUS_PATH,
        source_key='return_local_monitoring',
        capture_key=captured_raw or str(return_image_path),
    )
    health = collect_health(
        config,
        capture,
        catalog,
        previous_publish_status,
        [],
        local_monitor,
        image_path=RETURN_IMAGE_PATH,
        capture_timer=RETURN_CAPTURE_TIMER,
        include_daily=False,
        camera_name='Return chamber',
    )
    try:
        if not captured_at:
            raise ValueError('Return camera status is missing a valid captured_at')
        image = read_jpeg(return_image_path)
        payload = build_camera_payload('return', config, capture, image, health, 'Return chamber')
        result = post_json(endpoint_with_camera(endpoint, 'return'), token, payload, timeout=55)
        return {
            'ok': True,
            'capturedAt': captured_raw,
            'publishedAt': result.get('publishedAt') or utc_now(),
            'sizeBytes': len(image),
            'healthStatus': health.get('status'),
            'localMonitorStatus': local_monitor.get('status'),
            'error': '',
        }
    except (OSError, ValueError) as local_error:
        health['status'] = 'offline'
        health['summary'] = 'The return-camera publisher is reachable, but its local capture is unavailable.'
        health.setdefault('issues', []).append(health_issue('return_image_publish_unavailable', 'critical', str(local_error)))
        payload = {
            'cameraId': 'return',
            'publisherVersion': PUBLISHER_VERSION,
            'ok': False,
            'capturedAt': captured_raw or None,
            'cameraLabel': 'Return chamber',
            'stream': safe_text(capture.get('stream') or 'stream1', 30),
            'resolution': safe_text(config.get('return_resolution') or '2560×1440', 40),
            'captureIntervalMinutes': int(config.get('return_capture_interval_minutes') or 5),
            'health': health,
            'message': safe_text(local_error, 240),
        }
        try:
            result = post_json(endpoint_with_camera(derive_status_endpoint(endpoint), 'return'), token, payload, timeout=30)
            published_at = result.get('receivedAt') or utc_now()
        except Exception as report_error:
            published_at = utc_now()
            return {
                'ok': False,
                'capturedAt': captured_raw or None,
                'publishedAt': published_at,
                'sizeBytes': 0,
                'healthStatus': 'offline',
                'localMonitorStatus': local_monitor.get('status'),
                'error': safe_text(f'{local_error}; status report failed: {report_error}', 400),
            }
        return {
            'ok': False,
            'capturedAt': captured_raw or None,
            'publishedAt': published_at,
            'sizeBytes': 0,
            'healthStatus': 'offline',
            'localMonitorStatus': local_monitor.get('status'),
            'error': safe_text(local_error, 400),
        }


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
        captured_raw = str(capture.get('captured_at') or capture.get('capturedAt') or '')
        captured_at = parse_iso(captured_raw)
        overview_image_path = capture_image_path(capture, IMAGE_PATH)
        previous_publish_status: dict[str, Any] = {}
        try:
            previous_publish_status = read_json(PUBLISH_STATUS_PATH)
        except Exception:
            previous_publish_status = {}
        now = utc_now_dt()
        daily_images = select_daily_images(config, catalog, now)
        local_monitor = evaluate_local_monitor(
            config,
            image_path=overview_image_path,
            capture_key=captured_raw or str(overview_image_path),
        )
        filter_roll = evaluate_filter_roll(config, capture, image_path=overview_image_path, now=now)
        health = collect_health(config, capture, catalog, previous_publish_status, daily_images, local_monitor)

        try:
            if not captured_at:
                raise ValueError('Capture status is missing a valid captured_at')
            image = read_jpeg(overview_image_path)
            history = select_history(catalog, captured_at)
            payload = build_payload(config, capture, image, history, health, filter_roll)
            result = post_json(endpoint, token, payload)
            return_camera = publish_return_camera(config, endpoint, token, previous_publish_status)
            slots = result.get('historySlots') or []
            published_at = result.get('publishedAt') or utc_now()
            daily_status = safe_text(previous_publish_status.get('dailySummaryStatus') or 'waiting', 40)
            daily_current = safe_text(previous_publish_status.get('dailySummaryCurrentCapturedAt') or '', 80)
            daily_generated = safe_text(previous_publish_status.get('dailySummaryGeneratedAt') or '', 80)
            daily_error = safe_text(previous_publish_status.get('dailySummaryError') or '', 300)
            daily_attempted_at = safe_text(previous_publish_status.get('dailySummaryAttemptedAt') or '', 80)
            daily_attempt_current = safe_text(previous_publish_status.get('dailySummaryAttemptCurrentCapturedAt') or '', 80)
            daily_attempt_count = max(0, int(previous_publish_status.get('dailySummaryAttemptCount') or 0))
            daily_next_attempt = safe_text(previous_publish_status.get('dailySummaryNextAttemptAt') or '', 80)
            daily_previous_for_decision = dict(previous_publish_status)
            if daily_error == 'Publish returned HTTP 200':
                daily_error = ''
                daily_next_attempt = ''
                daily_attempt_count = 0
                daily_previous_for_decision['dailySummaryError'] = ''
                daily_previous_for_decision['dailySummaryNextAttemptAt'] = ''
                daily_previous_for_decision['dailySummaryAttemptCount'] = 0
            if len(daily_images) == 2:
                current_daily = next(item for item in daily_images if item['slot'] == 'dailyCurrent')
                decision = daily_summary_attempt_decision(config, daily_previous_for_decision, current_daily['capturedAt'], now)
                if decision['action'] == 'attempt':
                    if daily_attempt_current != current_daily['capturedAt']:
                        daily_error = ''
                    daily_attempt_current = current_daily['capturedAt']
                    daily_attempt_count = decision['attemptCount'] + 1
                    daily_attempted_at = utc_now()
                    daily_next_attempt = ''
                    try:
                        daily_result = post_daily_summary_json(derive_daily_summary_endpoint(endpoint), token, {'dailyImages': daily_images}, timeout=55)
                        daily_status = 'reused' if daily_result.get('reused') else 'generated'
                        daily_error = ''
                        daily_current = current_daily['capturedAt']
                        daily_generated = safe_text(daily_result.get('generatedAt') or utc_now(), 80)
                    except Exception as daily_exception:
                        daily_error = safe_text(daily_exception, 300)
                        if daily_attempt_count >= decision['maxAttempts']:
                            daily_status = 'paused_after_retries'
                            print(f'DAILY_SUMMARY_PAUSED: {daily_error}', file=sys.stderr)
                        else:
                            delay = decision['retryMinutes'] * min(daily_attempt_count, 4)
                            daily_next_attempt = (utc_now_dt() + timedelta(minutes=delay)).isoformat()
                            daily_status = 'retry_scheduled'
                            print(f'DAILY_SUMMARY_RETRY_SCHEDULED: {daily_error}', file=sys.stderr)
                else:
                    daily_status = decision['status']
                    daily_attempt_count = decision['attemptCount']
                    daily_attempt_current = current_daily['capturedAt']
                    daily_next_attempt = safe_text(decision.get('nextAttemptAt') or daily_next_attempt, 80)
            else:
                daily_status = 'waiting_for_frames'
            try_write_status({
                'ok': True,
                'capturedAt': captured_raw,
                'publishedAt': published_at,
                'sizeBytes': len(image),
                'historySlots': slots,
                'healthStatus': health.get('status'),
                'localMonitorStatus': local_monitor.get('status'),
                'dailySummaryStatus': daily_status,
                'dailySummaryCurrentCapturedAt': daily_current or None,
                'dailySummaryGeneratedAt': daily_generated or None,
                'dailySummaryError': daily_error,
                'filterRollStatus': filter_roll.get('status'),
                'filterRollMeasuredAt': filter_roll.get('measuredAt'),
                'filterRollConfidence': filter_roll.get('confidence'),
                'filterRollAvailable': filter_roll.get('available'),
                'dailySummaryAttemptedAt': daily_attempted_at or None,
                'dailySummaryAttemptCurrentCapturedAt': daily_attempt_current or None,
                'dailySummaryAttemptCount': daily_attempt_count,
                'dailySummaryNextAttemptAt': daily_next_attempt or None,
                'returnCameraOk': return_camera.get('ok'),
                'returnCameraCapturedAt': return_camera.get('capturedAt'),
                'returnCameraPublishedAt': return_camera.get('publishedAt'),
                'returnCameraSizeBytes': return_camera.get('sizeBytes'),
                'returnCameraHealthStatus': return_camera.get('healthStatus'),
                'returnCameraLocalMonitorStatus': return_camera.get('localMonitorStatus'),
                'returnCameraError': return_camera.get('error') or '',
                'publisherVersion': PUBLISHER_VERSION,
            })
            print(f"PUBLISH_OK {captured_raw} {len(image)} bytes history={','.join(slots) or 'none'} health={health.get('status')} monitor={local_monitor.get('status')} filter_roll={filter_roll.get('status')} return={return_camera.get('healthStatus')} return_monitor={return_camera.get('localMonitorStatus')} daily={daily_status}")
            return 0
        except (OSError, ValueError) as local_error:
            health = collect_health(config, capture, catalog, previous_publish_status, daily_images, local_monitor)
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
