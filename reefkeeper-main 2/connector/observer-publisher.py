#!/usr/bin/env python3
"""Publish the latest Aquarium Observer capture to Reef Keeper.

Expected configuration file: /etc/reefkeeper-observer/publisher.json
{
  "endpoint": "https://reefkeeper.vercel.app/api/observer-publish",
  "token": "...",
  "camera_label": "Sump camera",
  "resolution": "1280×720",
  "capture_interval_minutes": 5
}

The script never sends camera credentials, RTSP URLs, local IP addresses, or local paths.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONFIG_PATH = Path("/etc/reefkeeper-observer/publisher.json")
BASE_DIR = Path("/mnt/reef-ssd/aquarium-observer")
IMAGE_PATH = BASE_DIR / "latest.jpg"
CAPTURE_STATUS_PATH = BASE_DIR / "status.json"
PUBLISH_STATUS_PATH = BASE_DIR / "publish-status.json"
MAX_IMAGE_BYTES = 2 * 1024 * 1024
PUBLISHER_VERSION = "1.0"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path.name} must contain a JSON object")
    return data


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".partial", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
            handle.write("\n")
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def safe_text(value: Any, limit: int = 160) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def build_payload(config: dict[str, Any], capture: dict[str, Any], image: bytes) -> dict[str, Any]:
    disk = shutil.disk_usage(BASE_DIR)
    used_percent = round(((disk.total - disk.free) / disk.total) * 100, 2) if disk.total else 0

    return {
        "publisherVersion": PUBLISHER_VERSION,
        "ok": capture.get("ok") is True,
        "capturedAt": capture.get("captured_at") or capture.get("capturedAt"),
        "cameraLabel": safe_text(config.get("camera_label") or "Sump camera", 80),
        "stream": safe_text(capture.get("stream") or "stream2", 30),
        "resolution": safe_text(config.get("resolution") or "1280×720", 40),
        "captureIntervalMinutes": int(config.get("capture_interval_minutes") or 5),
        "sizeBytes": len(image),
        "durationSeconds": capture.get("duration_seconds") or capture.get("durationSeconds") or 0,
        "storage": {
            "label": safe_text(config.get("storage_label") or "Local Pi drive", 80),
            "totalBytes": disk.total,
            "availableBytes": disk.free,
            "usedPercent": used_percent,
        },
        "message": safe_text(capture.get("error") or "", 240),
        "imageContentType": "image/jpeg",
        "imageBase64": base64.b64encode(image).decode("ascii"),
    }


def last_published_capture() -> str:
    try:
        status = read_json(PUBLISH_STATUS_PATH)
        if status.get("ok") is True:
            return str(status.get("capturedAt") or "")
    except (FileNotFoundError, ValueError, json.JSONDecodeError, OSError):
        pass
    return ""


def main() -> int:
    started_at = utc_now()
    try:
        config = read_json(CONFIG_PATH)
        endpoint = str(config.get("endpoint") or "").strip()
        token = str(config.get("token") or "").strip()
        if not endpoint.startswith("https://"):
            raise ValueError("Publisher endpoint must use HTTPS")
        if not token:
            raise ValueError("Publisher token is missing")

        capture = read_json(CAPTURE_STATUS_PATH)
        captured_at = str(capture.get("captured_at") or capture.get("capturedAt") or "")
        if not captured_at:
            raise ValueError("Capture status is missing captured_at")

        if captured_at == last_published_capture():
            print(f"PUBLISH_SKIPPED already published {captured_at}")
            return 0

        image = IMAGE_PATH.read_bytes()
        if not image:
            raise ValueError("latest.jpg is empty")
        if len(image) > MAX_IMAGE_BYTES:
            raise ValueError(f"latest.jpg exceeds {MAX_IMAGE_BYTES} bytes")
        if not image.startswith(b"\xff\xd8\xff"):
            raise ValueError("latest.jpg is not a JPEG image")

        payload = build_payload(config, capture, image)
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": f"ReefKeeperObserverPublisher/{PUBLISHER_VERSION}",
            },
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=45) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            result = json.loads(response_body) if response_body else {}
            if response.status != 200 or result.get("ok") is not True:
                raise RuntimeError(f"Publish returned HTTP {response.status}")

        write_json_atomic(
            PUBLISH_STATUS_PATH,
            {
                "ok": True,
                "capturedAt": captured_at,
                "publishedAt": result.get("publishedAt") or utc_now(),
                "sizeBytes": len(image),
                "publisherVersion": PUBLISHER_VERSION,
            },
        )
        print(f"PUBLISH_OK {captured_at} {len(image)} bytes")
        return 0

    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:400]
        message = f"HTTP {error.code}: {body or error.reason}"
    except urllib.error.URLError as error:
        message = f"Network error: {error.reason}"
    except Exception as error:  # noqa: BLE001 - system service must record all failures
        message = str(error)

    write_json_atomic(
        PUBLISH_STATUS_PATH,
        {
            "ok": False,
            "failedAt": utc_now(),
            "startedAt": started_at,
            "error": safe_text(message, 400),
            "publisherVersion": PUBLISHER_VERSION,
        },
    )
    print(f"PUBLISH_FAILED: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
