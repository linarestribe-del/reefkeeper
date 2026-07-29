#!/usr/bin/env bash
set -u

SERVICE="reefkeeper-observer-timelapse.service"
TIMER="reefkeeper-observer-timelapse.timer"
STATUS="/mnt/reef-ssd/aquarium-observer/timelapse/status.json"
EXPECTED_BUILDER_SHA256="99d984aa68a80f52cfaa9ac950ac27122db09cfa013274b831ed20ebf2f9298e"
TMP_DIR="$(mktemp -d /tmp/reefkeeper-timelapse-1.2.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "REEF KEEPER OBSERVER TIMELAPSE BUILDER 1.2 INSTALLER"
echo "====================================================="
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
    if 'timelapse-builder' in candidate.name and candidate.suffix == '.py':
        print(candidate)
        break
PY
)"

if [ -z "$TARGET" ] || [ ! -f "$TARGET" ]; then
  echo "ERROR: Could not identify the active timelapse builder from systemd."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TARGET}.before-1.2-${STAMP}.bak"

echo "Active builder file: $TARGET"
echo "Downloading verified Timelapse Builder 1.2..."

if ! python3 - "$TMP_DIR" "$EXPECTED_BUILDER_SHA256" <<'PY'
from pathlib import Path
import hashlib
import sys
import urllib.request

output = Path(sys.argv[1])
expected = sys.argv[2]
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
url = f'{base}/connector/timelapse-builder.py?v=4.3.58-9g'
request = urllib.request.Request(url, headers={
    'User-Agent': 'ReefKeeper-Timelapse-Updater/1.2',
    'Cache-Control': 'no-cache',
})
with urllib.request.urlopen(request, timeout=30) as response:
    source = response.read()
digest = hashlib.sha256(source).hexdigest()
if digest != expected:
    raise SystemExit(f'timelapse-builder.py checksum did not match the verified release. Received {digest}')
text = source.decode('utf-8')
compile(text, 'timelapse-builder.py', 'exec')
if "BUILDER_VERSION = '1.2'" not in text or 'RETURN_CAPTURES_DIR' not in text:
    raise SystemExit('Downloaded builder is not the return-chamber timelapse version.')
(output / 'timelapse-builder.py').write_bytes(source)
print('Download, checksum, and Python syntax: PASS')
PY
then
  echo "UPDATE RESULT: DOWNLOAD OR VERIFICATION FAILED"
  exit 1
fi

echo "Stopping automatic timelapse builds..."
sudo systemctl stop "$TIMER"
sudo systemctl stop "$SERVICE" 2>/dev/null || true

echo "Creating backup of the active builder..."
if ! sudo cp -a "$TARGET" "$BACKUP" || ! sudo test -s "$BACKUP"; then
  echo "ERROR: Timelapse builder backup could not be created."
  sudo systemctl enable --now "$TIMER"
  exit 1
fi

echo "Installing Timelapse Builder 1.2..."
if ! sudo install -o root -g root -m 0755 "$TMP_DIR/timelapse-builder.py" "$TARGET"; then
  echo "Installation failed. Restoring the previous builder..."
  sudo cp -a "$BACKUP" "$TARGET"
  sudo systemctl enable --now "$TIMER"
  exit 1
fi

echo "Ensuring return-chamber timelapse directory exists..."
sudo install -d -o reefkeeper -g reefkeeper -m 0755 /mnt/reef-ssd/aquarium-observer/return-chamber/timelapse
sudo install -d -o reefkeeper -g reefkeeper -m 0755 /mnt/reef-ssd/aquarium-observer/timelapse

echo "Running controlled dual-camera timelapse build..."
if ! sudo systemctl start "$SERVICE"; then
  echo "Controlled build failed. Restoring previous builder..."
  sudo cp -a "$BACKUP" "$TARGET"
  sudo systemctl start "$SERVICE" 2>/dev/null || true
  sudo systemctl enable --now "$TIMER"
  echo "UPDATE RESULT: ROLLED BACK"
  exit 1
fi

echo "Re-enabling daily timelapse timer..."
sudo systemctl enable --now "$TIMER" >/dev/null

echo
echo "FINAL STATUS"
python3 - <<'PY'
from pathlib import Path
import importlib.util
import json
import subprocess

builder_path = Path('/opt/reefkeeper-observer/timelapse-builder.py')
spec = importlib.util.spec_from_file_location('timelapse_builder', builder_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
status_path = Path('/mnt/reef-ssd/aquarium-observer/timelapse/status.json')
status = json.loads(status_path.read_text(encoding='utf-8')) if status_path.exists() else {}
print(f'Builder version: {getattr(module, "BUILDER_VERSION", "unknown")}')
print(f'Status file: {status_path}')
for camera in ('overview', 'return'):
    camera_state = (status.get('cameras') or {}).get(camera) or (status if camera == 'overview' else {})
    print(f'{camera} weekly state: {(camera_state.get("week") or {}).get("state")}')
    print(f'{camera} monthly state: {(camera_state.get("month") or {}).get("state")}')
print('Return weekly file exists:', Path('/mnt/reef-ssd/aquarium-observer/return-chamber/timelapse/weekly-latest.mp4').exists())
print('Timer active:', subprocess.run(['systemctl', 'is-active', 'reefkeeper-observer-timelapse.timer'], capture_output=True, text=True).stdout.strip())
print('Timer enabled:', subprocess.run(['systemctl', 'is-enabled', 'reefkeeper-observer-timelapse.timer'], capture_output=True, text=True).stdout.strip())
PY

echo
echo "UPDATE RESULT: PASS — TIMELAPSE BUILDER 1.2 ACTIVE"
