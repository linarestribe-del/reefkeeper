#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="/etc/reefkeeper-observer/publisher.json"
BACKUP_PATH="/etc/reefkeeper-observer/publisher.json.before-worker-9k-$(date +%Y%m%d-%H%M%S)"

if [[ $# -ne 1 ]]; then
  echo "Usage: bash configure-observer-worker-endpoint.sh https://YOUR-WORKER.workers.dev" >&2
  exit 2
fi

BASE_URL="${1%/}"
case "$BASE_URL" in
  https://*) ;;
  *) echo "Worker base URL must start with https://" >&2; exit 2 ;;
esac

ENDPOINT="$BASE_URL/api/observer-publish"
STATUS_ENDPOINT="$BASE_URL/api/observer-status"
HEALTH_URL="$BASE_URL/health"

python3 - <<PY
from pathlib import Path
import json
import shutil
import urllib.request
import sys

config_path = Path("$CONFIG_PATH")
backup_path = Path("$BACKUP_PATH")
base_url = "$BASE_URL"
endpoint = "$ENDPOINT"
health_url = "$HEALTH_URL"

if not config_path.exists():
    raise SystemExit(f"Missing publisher config: {config_path}")

with urllib.request.urlopen(health_url, timeout=20) as response:
    data = json.loads(response.read().decode('utf-8'))
if data.get('ok') is not True or data.get('backend') != 'cloudflare-worker-r2':
    raise SystemExit(f"Worker health check did not identify the verified 9K backend: {data}")

current = json.loads(config_path.read_text(encoding='utf-8'))
if not str(current.get('token') or '').strip():
    raise SystemExit('Publisher token is missing from the existing config; not modifying endpoint.')

shutil.copy2(config_path, backup_path)
current['endpoint'] = endpoint
current['observer_backend'] = 'cloudflare-worker-r2'
current['observer_backend_base_url'] = base_url
current['observer_backend_changed_at'] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
config_path.write_text(json.dumps(current, indent=2) + '\n', encoding='utf-8')
PY

sudo chown reefkeeper:reefkeeper "$CONFIG_PATH" 2>/dev/null || true
sudo chmod 640 "$CONFIG_PATH" 2>/dev/null || true

echo "REEF KEEPER OBSERVER WORKER ENDPOINT CONFIGURED"
echo "================================================"
echo "Backup: $BACKUP_PATH"
echo "Endpoint: $ENDPOINT"
echo "Status endpoint: $STATUS_ENDPOINT"
echo
echo "Publishing timers were not resumed by this script."
echo "After Vercel variables are set and the Worker endpoint is verified, resume manually if desired."
