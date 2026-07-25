#!/usr/bin/env python3
"""Test and save the private overview-camera filter-roll ROI."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import tempfile
from pathlib import Path
from typing import Any

DEFAULT_CONFIG = Path('/etc/reefkeeper-observer/filter-roller-monitoring.json')
DEFAULT_PUBLISHER = Path(__file__).with_name('observer-publisher.py')


def parse_roi(text: str) -> tuple[float, float, float, float]:
    try:
        values = tuple(float(item.strip()) for item in text.split(','))
    except ValueError as error:
        raise argparse.ArgumentTypeError('ROI must contain four decimal values: x,y,width,height') from error
    if len(values) != 4:
        raise argparse.ArgumentTypeError('ROI must contain four values: x,y,width,height')
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1 or y + height > 1:
        raise argparse.ArgumentTypeError('ROI values must be normalized between 0 and 1 and remain inside the image.')
    return values


def parse_hours(text: str) -> list[int]:
    try:
        values = sorted({max(0, min(23, int(item.strip()))) for item in text.split(',') if item.strip()})
    except ValueError as error:
        raise argparse.ArgumentTypeError('Hours must be comma-separated whole numbers from 0 to 23.') from error
    if not values:
        raise argparse.ArgumentTypeError('At least one local measurement hour is required.')
    return values


def load_publisher(path: Path):
    spec = importlib.util.spec_from_file_location('reefkeeper_observer_publisher', path)
    if not spec or not spec.loader:
        raise RuntimeError(f'Could not load publisher module from {path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def main() -> int:
    parser = argparse.ArgumentParser(description='Test the outer-edge filter-roll detector and optionally save its private Pi configuration.')
    parser.add_argument('--publisher', type=Path, default=DEFAULT_PUBLISHER)
    parser.add_argument('--image', type=Path, default=None, help='JPEG to test. Defaults to the overview latest.jpg used by the publisher.')
    parser.add_argument('--roi', type=parse_roi, default=(0.552, 0.0, 0.130, 0.240), help='Normalized x,y,width,height. Default: 0.552,0,0.130,0.240')
    parser.add_argument('--probe-y', type=float, default=0.38, help='Vertical scan-band center inside the ROI. Default: 0.38')
    parser.add_argument('--hours', type=parse_hours, default=[9, 15, 21], help='Local analysis hours. Default: 9,15,21')
    parser.add_argument('--min-spacing-minutes', type=int, default=240)
    parser.add_argument('--minimum-confidence', type=float, default=0.42)
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--save', action='store_true', help='Save the configuration after a successful test.')
    args = parser.parse_args()

    publisher = load_publisher(args.publisher)
    image = args.image or publisher.IMAGE_PATH
    probe_y = max(0.1, min(0.9, float(args.probe_y)))
    result = publisher.analyze_filter_roll_frame(image, args.roi, probe_y)
    print(json.dumps(result, indent=2))
    print('\nNote: apparentOuterRadius is measured in pixels in the fixed camera projection, not millimeters.')

    if result.get('available') is not True:
        print('Calibration not saved because the outer silhouette was not available.')
        return 1
    if float(result.get('confidence') or 0) < float(args.minimum_confidence):
        print(f"Calibration not saved because confidence {result.get('confidence')} is below {args.minimum_confidence:.2f}.")
        return 1
    if not args.save:
        print('TEST RESULT: PASS — rerun with --save to enable scheduled measurement.')
        return 0

    data = {
        'enabled': True,
        'roi': [round(value, 6) for value in args.roi],
        'probe_y': round(probe_y, 4),
        'measurement_hours_local': args.hours,
        'min_spacing_minutes': max(30, min(1440, int(args.min_spacing_minutes))),
        'minimum_confidence': max(0.15, min(0.95, float(args.minimum_confidence))),
        'detector': 'outer-edge-multiscan-v1',
    }
    write_json_atomic(args.config, data)
    print(f'Saved: {args.config}')
    print('CALIBRATION RESULT: PASS — OUTER-EDGE FILTER-ROLL MONITORING ENABLED')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
