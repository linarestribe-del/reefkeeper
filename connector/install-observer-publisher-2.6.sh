#!/usr/bin/env bash
set -u

SERVICE="reefkeeper-observer-publish.service"
TIMER="reefkeeper-observer-publish.timer"
STATUS="/mnt/reef-ssd/aquarium-observer/publish-status.json"
EXPECTED_PUBLISHER_SHA256="5cfdb10b19fa7a8fdec25f8aa3b7b19e364b9794e95f2c1100130370d7d40948"
EXPECTED_CALIBRATOR_SHA256="b8e5f3b0723aa70018aff95c69db07688f118eb7f7c193d0c605d539f8377fbd"
TMP_DIR="$(mktemp -d /tmp/reefkeeper-observer-2.6.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "REEF KEEPER OBSERVER PUBLISHER 2.6 INSTALLER"
echo "================================================"

TARGET="$(python3 - "$SERVICE" <<'PY'
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
PY
)"

if [ -z "$TARGET" ] || [ ! -f "$TARGET" ]; then
  echo "ERROR: Could not identify the active publisher script from systemd."
  exit 1
fi

TARGET_DIR="$(dirname "$TARGET")"
CALIBRATOR_TARGET="$TARGET_DIR/observer-water-level-calibrate.py"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TARGET}.publisher-2.4-${STAMP}.bak"
CALIBRATOR_BACKUP=""

if [ -f "$CALIBRATOR_TARGET" ]; then
  CALIBRATOR_BACKUP="${CALIBRATOR_TARGET}.before-2.6-${STAMP}.bak"
fi

echo "Active publisher file: $TARGET"
echo "Downloading verified Publisher 2.6 and dual-camera calibration helper..."

if ! python3 - "$TMP_DIR" "$EXPECTED_PUBLISHER_SHA256" "$EXPECTED_CALIBRATOR_SHA256" <<'PY'
from pathlib import Path
import hashlib
import sys
import urllib.request

output = Path(sys.argv[1])
expected = {
    'observer-publisher.py': sys.argv[2],
    'observer-water-level-calibrate.py': sys.argv[3],
}
env_path = Path('/home/reefkeeper/reefkeeper-pi-connector/.env')
values = {}
for line in env_path.read_text(encoding='utf-8', errors='replace').splitlines():
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    values[key.strip()] = value.strip().strip('"').strip("'")
base = values.get('REEF_KEEPER_URL', '').rstrip('/')
if not base:
    raise SystemExit('REEF_KEEPER_URL was not found.')
