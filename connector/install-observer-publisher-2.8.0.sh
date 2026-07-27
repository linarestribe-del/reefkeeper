#!/usr/bin/env bash
set -u

SERVICE="reefkeeper-observer-publish.service"
TIMER="reefkeeper-observer-publish.timer"
RETURN_CAPTURE_SERVICE="reefkeeper-return-capture.service"
STATUS="/mnt/reef-ssd/aquarium-observer/publish-status.json"
FILTER_CONFIG="/etc/reefkeeper-observer/filter-roller-monitoring.json"
OVERVIEW_MONITOR_CONFIG="/etc/reefkeeper-observer/monitoring.json"
RETURN_MONITOR_CONFIG="/etc/reefkeeper-observer/return-monitoring.json"
EXPECTED_PUBLISHER_SHA256="94fc6d91073a86659b6e070f99ef37022e2b12c080d0867191e07f93baa03687"
EXPECTED_CALIBRATOR_SHA256="4b1f63077953b10dd2204d7e2a5df57128a7f972f331fc71a466fd15234e7856"
EXPECTED_FILTER_CALIBRATOR_SHA256="d1bbde0b4178f11ee16daa285dcd1eedd6bf8f2b4899ff408c2353f84c32c151"
TMP_DIR="$(mktemp -d /tmp/reefkeeper-observer-2.8.0.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "REEF KEEPER OBSERVER PUBLISHER 2.8.0 INSTALLER"
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
FILTER_CALIBRATOR_TARGET="$TARGET_DIR/observer-filter-roll-calibrate.py"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TARGET}.before-2.8.0-${STAMP}.bak"
CALIBRATOR_BACKUP=""
FILTER_CALIBRATOR_BACKUP=""
FILTER_CONFIG_BACKUP=""

if [ -f "$CALIBRATOR_TARGET" ]; then
  CALIBRATOR_BACKUP="${CALIBRATOR_TARGET}.before-2.8.0-${STAMP}.bak"
fi
if [ -f "$FILTER_CALIBRATOR_TARGET" ]; then
  FILTER_CALIBRATOR_BACKUP="${FILTER_CALIBRATOR_TARGET}.before-2.8.0-${STAMP}.bak"
fi
if [ -f "$FILTER_CONFIG" ]; then
  FILTER_CONFIG_BACKUP="${FILTER_CONFIG}.before-2.8.0-${STAMP}.bak"
fi

echo "Active publisher file: $TARGET"
echo "Downloading verified Publisher 2.8.0 and calibration helpers..."

if ! python3 - "$TMP_DIR" "$EXPECTED_PUBLISHER_SHA256" "$EXPECTED_CALIBRATOR_SHA256" "$EXPECTED_FILTER_CALIBRATOR_SHA256" <<'PY'
from pathlib import Path
import hashlib
import sys
import urllib.request

