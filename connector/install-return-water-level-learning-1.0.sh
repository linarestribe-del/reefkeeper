#!/usr/bin/env bash
set -u

SERVICE="reefkeeper-observer-publish.service"
TIMER="reefkeeper-observer-publish.timer"
STATUS="/mnt/reef-ssd/aquarium-observer/publish-status.json"
TRAINER_TARGET="/opt/reefkeeper-observer/return-water-level-trainer.py"
EXPECTED_PUBLISHER_SHA256="63ed57c98e3def6580181d62c356a385ed4edca509744728501cc9d7697d9862"
EXPECTED_TRAINER_SHA256="80b3fbdcc8bc376cee4479015de138496b3cebb0e6e180734f7fd3b88e8e7fcf"
TMP_DIR="$(mktemp -d /tmp/reefkeeper-water-level-learning-1.0.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "REEF KEEPER 9N RETURN WATER-LEVEL LEARNING INSTALLER"
echo "======================================================"

TARGET="$(python3 - "$SERVICE" <<'PYIN'
from pathlib import Path
import re
import shlex
import subprocess
import sys

service = sys.argv[1]
result = subprocess.run(
    ['systemctl', 'show', service, '--property=ExecStart', '--value'],
    capture_output=True,
    text=True,
    check=False,
)
raw = result.stdout.strip()
match = re.search(r'argv\[\]=([^;}]*)', raw)
command = match.group(1).strip() if match else raw
try:
    arguments = shlex.split(command)
except ValueError:
    arguments = command.split()
for argument in arguments:
    candidate = Path(argument)
    if 'observer-publisher' in candidate.name and candidate.suffix == '.py':
        print(candidate)
        break
PYIN
)"

if [ -z "$TARGET" ] || [ ! -f "$TARGET" ]; then
  echo "ERROR: Could not identify the active publisher script from systemd."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
PUBLISHER_BACKUP="${TARGET}.before-2.8.4-9n-${STAMP}.bak"
TRAINER_BACKUP="${TRAINER_TARGET}.before-9n-${STAMP}.bak"
WAS_ENABLED="$(systemctl is-enabled "$TIMER" 2>/dev/null || true)"

echo "Active publisher file: $TARGET"
echo "Trainer target: $TRAINER_TARGET"
echo "Timer was: $WAS_ENABLED"
echo "Downloading verified 9N files..."

if ! python3 - "$TMP_DIR" "$EXPECTED_PUBLISHER_SHA256" "$EXPECTED_TRAINER_SHA256" <<'PYDL'
from pathlib import Path
import hashlib
import sys
import urllib.request

output = Path(sys.argv[1])
expected_publisher = sys.argv[2]
expected_trainer = sys.argv[3]
env_path = Path('/home/reefkeeper/reefkeeper-pi-connector/.env')
values = {}
if env_path.exists():
    for line in env_path.read_text(encoding='utf-8', errors='replace').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