for filename, digest_expected in expected.items():
    url = f'{base}/connector/{filename}?v=4.3.46'
    request = urllib.request.Request(url, headers={
        'User-Agent': 'ReefKeeper-Observer-Updater/2.6',
        'Cache-Control': 'no-cache',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        source = response.read()
    digest = hashlib.sha256(source).hexdigest()
    if digest != digest_expected:
        raise SystemExit(f'{filename} checksum did not match the verified release.')
    text = source.decode('utf-8')
    compile(text, filename, 'exec')
    (output / filename).write_bytes(source)
if "PUBLISHER_VERSION = '2.6'" not in (output / 'observer-publisher.py').read_text(encoding='utf-8'):
    raise SystemExit('Downloaded publisher is not version 2.6.')
if "--camera" not in (output / 'observer-water-level-calibrate.py').read_text(encoding='utf-8'):
    raise SystemExit('Downloaded calibration helper is not dual-camera aware.')
print('Download, checksums, and Python syntax: PASS')
PY
then
  echo "UPDATE RESULT: DOWNLOAD OR VERIFICATION FAILED"
  exit 1
fi

BEFORE_HASH="$(sha256sum "$STATUS" 2>/dev/null | awk '{print $1}')"
BEFORE_HASH="${BEFORE_HASH:-missing}"

echo "Stopping automatic publishing..."
sudo systemctl stop "$TIMER"
sudo systemctl stop "$SERVICE" 2>/dev/null || true

echo "Creating verified Publisher 2.4 backup..."
if ! sudo cp -a "$TARGET" "$BACKUP" || ! sudo test -s "$BACKUP"; then
  echo "ERROR: Publisher backup could not be created."
  sudo systemctl enable --now "$TIMER"
  exit 1
fi
if [ -n "$CALIBRATOR_BACKUP" ]; then
  if ! sudo cp -a "$CALIBRATOR_TARGET" "$CALIBRATOR_BACKUP" || ! sudo test -s "$CALIBRATOR_BACKUP"; then
    echo "ERROR: Calibration-helper backup could not be created."
    sudo systemctl enable --now "$TIMER"
    exit 1
  fi
fi

echo "Installing Publisher 2.6..."
if ! sudo install -o root -g root -m 0755 "$TMP_DIR/observer-publisher.py" "$TARGET" || \
   ! sudo install -o root -g root -m 0755 "$TMP_DIR/observer-water-level-calibrate.py" "$CALIBRATOR_TARGET"; then
  echo "Installation failed. Restoring Publisher 2.4..."
  sudo cp -a "$BACKUP" "$TARGET"
  if [ -n "$CALIBRATOR_BACKUP" ] && sudo test -f "$CALIBRATOR_BACKUP"; then
    sudo cp -a "$CALIBRATOR_BACKUP" "$CALIBRATOR_TARGET"
  fi
  sudo systemctl enable --now "$TIMER"
  exit 1
fi

rollback() {
  echo "Restoring Publisher 2.4 backup..."
  sudo systemctl stop "$TIMER" 2>/dev/null || true
  sudo systemctl stop "$SERVICE" 2>/dev/null || true
  sudo cp -a "$BACKUP" "$TARGET"
  if [ -n "$CALIBRATOR_BACKUP" ] && sudo test -f "$CALIBRATOR_BACKUP"; then
    sudo cp -a "$CALIBRATOR_BACKUP" "$CALIBRATOR_TARGET"
  fi
  sudo systemctl enable --now "$TIMER"
  echo "UPDATE RESULT: ROLLED BACK TO PUBLISHER 2.4"
  exit 1
}

sudo systemctl reset-failed "$SERVICE"
sudo systemctl start "$SERVICE" || true
sleep 5

RESULT="$(systemctl show "$SERVICE" --property=Result --value 2>/dev/null || true)"
EXIT_CODE="$(systemctl show "$SERVICE" --property=ExecMainStatus --value 2>/dev/null || true)"
AFTER_HASH="$(sha256sum "$STATUS" 2>/dev/null | awk '{print $1}')"
AFTER_HASH="${AFTER_HASH:-missing}"
readarray -t CONTROLLED_STATUS < <(python3 - "$STATUS" <<'PY'
from pathlib import Path
import json
import sys
try:
    value = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
except Exception:
    value = {}
print(value.get('publisherVersion', 'unknown'))
print(value.get('ok', 'unknown'))
print(value.get('returnCameraOk', 'unknown'))
print(value.get('returnCameraHealthStatus', 'unknown'))
PY
)
CONTROLLED_VERSION="${CONTROLLED_STATUS[0]:-unknown}"
CONTROLLED_OK="${CONTROLLED_STATUS[1]:-unknown}"
CONTROLLED_RETURN_OK="${CONTROLLED_STATUS[2]:-unknown}"
CONTROLLED_RETURN_HEALTH="${CONTROLLED_STATUS[3]:-unknown}"

if [ "$RESULT" != "success" ] || [ "$EXIT_CODE" != "0" ] || \
   [ "$CONTROLLED_VERSION" != "2.6" ] || [ "$CONTROLLED_OK" != "True" ] || \
   [ "$CONTROLLED_RETURN_OK" != "True" ] || [ "$AFTER_HASH" = "$BEFORE_HASH" ]; then
  echo "Controlled dual-camera publish verification failed."
  echo "Result: ${RESULT:-unknown}; exit: ${EXIT_CODE:-unknown}; version: ${CONTROLLED_VERSION:-unknown}; return: ${CONTROLLED_RETURN_OK:-unknown}; return health: ${CONTROLLED_RETURN_HEALTH:-unknown}"
  rollback
fi

echo "Controlled dual-camera publish: PASS"
echo "Re-enabling timer and refreshing health with the timer active..."
sudo systemctl enable --now "$TIMER"
sudo systemctl start "$SERVICE" || true
sleep 5

FINAL_RESULT="$(systemctl show "$SERVICE" --property=Result --value 2>/dev/null || true)"
FINAL_EXIT="$(systemctl show "$SERVICE" --property=ExecMainStatus --value 2>/dev/null || true)"
readarray -t FINAL_STATUS < <(python3 - "$STATUS" <<'PY'
from pathlib import Path
import json
import sys
try:
    value = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
except Exception:
    value = {}
print(value.get('publisherVersion', 'unknown'))
print(value.get('ok', 'unknown'))
print(value.get('healthStatus', 'unknown'))
print(value.get('localMonitorStatus', 'unknown'))
print(value.get('publishedAt', 'unknown'))
print(value.get('returnCameraOk', 'unknown'))
print(value.get('returnCameraHealthStatus', 'unknown'))
print(value.get('returnCameraLocalMonitorStatus', 'unknown'))
print(value.get('returnCameraPublishedAt', 'unknown'))
PY
)

FINAL_VERSION="${FINAL_STATUS[0]:-unknown}"
FINAL_OK="${FINAL_STATUS[1]:-unknown}"
FINAL_HEALTH="${FINAL_STATUS[2]:-unknown}"
FINAL_MONITOR="${FINAL_STATUS[3]:-unknown}"
FINAL_PUBLISHED="${FINAL_STATUS[4]:-unknown}"
FINAL_RETURN_OK="${FINAL_STATUS[5]:-unknown}"
FINAL_RETURN_HEALTH="${FINAL_STATUS[6]:-unknown}"
FINAL_RETURN_MONITOR="${FINAL_STATUS[7]:-unknown}"
FINAL_RETURN_PUBLISHED="${FINAL_STATUS[8]:-unknown}"

if [ "$FINAL_RESULT" != "success" ] || [ "$FINAL_EXIT" != "0" ] || \
   [ "$FINAL_VERSION" != "2.6" ] || [ "$FINAL_OK" != "True" ] || \
   [ "$FINAL_RETURN_OK" != "True" ]; then
  echo "Final timer-active dual-camera publish verification failed."
  rollback
fi

echo
echo "FINAL STATUS"
echo "Publisher version: $FINAL_VERSION"
echo "Overview publish successful: $FINAL_OK"
echo "Overview health: $FINAL_HEALTH"
echo "Overview local monitor: $FINAL_MONITOR"
echo "Overview published at: $FINAL_PUBLISHED"
echo "Return publish successful: $FINAL_RETURN_OK"
echo "Return health: $FINAL_RETURN_HEALTH"
echo "Return local monitor: $FINAL_RETURN_MONITOR"
echo "Return published at: $FINAL_RETURN_PUBLISHED"
echo "Timer active: $(systemctl is-active "$TIMER" 2>/dev/null || true)"
echo "Timer enabled: $(systemctl is-enabled "$TIMER" 2>/dev/null || true)"
echo "Calibration helper: $CALIBRATOR_TARGET"
echo
echo "UPDATE RESULT: PASS — PUBLISHER 2.6 ACTIVE"
