#!/usr/bin/env python3
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

spec = spec_from_file_location('observer_publisher', Path(__file__).parents[1] / 'connector' / 'timelapse-builder.py')
module = module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

end = datetime(2026, 7, 21, 20, tzinfo=timezone.utc)
catalog = [(end - timedelta(minutes=5 * index), Path(f'/tmp/frame-{index}.jpg')) for index in range(0, 9 * 24 * 12)]
catalog.sort(key=lambda item: item[0])
weekly = module.timelapse_frames(catalog, 'week', end)
assert 150 <= len(weekly) <= 170, len(weekly)
assert module.archive_coverage_days(catalog) > 8
monthly = module.timelapse_frames(catalog, 'month', end)
assert 30 <= len(monthly) <= 40, len(monthly)
print('Observer Pi timelapse selection tests passed.')