output = Path(sys.argv[1])
expected = {
    'observer-publisher.py': sys.argv[2],
    'observer-water-level-calibrate.py': sys.argv[3],
    'observer-filter-roll-calibrate.py': sys.argv[4],
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
    url = f'{base}/connector/{filename}?v=4.3.55-9f'
    request = urllib.request.Request(url, headers={
        'User-Agent': 'ReefKeeper-Observer-Updater/2.8.0',
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
if "PUBLISHER_VERSION = '2.8.0'" not in (output / 'observer-publisher.py').read_text(encoding='utf-8'):
    raise SystemExit('Downloaded publisher is not version 2.8.0.')
if "--camera" not in (output / 'observer-water-level-calibrate.py').read_text(encoding='utf-8'):
    raise SystemExit('Downloaded water-level calibration helper is not dual-camera aware.')
if "outer-edge-consensus-v2" not in (output / 'observer-filter-roll-calibrate.py').read_text(encoding='utf-8'):
    raise SystemExit('Downloaded filter-roll calibration helper is not the consensus version.')
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

echo "Creating backup of the active publisher..."
if ! sudo cp -a "$TARGET" "$BACKUP" || ! sudo test -s "$BACKUP"; then
  echo "ERROR: Publisher backup could not be created."
  sudo systemctl enable --now "$TIMER"
  exit 1
fi
if [ -n "$CALIBRATOR_BACKUP" ]; then
  if ! sudo cp -a "$CALIBRATOR_TARGET" "$CALIBRATOR_BACKUP" || ! sudo test -s "$CALIBRATOR_BACKUP"; then
    echo "ERROR: Water-level calibration-helper backup could not be created."
    sudo systemctl enable --now "$TIMER"
    exit 1
  fi
fi
if [ -n "$FILTER_CALIBRATOR_BACKUP" ]; then
  if ! sudo cp -a "$FILTER_CALIBRATOR_TARGET" "$FILTER_CALIBRATOR_BACKUP" || ! sudo test -s "$FILTER_CALIBRATOR_BACKUP"; then
    echo "ERROR: Filter-roll calibration-helper backup could not be created."
    sudo systemctl enable --now "$TIMER"
    exit 1
  fi
fi
if [ -n "$FILTER_CONFIG_BACKUP" ]; then
  if ! sudo cp -a "$FILTER_CONFIG" "$FILTER_CONFIG_BACKUP" || ! sudo test -s "$FILTER_CONFIG_BACKUP"; then
    echo "ERROR: Filter-roll private configuration backup could not be created."
    sudo systemctl enable --now "$TIMER"
    exit 1
  fi
fi

echo "Installing Publisher 2.8.0..."
if ! sudo install -o root -g root -m 0755 "$TMP_DIR/observer-publisher.py" "$TARGET" || \
   ! sudo install -o root -g root -m 0755 "$TMP_DIR/observer-water-level-calibrate.py" "$CALIBRATOR_TARGET" || \
   ! sudo install -o root -g root -m 0755 "$TMP_DIR/observer-filter-roll-calibrate.py" "$FILTER_CALIBRATOR_TARGET"; then
  echo "Installation failed. Restoring the previous publisher..."
  sudo cp -a "$BACKUP" "$TARGET"
  if [ -n "$CALIBRATOR_BACKUP" ] && sudo test -f "$CALIBRATOR_BACKUP"; then
    sudo cp -a "$CALIBRATOR_BACKUP" "$CALIBRATOR_TARGET"
  fi
  if [ -n "$FILTER_CALIBRATOR_BACKUP" ] && sudo test -f "$FILTER_CALIBRATOR_BACKUP"; then
    sudo cp -a "$FILTER_CALIBRATOR_BACKUP" "$FILTER_CALIBRATOR_TARGET"
  else
    sudo rm -f "$FILTER_CALIBRATOR_TARGET"
  fi
  sudo systemctl enable --now "$TIMER"
  exit 1
fi

migrate_private_configs() {
  echo "Migrating private Observer configuration for maintenance-tolerant monitoring..."
  if ! sudo python3 - "$FILTER_CONFIG" "$OVERVIEW_MONITOR_CONFIG" "$RETURN_MONITOR_CONFIG" <<'PYMIG'
from pathlib import Path
import json
import os
import shutil
import sys
import tempfile

filter_path = Path(sys.argv[1])
monitor_paths = [Path(value) for value in sys.argv[2:]]

def atomic_write(path: Path, value: dict) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f'.{path.name}.', suffix='.partial', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(value, handle, indent=2)
            handle.write('\n')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

if filter_path.exists():
    value = json.loads(filter_path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise SystemExit('Filter-roll configuration must contain a JSON object.')
    value['measurement_hours_local'] = [9, 15]
    value['minimum_confidence'] = max(0.65, float(value.get('minimum_confidence') or 0.0))
    value['consensus_frames'] = 3
    value['minimum_consensus_frames'] = 2
    value['consensus_max_age_minutes'] = 20
    value['maximum_radius_deviation_px'] = 4.5
    value['maximum_radius_drop_fraction_per_day'] = 0.08
    value['minimum_large_change_fraction'] = 0.06
    value['large_change_confirmations'] = 2
    value['detector'] = 'outer-edge-consensus-v2'
    atomic_write(filter_path, value)
    shutil.chown(filter_path, user='root', group='reefkeeper')
    os.chmod(filter_path, 0o640)
    print(f'Filter-roll config migrated: {filter_path}')
else:
    print('Filter-roll config is not present; calibration remains required before tracking can run.')

for path in monitor_paths:
    if not path.exists():
        continue
    shutil.chown(path, user='root', group='reefkeeper')
    os.chmod(path, 0o640)
    print(f'Private monitor permissions verified: {path}')
PYMIG
  then
    echo "Private configuration migration failed."
    return 1
  fi

  if [ -f "$FILTER_CONFIG" ] && ! sudo -u reefkeeper test -r "$FILTER_CONFIG"; then
    echo "The publisher user still cannot read the filter-roll configuration."
    return 1
  fi
  return 0
}

rollback() {
  echo "Restoring the previous publisher backup..."
  sudo systemctl stop "$TIMER" 2>/dev/null || true
  sudo systemctl stop "$SERVICE" 2>/dev/null || true
  sudo cp -a "$BACKUP" "$TARGET"
  if [ -n "$CALIBRATOR_BACKUP" ] && sudo test -f "$CALIBRATOR_BACKUP"; then
    sudo cp -a "$CALIBRATOR_BACKUP" "$CALIBRATOR_TARGET"
  fi
  if [ -n "$FILTER_CALIBRATOR_BACKUP" ] && sudo test -f "$FILTER_CALIBRATOR_BACKUP"; then
    sudo cp -a "$FILTER_CALIBRATOR_BACKUP" "$FILTER_CALIBRATOR_TARGET"
  else
    sudo rm -f "$FILTER_CALIBRATOR_TARGET"
  fi
  if [ -n "$FILTER_CONFIG_BACKUP" ] && sudo test -f "$FILTER_CONFIG_BACKUP"; then
    sudo cp -a "$FILTER_CONFIG_BACKUP" "$FILTER_CONFIG"
  fi
  sudo systemctl enable --now "$TIMER"
  echo "UPDATE RESULT: ROLLED BACK TO PREVIOUS PUBLISHER"
  exit 1
}

if ! migrate_private_configs; then
  rollback
fi

refresh_return_capture() {
  echo "Refreshing the return-camera capture before publisher verification..."
  sudo systemctl reset-failed "$RETURN_CAPTURE_SERVICE" 2>/dev/null || true
  if ! sudo systemctl start "$RETURN_CAPTURE_SERVICE"; then
    echo "Return-camera capture service could not be started."
    return 1
  fi
  local result exit_code
  result="$(systemctl show "$RETURN_CAPTURE_SERVICE" --property=Result --value 2>/dev/null || true)"
  exit_code="$(systemctl show "$RETURN_CAPTURE_SERVICE" --property=ExecMainStatus --value 2>/dev/null || true)"
  if [ "$result" != "success" ] || [ "$exit_code" != "0" ]; then
    echo "Return-camera capture refresh failed: result=${result:-unknown}; exit=${exit_code:-unknown}"
    return 1
  fi
  return 0
}

CONTROLLED_ATTEMPT=1
CONTROLLED_PASS=false
while [ "$CONTROLLED_ATTEMPT" -le 2 ]; do
  if ! refresh_return_capture; then
    rollback
  fi

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
print(value.get('returnCameraError', 'unknown'))
PY
)
  CONTROLLED_VERSION="${CONTROLLED_STATUS[0]:-unknown}"
  CONTROLLED_OK="${CONTROLLED_STATUS[1]:-unknown}"
  CONTROLLED_RETURN_OK="${CONTROLLED_STATUS[2]:-unknown}"
  CONTROLLED_RETURN_HEALTH="${CONTROLLED_STATUS[3]:-unknown}"
  CONTROLLED_RETURN_ERROR="${CONTROLLED_STATUS[4]:-unknown}"

  if [ "$RESULT" = "success" ] && [ "$EXIT_CODE" = "0" ] && \
     [ "$CONTROLLED_VERSION" = "2.8.0" ] && [ "$CONTROLLED_OK" = "True" ] && \
     [ "$CONTROLLED_RETURN_OK" = "True" ] && [ "$AFTER_HASH" != "$BEFORE_HASH" ]; then
    CONTROLLED_PASS=true
    break
  fi

  echo "Controlled dual-camera publish attempt $CONTROLLED_ATTEMPT failed."
  echo "Result: ${RESULT:-unknown}; exit: ${EXIT_CODE:-unknown}; version: ${CONTROLLED_VERSION:-unknown}; return: ${CONTROLLED_RETURN_OK:-unknown}; return health: ${CONTROLLED_RETURN_HEALTH:-unknown}"
  echo "Return error: ${CONTROLLED_RETURN_ERROR:-unknown}"
  CONTROLLED_ATTEMPT=$((CONTROLLED_ATTEMPT + 1))
done

if [ "$CONTROLLED_PASS" != "true" ]; then
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
print(value.get('filterRollStatus', 'unknown'))
print(value.get('filterRollAvailable', 'unknown'))
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
FINAL_FILTER_ROLL_STATUS="${FINAL_STATUS[9]:-unknown}"
FINAL_FILTER_ROLL_AVAILABLE="${FINAL_STATUS[10]:-unknown}"

if [ "$FINAL_RESULT" != "success" ] || [ "$FINAL_EXIT" != "0" ] || \
   [ "$FINAL_VERSION" != "2.8.0" ] || [ "$FINAL_OK" != "True" ] || \
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
echo "Water-level calibration helper: $CALIBRATOR_TARGET"
echo "Filter-roll calibration helper: $FILTER_CALIBRATOR_TARGET"
echo "Filter-roll config readable by publisher: $(sudo -u reefkeeper test -r "$FILTER_CONFIG" 2>/dev/null && echo yes || echo not-configured)"
echo "Filter-roll status: $FINAL_FILTER_ROLL_STATUS"
echo "Filter-roll measurement available: $FINAL_FILTER_ROLL_AVAILABLE"
echo
echo "UPDATE RESULT: PASS — PUBLISHER 2.8.0 ACTIVE"