base = values.get('REEF_KEEPER_URL', '').rstrip('/') or 'https://reefkeeper.vercel.app'
files = [
    ('observer-publisher.py', expected_publisher, "PUBLISHER_VERSION = '2.8.4'", 'learnedNormal'),
    ('return-water-level-trainer.py', expected_trainer, "TRAINER_VERSION = '1.0.0'", 'recommendedWarningPercent'),
]
for name, expected, marker, feature in files:
    url = f'{base}/connector/{name}?v=4.3.70-9n'
    request = urllib.request.Request(url, headers={
        'User-Agent': 'ReefKeeper-9N-Water-Level-Learning/1.0',
        'Cache-Control': 'no-cache',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        source = response.read()
    digest = hashlib.sha256(source).hexdigest()
    if digest != expected:
        raise SystemExit(f'{name} checksum did not match the verified release. got {digest}')
    text = source.decode('utf-8')
    compile(text, name, 'exec')
    if marker not in text or feature not in text:
        raise SystemExit(f'{name} does not include the expected 9N feature markers.')
    (output / name).write_bytes(source)
print('Download, checksum, and Python syntax: PASS')
PYDL
then
  echo "UPDATE RESULT: DOWNLOAD OR VERIFICATION FAILED"
  exit 1
fi

BEFORE_HASH="$(sha256sum "$STATUS" 2>/dev/null | awk '{print $1}')"
BEFORE_HASH="${BEFORE_HASH:-missing}"

echo "Stopping publisher timer during install..."
sudo systemctl stop "$TIMER" 2>/dev/null || true
sudo systemctl stop "$SERVICE" 2>/dev/null || true

echo "Creating backups..."
if ! sudo cp -a "$TARGET" "$PUBLISHER_BACKUP" || ! sudo test -s "$PUBLISHER_BACKUP"; then
  echo "ERROR: Publisher backup could not be created."
  if [ "$WAS_ENABLED" = "enabled" ]; then sudo systemctl enable --now "$TIMER"; fi
  exit 1
fi
if [ -f "$TRAINER_TARGET" ]; then
  sudo cp -a "$TRAINER_TARGET" "$TRAINER_BACKUP" || true
fi

rollback() {
  echo "Restoring previous publisher backup..."
  sudo systemctl stop "$TIMER" 2>/dev/null || true
  sudo systemctl stop "$SERVICE" 2>/dev/null || true
  sudo cp -a "$PUBLISHER_BACKUP" "$TARGET"
  if [ -f "$TRAINER_BACKUP" ]; then sudo cp -a "$TRAINER_BACKUP" "$TRAINER_TARGET"; fi
  if [ "$WAS_ENABLED" = "enabled" ]; then sudo systemctl enable --now "$TIMER"; fi
  echo "UPDATE RESULT: ROLLED BACK TO PREVIOUS PUBLISHER"
  exit 1
}

echo "Installing Publisher 2.8.4 and water-level trainer..."
if ! sudo install -o root -g root -m 0755 "$TMP_DIR/observer-publisher.py" "$TARGET"; then
  rollback
fi
if ! sudo install -o root -g root -m 0755 "$TMP_DIR/return-water-level-trainer.py" "$TRAINER_TARGET"; then
  rollback
fi

echo "Running one controlled publish..."
sudo systemctl reset-failed "$SERVICE"
sudo systemctl start "$SERVICE" || true
for _ in $(seq 1 45); do
  ACTIVE="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
  if [ "$ACTIVE" != "active" ] && [ "$ACTIVE" != "activating" ]; then
    break
  fi
  sleep 1
done

RESULT="$(systemctl show "$SERVICE" --property=Result --value 2>/dev/null || true)"
EXIT_CODE="$(systemctl show "$SERVICE" --property=ExecMainStatus --value 2>/dev/null || true)"
AFTER_HASH="$(sha256sum "$STATUS" 2>/dev/null | awk '{print $1}')"
AFTER_HASH="${AFTER_HASH:-missing}"
readarray -t CONTROLLED_STATUS < <(python3 - "$STATUS" <<'PYSTATUS'
from pathlib import Path
import json
import sys
try:
    value = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
except Exception:
    value = {}
for key in [
    'publisherVersion', 'ok', 'publishedAt', 'dailySummaryStatus', 'dailySummaryError',
    'returnCameraOk', 'returnCameraHealthStatus', 'returnCameraLocalMonitorStatus', 'returnCameraError'
]:
    print(value.get(key, 'unknown'))
PYSTATUS
)
VERSION="${CONTROLLED_STATUS[0]:-unknown}"
OK="${CONTROLLED_STATUS[1]:-unknown}"
PUBLISHED="${CONTROLLED_STATUS[2]:-unknown}"
DAILY_STATUS="${CONTROLLED_STATUS[3]:-unknown}"
DAILY_ERROR="${CONTROLLED_STATUS[4]:-unknown}"
RETURN_OK="${CONTROLLED_STATUS[5]:-unknown}"
RETURN_HEALTH="${CONTROLLED_STATUS[6]:-unknown}"
RETURN_MONITOR="${CONTROLLED_STATUS[7]:-unknown}"
RETURN_ERROR="${CONTROLLED_STATUS[8]:-unknown}"

if [ "$RESULT" != "success" ] || [ "$EXIT_CODE" != "0" ] || [ "$VERSION" != "2.8.4" ] || [ "$OK" != "True" ] || [ "$AFTER_HASH" = "$BEFORE_HASH" ]; then
  echo "Controlled publish failed."
  echo "Result: $RESULT; exit: $EXIT_CODE; version: $VERSION; ok: $OK"
  rollback
fi

if [ "$DAILY_ERROR" = "Publish returned HTTP 200" ]; then
  echo "Daily-summary false retry was not cleared."
  rollback
fi

if ! sudo "$TRAINER_TARGET" --help >/dev/null; then
  echo "Trainer help check failed."
  rollback
fi

if [ "$WAS_ENABLED" = "enabled" ]; then
  echo "Restoring publisher timer..."
  sudo systemctl enable --now "$TIMER"
else
  echo "Publisher timer was not enabled before install; leaving it stopped."
fi

echo
echo "FINAL STATUS"
echo "Publisher version: $VERSION"
echo "Overview publish successful: $OK"
echo "Overview published at: $PUBLISHED"
echo "Daily summary status: $DAILY_STATUS"
echo "Daily summary error: $DAILY_ERROR"
echo "Return publish successful: $RETURN_OK"
echo "Return health: $RETURN_HEALTH"
echo "Return local monitor: $RETURN_MONITOR"
echo "Return error: $RETURN_ERROR"
echo "Trainer installed: $TRAINER_TARGET"
echo "Timer active: $(systemctl is-active "$TIMER" 2>/dev/null || true)"
echo "Timer enabled: $(systemctl is-enabled "$TIMER" 2>/dev/null || true)"
echo
echo "UPDATE RESULT: PASS — 9N WATER-LEVEL LEARNING INSTALLED"
