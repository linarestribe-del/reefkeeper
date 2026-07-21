#!/usr/bin/env python3
"""Build and upload compact rolling weekly and monthly Aquarium Observer timelapses."""
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
CAPTURES_DIR = BASE_DIR / 'captures'
TIMELAPSE_DIR = BASE_DIR / 'timelapse'
STATUS_PATH = TIMELAPSE_DIR / 'status.json'
MAX_TIMELAPSE_BYTES = 2_800_000
TIMELAPSE_FPS = 12
BUILDER_VERSION = '1.0'
CAPTURE_NAME_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.jpg$', re.I)


def utc_now_dt() -> datetime:
    return datetime.now(timezone.utc)


def utc_now() -> str:
    return utc_now_dt().isoformat()


def safe_text(value: Any, limit: int = 180) -> str:
    return ' '.join(str(value or '').split())[:limit]


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


def archive_coverage_days(catalog: list[tuple[datetime, Path]]) -> float:
    if len(catalog) < 2:
        return 0.0
    return max(0.0, (catalog[-1][0] - catalog[0][0]).total_seconds() / 86400.0)


def select_interval_frames(
    catalog: list[tuple[datetime, Path]],
    start: datetime,
    end: datetime,
    step: timedelta,
    tolerance: timedelta,
) -> list[tuple[datetime, Path]]:
    candidates = [item for item in catalog if start - tolerance <= item[0] <= end + tolerance]
    if not candidates:
        return []
    selected: list[tuple[datetime, Path]] = []
    used: set[Path] = set()
    target = start
    while target <= end:
        nearest = min(candidates, key=lambda item: abs(item[0] - target))
        if abs(nearest[0] - target) <= tolerance and nearest[1] not in used:
            selected.append(nearest)
            used.add(nearest[1])
        target += step
    selected.sort(key=lambda item: item[0])
    return selected


def timelapse_frames(catalog: list[tuple[datetime, Path]], slot: str, end: datetime) -> list[tuple[datetime, Path]]:
    if slot == 'week':
        return select_interval_frames(catalog, end - timedelta(days=7), end, timedelta(hours=1), timedelta(minutes=40))
    if slot == 'month':
        return select_interval_frames(catalog, end - timedelta(days=30), end, timedelta(hours=6), timedelta(hours=2))
    raise ValueError('Unknown timelapse slot')


def generate_timelapse(slot: str, frames: list[tuple[datetime, Path]]) -> dict[str, Any]:
    if len(frames) < 12:
        raise ValueError(f'Not enough selected frames for the {slot} timelapse')
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('ffmpeg is not installed')
    TIMELAPSE_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TIMELAPSE_DIR / ('weekly-latest.mp4' if slot == 'week' else 'monthly-latest.mp4')
    attempts = [(640, 30), (640, 34), (540, 35), (480, 37), (426, 39)]
    with tempfile.TemporaryDirectory(prefix=f'.{slot}-frames-', dir=TIMELAPSE_DIR) as temp_name:
        temp_dir = Path(temp_name)
        for index, (_, source) in enumerate(frames):
            os.symlink(source, temp_dir / f'frame-{index:05d}.jpg')
        chosen: Path | None = None
        chosen_width = 0
        for width, crf in attempts:
            candidate = temp_dir / f'{slot}-{width}-{crf}.mp4'
            command = [
                ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                '-framerate', str(TIMELAPSE_FPS),
                '-start_number', '0',
                '-i', str(temp_dir / 'frame-%05d.jpg'),
                '-vf', f'scale={width}:-2:flags=lanczos,fps={TIMELAPSE_FPS},format=yuv420p',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf),
                '-movflags', '+faststart', '-an', str(candidate),
            ]
            result = subprocess.run(command, capture_output=True, text=True, timeout=600, check=False)
            if result.returncode != 0 or not candidate.is_file():
                raise RuntimeError(safe_text(result.stderr or 'ffmpeg failed', 360))
            if candidate.stat().st_size <= MAX_TIMELAPSE_BYTES:
                chosen = candidate
                chosen_width = width
                break
        if chosen is None:
            raise ValueError(f'{slot} timelapse is still larger than {MAX_TIMELAPSE_BYTES} bytes after compression')
        temporary_output = output_path.with_suffix('.partial.mp4')
        shutil.copyfile(chosen, temporary_output)
        os.replace(temporary_output, output_path)
    return {
        'slot': slot,
        'path': output_path,
        'generatedAt': utc_now(),
        'startCapturedAt': frames[0][0].isoformat(),
        'endCapturedAt': frames[-1][0].isoformat(),
        'frameCount': len(frames),
        'durationSeconds': round(len(frames) / TIMELAPSE_FPS, 2),
        'sizeBytes': output_path.stat().st_size,
        'fps': TIMELAPSE_FPS,
        'resolution': f'{chosen_width}×{round(chosen_width * 9 / 16)}',
        'coverageDays': round((frames[-1][0] - frames[0][0]).total_seconds() / 86400.0, 2),
    }


def derive_endpoint(publish_endpoint: str) -> str:
    separator = '&' if '?' in publish_endpoint else '?'
    return f'{publish_endpoint}{separator}resource=timelapse'


