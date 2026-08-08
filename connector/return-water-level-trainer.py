#!/usr/bin/env python3
"""Learn normal return-chamber water-level variation from archived Observer still images."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TRAINER_VERSION = '1.0.0'
MONITOR_WIDTH = 128
MONITOR_HEIGHT = 72
MOUNT_DIR = Path('/mnt/reef-ssd')
BASE_DIR = MOUNT_DIR / 'aquarium-observer'
RETURN_BASE_DIR = BASE_DIR / 'return-chamber'
RETURN_CAPTURES_DIR = RETURN_BASE_DIR / 'captures'
RETURN_LATEST = RETURN_BASE_DIR / 'latest.jpg'
RETURN_MONITOR_CONFIG_PATH = Path('/etc/reefkeeper-observer/return-monitoring.json')
RETURN_LEARNING_REPORT_PATH = RETURN_BASE_DIR / 'water-level-learning-report.json'
CAPTURE_NAME_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.jpe?g$', re.I)


def utc_now_dt() -> datetime:
    return datetime.now(timezone.utc)


def read_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError(f'{path} must contain a JSON object')
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


def clamp_number(value: Any, minimum: float, maximum: float, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, number))


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


def parse_capture_datetime(path: Path) -> datetime | None:
    match = CAPTURE_NAME_RE.match(path.name)
    if match:
        parts = [int(value) for value in match.groups()]
        try:
            local = datetime(*parts).astimezone()
            return local.astimezone(timezone.utc)
        except ValueError:
            return None
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        return None


def capture_catalog(captures_dir: Path) -> list[tuple[datetime, Path]]:
    catalog: list[tuple[datetime, Path]] = []
    if captures_dir.exists():
        try:
            for path in captures_dir.rglob('*.jpg'):
                captured = parse_capture_datetime(path)
                if captured:
                    catalog.append((captured, path))
        except OSError:
            pass
        try:
            for path in captures_dir.rglob('*.jpeg'):
                captured = parse_capture_datetime(path)
                if captured:
                    catalog.append((captured, path))
        except OSError:
            pass
    if RETURN_LATEST.exists():
        captured = parse_capture_datetime(RETURN_LATEST) or utc_now_dt()
        catalog.append((captured, RETURN_LATEST))
    unique: dict[str, tuple[datetime, Path]] = {}
    for captured, path in catalog:
        unique[str(path)] = (captured, path)
    result = list(unique.values())
    result.sort(key=lambda item: item[0])
    return result


def select_samples(
    catalog: list[tuple[datetime, Path]],
    days: float,
    max_images: int,
    min_spacing_minutes: float,
) -> list[tuple[datetime, Path]]:
    now = utc_now_dt()
    cutoff = now - timedelta(days=max(0.05, days))
    recent = [(captured, path) for captured, path in catalog if captured >= cutoff]
    if not recent:
        recent = catalog[-max_images:]
    selected: list[tuple[datetime, Path]] = []
    last_selected: datetime | None = None
    spacing = timedelta(minutes=max(0.0, min_spacing_minutes))
    for captured, path in recent:
        if last_selected is not None and captured - last_selected < spacing:
            continue
        selected.append((captured, path))
        last_selected = captured
    if len(selected) > max_images:
        step = len(selected) / max_images
        thinned: list[tuple[datetime, Path]] = []
        index = 0.0
        while int(round(index)) < len(selected) and len(thinned) < max_images:
            thinned.append(selected[min(len(selected) - 1, int(round(index)))])
            index += step
        selected = thinned
    return selected


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
    result = subprocess.run(command, capture_output=True, timeout=15, check=False)
    expected = width * height
    if result.returncode != 0 or len(result.stdout) != expected:
        detail = result.stderr.decode('utf-8', errors='replace') if isinstance(result.stderr, bytes) else str(result.stderr or '')
        raise RuntimeError('image decoder failed: ' + ' '.join(detail.split())[:180])
    return list(result.stdout)


def detect_water_line(
    pixels: list[int],
    roi: tuple[float, float, float, float],
    width: int = MONITOR_WIDTH,
    height: int = MONITOR_HEIGHT,
) -> dict[str, Any]:
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


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * (pct / 100.0)
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[int(position)]
    return ordered[low] * (high - position) + ordered[high] * (position - low)


def rounded(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def load_water_settings(config_path: Path) -> tuple[dict[str, Any], dict[str, Any], tuple[float, float, float, float], float]:
    config = read_json(config_path)
    water = config.get('water_level') if isinstance(config.get('water_level'), dict) else {}
    roi = parse_roi(water.get('roi'))
    if not roi:
        raise SystemExit('ERROR: return water-level ROI is not configured. Calibrate the right-side ROI first.')
    baseline_raw = water.get('baseline_y_percent')
    try:
        baseline = float(baseline_raw)
    except (TypeError, ValueError):
        raise SystemExit('ERROR: return water-level baseline_y_percent is not configured. Calibrate the ROI first.')
    return config, water, roi, baseline


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    config, water, roi, baseline = load_water_settings(Path(args.config))
    minimum_confidence = clamp_number(args.minimum_confidence if args.minimum_confidence is not None else water.get('minimum_confidence'), 0.2, 0.9, 0.5)
    current_warning = clamp_number(water.get('warning_delta_percent'), 1.0, 30.0, 6.0)
    current_urgent = max(current_warning + 1.0, clamp_number(water.get('urgent_delta_percent'), 2.0, 45.0, 12.0))
    current_jump = clamp_number(water.get('max_line_jump_percent'), 4.0, 45.0, 12.0)
    captures_dir = Path(args.captures)
    catalog = capture_catalog(captures_dir)
    samples = select_samples(catalog, args.days, args.max_images, args.min_spacing_minutes)
    readings: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for captured, path in samples:
        try:
            pixels = decode_monitor_frame(path)
            detected = detect_water_line(pixels, roi)
        except Exception as error:
            rejected.append({'capturedAt': captured.isoformat(), 'path': str(path), 'reason': str(error)[:180]})
            continue
        confidence = float(detected.get('confidence') or 0.0)
        item = {
            'capturedAt': captured.isoformat(),
            'path': str(path),
            'confidence': rounded(confidence, 3),
            'yPercent': detected.get('yPercent'),
            'edgeScore': detected.get('edgeScore'),
            'coverage': detected.get('coverage'),
        }
        if not detected.get('available') or confidence < minimum_confidence or detected.get('yPercent') is None:
            item['reason'] = 'low_confidence_or_unavailable'
            rejected.append(item)
            continue
        readings.append(item)

    y_values = [float(item['yPercent']) for item in readings]
    if len(y_values) < args.minimum_samples:
        raise SystemExit(f'ERROR: only {len(y_values)} confident readings were found; need at least {args.minimum_samples}. Try more days, more images, or a slightly lower --minimum-confidence.')

    median_y = median(y_values)
    deviations_from_median = [abs(value - median_y) for value in y_values]
    mad = median(deviations_from_median)
    outlier_limit = max(current_jump, 6.0 * mad, 8.0)
    accepted: list[dict[str, Any]] = []
    outliers: list[dict[str, Any]] = []
    for item in readings:
        y_value = float(item['yPercent'])
        if abs(y_value - median_y) > outlier_limit:
            item = {**item, 'reason': 'outlier_from_median', 'medianYPercent': rounded(median_y), 'distanceFromMedianPercent': rounded(abs(y_value - median_y))}
            outliers.append(item)
        else:
            accepted.append(item)

    if len(accepted) < args.minimum_samples:
        raise SystemExit(f'ERROR: only {len(accepted)} readings remained after outlier rejection; need at least {args.minimum_samples}.')

    accepted_y = [float(item['yPercent']) for item in accepted]
    accepted_conf = [float(item['confidence']) for item in accepted]
    deltas = [baseline - value for value in accepted_y]
    abs_deltas = [abs(value) for value in deltas]
    frame_jumps: list[float] = []
    previous_y: float | None = None
    for item in accepted:
        y_value = float(item['yPercent'])
        if previous_y is not None:
            frame_jumps.append(abs(y_value - previous_y))
        previous_y = y_value

    p95_abs = percentile(abs_deltas, 95)
    p90_abs = percentile(abs_deltas, 90)
    max_abs = max(abs_deltas) if abs_deltas else 0.0
    p95_jump = percentile(frame_jumps, 95) if frame_jumps else 0.0
    max_jump = max(frame_jumps) if frame_jumps else 0.0
    normal_band = max(p95_abs, percentile(deviations_from_median, 95), 0.5)

    recommended_warning = math.ceil(max(current_warning, normal_band * 2.0 + 1.0, 4.0))
    recommended_warning = min(24, max(4, recommended_warning))
    recommended_urgent = math.ceil(max(current_urgent, recommended_warning + 4.0, normal_band * 3.0 + 2.0))
    recommended_urgent = min(35, max(recommended_warning + 2, recommended_urgent))
    recommended_jump = math.ceil(max(current_jump, p95_jump * 3.0 + 4.0, 8.0))
    recommended_jump = min(30, max(8, recommended_jump))

    report = {
        'schemaVersion': 1,
        'trainerVersion': TRAINER_VERSION,
        'learnedAt': utc_now_dt().isoformat(),
        'camera': args.camera,
        'configPath': str(args.config),
        'capturesPath': str(captures_dir),
        'days': rounded(args.days, 2),
        'maxImages': int(args.max_images),
        'minSpacingMinutes': rounded(args.min_spacing_minutes, 2),
        'roi': [rounded(value, 4) for value in roi],
        'minimumConfidence': rounded(minimum_confidence, 3),
        'sampleCount': len(samples),
        'acceptedCount': len(accepted),
        'rejectedCount': len(rejected) + len(outliers),
        'baselineYPercent': rounded(baseline),
        'medianYPercent': rounded(median(accepted_y)),
        'minYPercent': rounded(min(accepted_y)),
        'maxYPercent': rounded(max(accepted_y)),
        'confidenceMinimum': rounded(min(accepted_conf), 3),
        'confidenceMedian': rounded(median(accepted_conf), 3),
        'confidenceP10': rounded(percentile(accepted_conf, 10), 3),
        'normalBandPercent': rounded(normal_band),
        'p90AbsDeltaPercent': rounded(p90_abs),
        'p95AbsDeltaPercent': rounded(p95_abs),
        'maxAbsDeltaPercent': rounded(max_abs),
        'p95FrameJumpPercent': rounded(p95_jump),
        'maxFrameJumpPercent': rounded(max_jump),
        'currentWarningPercent': rounded(current_warning),
        'currentUrgentPercent': rounded(current_urgent),
        'currentMaxLineJumpPercent': rounded(current_jump),
        'recommendedWarningPercent': rounded(recommended_warning),
        'recommendedUrgentPercent': rounded(recommended_urgent),
        'recommendedMaxLineJumpPercent': rounded(recommended_jump),
        'recommendation': 'apply' if recommended_warning > current_warning or recommended_urgent > current_urgent or recommended_jump > current_jump else 'keep_current_thresholds',
        'acceptedReadingsPreview': accepted[-12:],
        'rejectedPreview': (rejected + outliers)[-12:],
    }
    return report


def apply_report(config_path: Path, report: dict[str, Any]) -> None:
    config = read_json(config_path)
    water = config.setdefault('water_level', {})
    if not isinstance(water, dict):
        raise SystemExit('ERROR: water_level configuration is not a JSON object.')
    water['warning_delta_percent'] = report['recommendedWarningPercent']
    water['urgent_delta_percent'] = report['recommendedUrgentPercent']
    water['max_line_jump_percent'] = report['recommendedMaxLineJumpPercent']
    water['learned_normal'] = {
        key: report[key]
        for key in [
            'learnedAt', 'camera', 'roi', 'sampleCount', 'acceptedCount', 'rejectedCount',
            'confidenceMedian', 'confidenceMinimum', 'baselineYPercent', 'medianYPercent',
            'normalBandPercent', 'p90AbsDeltaPercent', 'p95AbsDeltaPercent', 'maxAbsDeltaPercent',
            'p95FrameJumpPercent', 'maxFrameJumpPercent', 'recommendedWarningPercent',
            'recommendedUrgentPercent', 'recommendedMaxLineJumpPercent',
        ]
        if key in report
    }
    write_json_atomic(config_path, config)


def print_summary(report: dict[str, Any], applied: bool) -> None:
    print('RETURN WATER-LEVEL LEARNING REPORT')
    print('==================================')
    print(f"Trainer version: {report.get('trainerVersion')}")
    print(f"Camera: {report.get('camera')}")
    print(f"ROI: {report.get('roi')}")
    print(f"Samples scanned: {report.get('sampleCount')}")
    print(f"Accepted readings: {report.get('acceptedCount')}")
    print(f"Rejected/outlier readings: {report.get('rejectedCount')}")
    print(f"Baseline Y: {report.get('baselineYPercent')}%")
    print(f"Median Y: {report.get('medianYPercent')}%")
    print(f"Normal band: +/- {report.get('normalBandPercent')}% of ROI height")
    print(f"95th percentile movement: {report.get('p95AbsDeltaPercent')}%")
    print(f"Max observed movement: {report.get('maxAbsDeltaPercent')}%")
    print(f"Confidence median/min: {report.get('confidenceMedian')} / {report.get('confidenceMinimum')}")
    print()
    print(f"Current warning/urgent: {report.get('currentWarningPercent')}% / {report.get('currentUrgentPercent')}%")
    print(f"Recommended warning/urgent: {report.get('recommendedWarningPercent')}% / {report.get('recommendedUrgentPercent')}%")
    print(f"Recommended max line jump: {report.get('recommendedMaxLineJumpPercent')}%")
    print(f"Recommendation: {report.get('recommendation')}")
    print(f"Report saved: {RETURN_LEARNING_REPORT_PATH}")
    print(f"Applied to config: {'yes' if applied else 'no'}")


def main() -> int:
    parser = argparse.ArgumentParser(description='Learn normal return-chamber water-level variation from archived Observer still images.')
    parser.add_argument('--camera', choices=['return'], default='return', help='Camera to analyze. Only return is supported in this release.')
    parser.add_argument('--config', default=str(RETURN_MONITOR_CONFIG_PATH), help='Return monitoring config path.')
    parser.add_argument('--captures', default=str(RETURN_CAPTURES_DIR), help='Return camera capture archive path.')
    parser.add_argument('--days', type=float, default=2.0, help='How many recent days of captures to scan.')
    parser.add_argument('--max-images', type=int, default=240, help='Maximum images to decode.')
    parser.add_argument('--min-spacing-minutes', type=float, default=10.0, help='Minimum spacing between sampled captures.')
    parser.add_argument('--minimum-confidence', type=float, default=None, help='Override detector confidence cutoff.')
    parser.add_argument('--minimum-samples', type=int, default=18, help='Minimum confident readings required.')
    parser.add_argument('--apply', action='store_true', help='Apply recommended thresholds to return-monitoring.json.')
    parser.add_argument('--status', action='store_true', help='Print the latest saved learning report and exit.')
    args = parser.parse_args()

    if args.status:
        if not RETURN_LEARNING_REPORT_PATH.exists():
            raise SystemExit('No learning report has been saved yet.')
        print(RETURN_LEARNING_REPORT_PATH.read_text(encoding='utf-8'))
        return 0

    report = build_report(args)
    write_json_atomic(RETURN_LEARNING_REPORT_PATH, report)
    applied = False
    if args.apply:
        apply_report(Path(args.config), report)
        applied = True
    print_summary(report, applied)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
