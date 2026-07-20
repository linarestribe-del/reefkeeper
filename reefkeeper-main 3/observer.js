// Reef Keeper Build 2F — Aquarium Observer publishing interface
// Full camera archives remain local. This controller reads only selected remote status and image references.

(function installAquariumObserver() {
  'use strict';

  const STATUS_ENDPOINT = '/api/observer-status';
  const REFRESH_INTERVAL_MS = 60_000;
  const STALE_AFTER_MS = 15 * 60_000;
  let snapshot = null;
  let refreshTimer = null;
  let refreshInFlight = null;

  function byId(id) { return document.getElementById(id); }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function captureDate(record) {
    return parseDate(record?.capturedAt || record?.captured_at || record?.capturedAtLocal || record?.captured_at_local);
  }

  function formatCaptureTime(value) {
    const date = parseDate(value);
    if (!date) return '—';
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function formatAge(date) {
    if (!date) return '—';
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function normalizeRecord(payload) {
    const record = payload && typeof payload === 'object' ? payload : {};
    const captured = captureDate(record);
    const imageUrl = String(record.thumbnailUrl || record.imageUrl || record.latestImageUrl || '').trim();
    const configured = record.configured === true || Boolean(record.receivedAt || captured || imageUrl);
    const sourceOk = record.ok === true;
    const ageMs = captured ? Date.now() - captured.getTime() : Number.POSITIVE_INFINITY;
    const stale = sourceOk && captured && ageMs > STALE_AFTER_MS;

    let state = 'pending';
    let label = 'Not connected';
    if (configured && sourceOk && !stale) { state = 'online'; label = 'Online'; }
    else if (configured && sourceOk && stale) { state = 'stale'; label = 'Stale'; }
    else if (configured && record.ok === false) { state = 'offline'; label = 'Offline'; }

    return {
      raw: record,
      configured,
      ok: sourceOk,
      stale,
      state,
      label,
      captured,
      imageUrl,
      receivedAt: parseDate(record.receivedAt),
      cameraLabel: String(record.cameraLabel || record.camera?.label || 'Sump camera'),
      stream: String(record.stream || record.camera?.stream || 'stream2'),
      resolution: String(record.resolution || record.camera?.resolution || '1280×720'),
      intervalMinutes: Number(record.captureIntervalMinutes || record.intervalMinutes || 5) || 5,
      sizeBytes: Number(record.sizeBytes ?? record.size_bytes),
      storageLabel: String(record.storage?.label || record.storageLabel || 'Local Pi drive'),
      message: String(record.message || record.error || '')
    };
  }

  function setBadge(id, record) {
    const badge = byId(id);
    if (!badge) return;
    badge.className = `observer-state-badge ${record.state}`;
    badge.textContent = record.label;
  }

  function updateImage(imageId, placeholderId, timeId, record) {
    const image = byId(imageId);
    const placeholder = byId(placeholderId);
    const time = byId(timeId);
    if (!image || !placeholder) return;

    if (record.imageUrl) {
      const separator = record.imageUrl.includes('?') ? '&' : '?';
      const cacheKey = record.captured?.getTime() || Date.now();
      image.onload = () => {
        image.hidden = false;
        placeholder.hidden = true;
      };
      image.onerror = () => {
        image.hidden = true;
        placeholder.hidden = false;
      };
      image.src = `${record.imageUrl}${separator}rk=${encodeURIComponent(cacheKey)}`;
      if (time) {
        time.textContent = formatCaptureTime(record.captured?.toISOString());
        time.hidden = false;
      }
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      placeholder.hidden = false;
      if (time) time.hidden = true;
    }
  }

  function renderObserver(record) {
    snapshot = record;
    const captureIso = record.captured?.toISOString() || '';
    const capturedLabel = formatCaptureTime(captureIso);
    const ageLabel = formatAge(record.captured);
    const intervalLabel = `Every ${record.intervalMinutes} min`;

    setBadge('observer-preview-badge', record);
    setBadge('observer-detail-badge', record);

    updateImage('observer-preview-image', 'observer-preview-placeholder', 'observer-preview-image-time', record);
    updateImage('observer-detail-image', 'observer-detail-placeholder', 'observer-detail-image-time', record);

    setText('observer-preview-captured', capturedLabel);
    setText('observer-preview-age', ageLabel);
    setText('observer-preview-interval', intervalLabel);

    setText('observer-detail-status', record.label);
    setText('observer-detail-captured', capturedLabel);
    setText('observer-detail-age', ageLabel);
    setText('observer-detail-interval', `${record.intervalMinutes} minutes`);
    setText('observer-detail-camera', record.cameraLabel);
    setText('observer-detail-stream', `${record.stream} · ${record.resolution}`);
    setText('observer-detail-size', formatBytes(record.sizeBytes));
    setText('observer-detail-storage', record.storageLabel);

    const note = byId('observer-connection-note');
    if (note) {
      if (record.ok && !record.stale) {
        note.innerHTML = '<strong>Observer bridge connected.</strong><span>Reef Keeper is receiving sanitized camera status and the current selected image through the publishing bridge. Full-resolution archives remain on the Raspberry Pi storage drive.</span>';
      } else if (record.stale) {
        note.innerHTML = '<strong>The last camera update is stale.</strong><span>The Pi may be offline, the camera may be unavailable, or the remote bridge may have stopped. Local captures can continue even when the app cannot receive an update.</span>';
      } else if (record.configured) {
        const safeMessage = record.message ? record.message.replace(/[<>]/g, '') : 'The Observer bridge has not reported a healthy capture.';
        note.innerHTML = `<strong>Observer bridge needs attention.</strong><span>${safeMessage}</span>`;
      } else {
        note.innerHTML = '<strong>App-side setup is ready.</strong><span>The Pi keeps full-resolution captures on the local ext4 drive. Connect the publishing service to send only sanitized status and the current selected image without exposing camera credentials or the home-network address.</span>';
      }
    }

    const analyze = byId('observer-analyze-btn');
    if (analyze) analyze.disabled = !record.imageUrl;
  }

  async function fetchObserverStatus() {
    const response = await fetch(STATUS_ENDPOINT, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Observer status returned HTTP ${response.status}`);
    return normalizeRecord(data);
  }

  async function refreshAquariumObserver(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (refreshInFlight) return refreshInFlight;

    const buttons = Array.from(document.querySelectorAll('[onclick^="refreshAquariumObserver"]'));
    buttons.forEach(button => { button.disabled = true; });

    refreshInFlight = (async () => {
      try {
        const record = await fetchObserverStatus();
        renderObserver(record);
        if (event && typeof showToast === 'function') {
          showToast(record.ok ? '📹 Observer status refreshed' : 'Observer bridge is not connected yet');
        }
        return record;
      } catch (error) {
        const record = normalizeRecord({ configured: true, ok: false, error: error.message || String(error) });
        renderObserver(record);
        if (event && typeof showToast === 'function') showToast('⚠️ Could not refresh Observer status');
        return record;
      } finally {
        refreshInFlight = null;
        buttons.forEach(button => { button.disabled = false; });
      }
    })();

    return refreshInFlight;
  }

  function openAquariumObserver() {
    if (typeof window.rkDirectGo === 'function') window.rkDirectGo('observer');
    else if (typeof window.showPage === 'function') window.showPage('observer');

    document.querySelectorAll('.nav-btn').forEach(button => button.classList.remove('active'));
    document.querySelector('.nav-btn[data-workspace="vision"]')?.classList.add('active');
    setTimeout(() => refreshAquariumObserver(), 30);
  }

  async function analyzeLatestObserverCapture() {
    if (!snapshot?.imageUrl) {
      if (typeof showToast === 'function') showToast('Remote image is not available yet');
      return;
    }

    const button = byId('observer-analyze-btn');
    if (button) { button.disabled = true; button.textContent = 'Preparing image…'; }

    try {
      const response = await fetch(snapshot.imageUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Image returned HTTP ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], 'aquarium-observer-latest.jpg', { type: blob.type || 'image/jpeg' });
      const dataUrl = await prepareAskAiImage(file);

      attachedFileContext = {
        kind: 'image',
        name: file.name,
        type: 'image/jpeg',
        dataUrl,
        originalType: blob.type || 'image/jpeg'
      };
      updateAttachmentStatus();

      if (typeof window.rkDirectGo === 'function') window.rkDirectGo('chat');
      else if (typeof window.showPage === 'function') window.showPage('chat');

      const input = byId('chat-input');
      if (input) {
        input.value = 'Analyze this Aquarium Observer sump-camera capture. Describe only what is visibly supported, assess image quality and comparability first, and separate observations from possible concerns. Consider skimmer foam level, roller condition, water level, leaks or salt creep, reactor flow, equipment state, obstruction, and camera movement. Use my tank context and Apex data only as supporting evidence, not as proof of what the image shows.';
        input.focus();
        try { autoResize(input); } catch (_) {}
      }
      if (typeof showToast === 'function') showToast('📹 Latest Observer capture ready for AI');
    } catch (error) {
      console.warn('Could not prepare Observer image', error);
      if (typeof showToast === 'function') showToast(`⚠️ ${error.message || 'Could not load Observer image'}`);
    } finally {
      if (button) {
        button.textContent = 'Analyze latest capture';
        button.disabled = !snapshot?.imageUrl;
      }
    }
  }

  function startRefreshLoop() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      const active = document.querySelector('.page.active');
      if (active?.id === 'page-vision' || active?.id === 'page-observer') refreshAquariumObserver();
      else if (snapshot?.captured) renderObserver(snapshot);
    }, REFRESH_INTERVAL_MS);
  }

  window.openAquariumObserver = openAquariumObserver;
  window.refreshAquariumObserver = refreshAquariumObserver;
  window.analyzeLatestObserverCapture = analyzeLatestObserverCapture;
  window.ReefKeeperObserver = {
    refresh: refreshAquariumObserver,
    getSnapshot: () => snapshot,
    endpoint: STATUS_ENDPOINT
  };

  const initialize = () => {
    renderObserver(normalizeRecord({ configured: false, ok: false }));
    refreshAquariumObserver();
    startRefreshLoop();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
