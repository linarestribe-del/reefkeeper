#!/usr/bin/env python3
"""Calibrate Reef Keeper Observer water-level monitoring for either local camera."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

PUBLISHER_PATH = Path('/opt/reefkeeper-observer/observer-publisher.py')
OVERVIEW_CONFIG_PATH = Path('/etc/reefkeeper-observer/monitoring.json')
RETURN_CONFIG_PATH = Path('/etc/reefkeeper-observer/return-monitoring.json')
OVERVIEW_IMAGE_PATH = Path('/mnt/reef-ssd/aquarium-observer/latest.jpg')
RETURN_IMAGE_PATH = Path('/mnt/reef-ssd/aquarium-observer/return-chamber/latest.jpg')


def load_publisher():
    if not PUBLISHER_PATH.is_file():
        raise SystemExit(f'Publisher module not found at {PUBLISHER_PATH}')
    spec = importlib.util.spec_from_file_location('reefkeeper_observer_publisher', PUBLISHER_PATH)
    if not spec or not spec.loader:
        raise SystemExit('Could not load the installed Observer publisher.')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_config(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    try:
        value = json.loads(config_path.read_text(encoding='utf-8'))
    except Exception as error:
        raise SystemExit(f'Could not read {config_path}: {error}')
    return value if isinstance(value, dict) else {}


def write_config(config_path: Path, value: dict) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f'.{config_path.stem}.', suffix='.json', dir=config_path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(value, handle, indent=2)
            handle.write('\n')
        os.chmod(temporary, 0o640)
        os.replace(temporary, config_path)
        try:
            shutil.chown(config_path, user='root', group='reefkeeper')
            os.chmod(config_path, 0o640)
        except (LookupError, PermissionError, OSError) as error:
            print(f'Warning: calibration permissions could not be finalized automatically: {error}', file=sys.stderr)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def parse_roi(text: str) -> list[float]:
    try:
        values = [float(part.strip()) for part in text.split(',')]
    except ValueError as error:
        raise argparse.ArgumentTypeError('ROI must contain four decimal values: x,y,width,height') from error
    if len(values) != 4:
        raise argparse.ArgumentTypeError('ROI must contain four values: x,y,width,height')
    x, y, width, height = values
    if not (0 <= x < 1 and 0 <= y < 1 and 0 < width <= 1 and 0 < height <= 1 and x + width <= 1 and y + height <= 1):
        raise argparse.ArgumentTypeError('ROI values must be normalized between 0 and 1 and remain inside the image.')
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description='Calibrate local water-level monitoring from the latest Observer camera capture.')
    parser.add_argument('--camera', choices=['return', 'overview'], default='return', help='Camera to calibrate (default: return).')
    parser.add_argument('--roi', type=parse_roi, help='Normalized region x,y,width,height, for example 0.15,0.35,0.70,0.30')
    parser.add_argument('--warning', type=float, default=5.0, help='Warning change as percent of ROI height (default 5).')
    parser.add_argument('--urgent', type=float, default=10.0, help='Urgent change as percent of ROI height (default 10).')
    parser.add_argument('--minimum-confidence', type=float, default=0.45, help='Minimum edge confidence from 0.2 to 0.9.')
    parser.add_argument('--force', action='store_true', help='Accept a low-confidence detected line.')
    parser.add_argument('--disable', action='store_true', help='Disable water-level monitoring but preserve other local-monitor settings.')
    parser.add_argument('--status', action='store_true', help='Print the non-secret monitoring configuration.')
    args = parser.parse_args()

    config_path = RETURN_CONFIG_PATH if args.camera == 'return' else OVERVIEW_CONFIG_PATH
    image_path = RETURN_IMAGE_PATH if args.camera == 'return' else OVERVIEW_IMAGE_PATH
    config = read_config(config_path)
    water = config.get('water_level') if isinstance(config.get('water_level'), dict) else {}

    if args.status:
        print(json.dumps({'enabled': config.get('enabled', True), 'water_level': water}, indent=2))
        return 0

    if args.disable:
        config['water_level'] = {**water, 'enabled': False}
        write_config(config_path, config)
        print('Water-level monitoring disabled. Other Observer monitoring remains unchanged.')
        return 0

    if not args.roi:
        parser.error('--roi is required unless --disable or --status is used')

    publisher = load_publisher()
    pixels = publisher.decode_monitor_frame(image_path)
    roi = publisher.parse_roi(args.roi)
    if not roi:
        raise SystemExit('The ROI is too small or invalid after normalization.')
    detected = publisher.detect_water_line(pixels, roi)
    confidence = float(detected.get('confidence') or 0)
    if not detected.get('available') or detected.get('yPercent') is None:
        raise SystemExit('No usable horizontal water-line edge was found in that region.')
    if confidence < max(0.2, min(0.9, args.minimum_confidence)) and not args.force:
        raise SystemExit(f'Detected line confidence is only {confidence:.2f}. Adjust the ROI or rerun with --force after visually checking the region.')

    warning = max(1.0, min(30.0, args.warning))
    urgent = max(warning + 1.0, min(45.0, args.urgent))
    config['enabled'] = True
    config['water_level'] = {
        **water,
        'enabled': True,
        'roi': [round(value, 4) for value in roi],
        'baseline_y_percent': round(float(detected['yPercent']), 2),
        'warning_delta_percent': warning,
        'urgent_delta_percent': urgent,
        'alert_streak': int(water.get('alert_streak') or 2),
        'minimum_confidence': max(0.2, min(0.9, args.minimum_confidence)),
    }
    write_config(config_path, config)
    print('Water-level calibration saved.')
    print(f"Detected baseline: {float(detected['yPercent']):.2f}% down the selected region")
    print(f'Confidence: {confidence:.2f}')
    print(f'Warning threshold: {warning:.1f}% of region height')
    print(f'Urgent threshold: {urgent:.1f}% of region height')
    print(f'Camera: {args.camera}')
    print(f'Image: {image_path}')
    print(f'Configuration: {config_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
