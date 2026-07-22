#!/usr/bin/env python3
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path

module_path = Path(__file__).resolve().parents[1] / "connector" / "observer-publisher.py"
spec = importlib.util.spec_from_file_location("observer_publisher", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

now = datetime(2026, 7, 22, 18, 0, tzinfo=timezone.utc)
current = "2026-07-22T19:00:00+00:00"
config = {}

first = module.daily_summary_attempt_decision(config, {}, current, now)
assert first["action"] == "attempt"
assert first["maxAttempts"] == 3
assert first["retryMinutes"] == 180

waiting = module.daily_summary_attempt_decision(config, {
    "dailySummaryAttemptCurrentCapturedAt": current,
    "dailySummaryAttemptCount": 1,
    "dailySummaryNextAttemptAt": (now + timedelta(hours=2)).isoformat(),
}, current, now)
assert waiting["action"] == "wait"
assert waiting["status"] == "retry_scheduled"

paused = module.daily_summary_attempt_decision(config, {
    "dailySummaryAttemptCurrentCapturedAt": current,
    "dailySummaryAttemptCount": 3,
}, current, now)
assert paused["action"] == "paused"

complete = module.daily_summary_attempt_decision(config, {
    "dailySummaryCurrentCapturedAt": current,
}, current, now)
assert complete["action"] == "current"

next_day = module.daily_summary_attempt_decision(config, {
    "dailySummaryAttemptCurrentCapturedAt": "2026-07-21T19:00:00+00:00",
    "dailySummaryAttemptCount": 3,
}, current, now)
assert next_day["action"] == "attempt"
assert next_day["attemptCount"] == 0


frames = [
    {"slot": "dailyPrevious", "capturedAt": "2026-07-21T19:00:00+00:00"},
    {"slot": "dailyCurrent", "capturedAt": current},
]
old_complete_health = module.daily_summary_health(config, {
    "dailySummaryStatus": "current",
    "dailySummaryCurrentCapturedAt": "2026-07-21T19:00:00+00:00",
}, frames)
assert old_complete_health["status"] == "pending"

current_health = module.daily_summary_health(config, {
    "dailySummaryStatus": "current",
    "dailySummaryCurrentCapturedAt": current,
}, frames)
assert current_health["status"] == "healthy"

source = module_path.read_text()
assert "daily_error = safe_text(previous_publish_status.get('dailySummaryError')" in source
assert "DAILY_SUMMARY_RETRY_SCHEDULED" in source
assert "DAILY_SUMMARY_PAUSED" in source

print("Observer daily-summary retry-budget tests passed.")