def post_json(endpoint: str, token: str, payload: dict[str, Any], timeout: int = 90) -> dict[str, Any]:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, separators=(',', ':')).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'User-Agent': f'ReefKeeperObserverTimelapse/{BUILDER_VERSION}',
        },
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode('utf-8', errors='replace')
        result = json.loads(body) if body else {}
        if response.status != 200 or result.get('ok') is not True:
            raise RuntimeError(f'Upload returned HTTP {response.status}')
        return result


def upload_timelapse(endpoint: str, token: str, record: dict[str, Any]) -> dict[str, Any]:
    video = Path(record['path']).read_bytes()
    if not video or len(video) > MAX_TIMELAPSE_BYTES:
        raise ValueError('Generated timelapse is empty or too large')
    payload = {key: value for key, value in record.items() if key != 'path'}
    payload['videoBase64'] = base64.b64encode(video).decode('ascii')
    return post_json(endpoint, token, payload)


def process_slot(slot: str, catalog: list[tuple[datetime, Path]], endpoint: str, token: str, old: dict[str, Any], today_key: str) -> dict[str, Any]:
    coverage = archive_coverage_days(catalog)
    required_coverage = 6.5 if slot == 'week' else 27.0
    minimum_frames = 72 if slot == 'week' else 96
    item: dict[str, Any] = {
        'state': 'waiting_for_history',
        'coverageDays': round(coverage, 2),
        'requiredDays': 7 if slot == 'week' else 30,
        'lastGeneratedAt': old.get('lastGeneratedAt'),
        'lastUploadedDate': old.get('lastUploadedDate'),
        'frameCount': old.get('frameCount') or 0,
        'sizeBytes': old.get('sizeBytes') or 0,
        'error': '',
    }
    if coverage < required_coverage:
        return item
    if old.get('lastUploadedDate') == today_key:
        item['state'] = 'current'
        return item
    frames = timelapse_frames(catalog, slot, catalog[-1][0])
    if len(frames) < minimum_frames:
        item['state'] = 'waiting_for_frames'
        item['frameCount'] = len(frames)
        return item
    generated = generate_timelapse(slot, frames)
    remote = upload_timelapse(endpoint, token, generated)
    item.update({
        'state': 'generated',
        'lastGeneratedAt': generated['generatedAt'],
        'lastUploadedDate': today_key,
        'frameCount': generated['frameCount'],
        'sizeBytes': generated['sizeBytes'],
        'startCapturedAt': generated['startCapturedAt'],
        'endCapturedAt': generated['endCapturedAt'],
        'remoteUpdatedAt': remote.get('updatedAt'),
    })
    return item


def main() -> int:
    started_at = utc_now()
    try:
        if not os.path.ismount(MOUNT_DIR):
            raise RuntimeError('Observer drive is not mounted at /mnt/reef-ssd')
        config = read_json(CONFIG_PATH)
        publish_endpoint = str(config.get('endpoint') or '').strip()
        token = str(config.get('token') or '').strip()
        if not publish_endpoint.startswith('https://'):
            raise ValueError('Publisher endpoint must use HTTPS')
        if not token:
            raise ValueError('Publisher token is missing')
        endpoint = derive_endpoint(publish_endpoint)
        catalog = capture_catalog()
        TIMELAPSE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            previous = read_json(STATUS_PATH)
        except Exception:
            previous = {}
        today_key = datetime.now().astimezone().date().isoformat()
        state: dict[str, Any] = {'builderVersion': BUILDER_VERSION, 'checkedAt': utc_now(), 'startedAt': started_at}
        failed = False
        for slot in ('week', 'month'):
            old = previous.get(slot) if isinstance(previous.get(slot), dict) else {}
            try:
                state[slot] = process_slot(slot, catalog, endpoint, token, old, today_key)
            except Exception as error:
                failed = True
                state[slot] = {
                    'state': 'retrying',
                    'coverageDays': round(archive_coverage_days(catalog), 2),
                    'requiredDays': 7 if slot == 'week' else 30,
                    'lastGeneratedAt': old.get('lastGeneratedAt'),
                    'lastUploadedDate': old.get('lastUploadedDate'),
                    'frameCount': old.get('frameCount') or 0,
                    'sizeBytes': old.get('sizeBytes') or 0,
                    'error': safe_text(error, 360),
                }
                print(f'TIMELAPSE_FAILED {slot}: {state[slot]["error"]}', file=sys.stderr)
        state['completedAt'] = utc_now()
        write_json_atomic(STATUS_PATH, state)
        summary = ','.join(f'{slot}:{state[slot]["state"]}' for slot in ('week', 'month'))
        print(f'TIMELAPSE_OK {summary} coverage={archive_coverage_days(catalog):.2f}d')
        return 1 if failed else 0
    except urllib.error.HTTPError as error:
        body = error.read().decode('utf-8', errors='replace')[:400]
        message = f'HTTP {error.code}: {body or error.reason}'
    except urllib.error.URLError as error:
        message = f'Network error: {error.reason}'
    except Exception as error:
        message = str(error)
    try:
        write_json_atomic(STATUS_PATH, {
            'builderVersion': BUILDER_VERSION,
            'ok': False,
            'startedAt': started_at,
            'failedAt': utc_now(),
            'error': safe_text(message, 400),
        })
    except Exception:
        pass
    print(f'TIMELAPSE_FAILED: {message}', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
