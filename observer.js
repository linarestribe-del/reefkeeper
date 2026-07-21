// Reef Keeper Build 2H — Aquarium Observer historical comparison
// Full archives remain local. Only current and selected comparison images are published remotely.

(function installAquariumObserver() {
  'use strict';

  const STATUS_ENDPOINT = '/api/observer-status';
  const REFRESH_INTERVAL_MS = 60_000;
  const STALE_AFTER_MS = 15 * 60_000;
  const HISTORY_LABELS = {
    previous: 'Previous capture',
    dayAgo: 'About 24 hours ago',
    weekAgo: 'About 7 days ago'
  };
  const OBSERVER_ANALYSIS_PROMPT = [
    'Review this as one still image from my sump camera, not the display tank.',
    'Analyze only what the pixels visibly support and do not fill unseen areas with assumptions.',
    '',
    'Use these headings:',
    '1. Image usability — note sharpness, exposure or night-vision limits, glare, obstruction, camera angle, and whether the image is suitable for comparison.',
    '2. Urgent safety check — look for visible active leaks or overflow, unusually high or low water level, displaced plumbing or tubing, equipment out of position, or an apparent water/electrical hazard. If none is visible, say “No obvious urgent issue is visible in this frame,” not that the system is definitely safe.',
    '3. Equipment observations — discuss only equipment actually visible. Check the skimmer body, neck, cup, foam height, or overflow only where shown; filter-roller media position or apparent clogging; reactor bodies and visible bubbles or turbulence; ATO components; return equipment; and plumbing connections. Explicitly say when an item cannot be assessed from this view.',
    '4. Housekeeping observations — note visible salt creep, condensation, algae or biofilm, debris, microbubbles, unusual cloudiness, or obstruction.',
    '5. What cannot be determined — do not infer pump operation, actual flow rate, water chemistry, hidden leaks, or change over time from a single still. Do not claim a trend unless comparison images or data are provided.',
    '6. Recommended next check — give only one or two practical checks, ranked by urgency, based on visible evidence.',
    '',
    'Keep observations separate from possible concerns. Do not diagnose livestock or coral health unless they are clearly visible. Use my tank profile or Apex readings only in a separate Supporting context note and never as proof of what the image shows.'
  ].join('\n');

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
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

  function normalizeComparison(slot, value) {
    const item = value && typeof value === 'object' ? value : {};
    const captured = parseDate(item.capturedAt || item.captured_at);
    const imageUrl = String(item.imageUrl || '').trim();
    return {
      slot,
      label: HISTORY_LABELS[slot] || slot,
      available: item.available === true && Boolean(captured && imageUrl),
      captured,
      imageUrl,
      sizeBytes: Number(item.sizeBytes ?? item.size_bytes),
      imageVersion: String(item.imageVersion || item.capturedAt || '')
    };
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
      comparisons: {
        previous: normalizeComparison('previous', record.comparisons?.previous),
        dayAgo: normalizeComparison('dayAgo', record.comparisons?.dayAgo),
        weekAgo: normalizeComparison('weekAgo', record.comparisons?.weekAgo)
      },
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

  function setPlaceholderVisible(placeholder, visible) {
    placeholder.hidden = !visible;
    placeholder.classList.toggle('is-visible', visible);
    placeholder.style.display = visible ? 'flex' : 'none';
  }

  function updateImage(imageId, placeholderId, timeId, record) {
    const image = byId(imageId);
    const placeholder = byId(placeholderId);
    const time = byId(timeId);
    if (!image || !placeholder) return;

    if (record.imageUrl) {
      const separator = record.imageUrl.includes('?') ? '&' : '?';
      const cacheKey = record.captured?.getTime() || Date.now();
      setPlaceholderVisible(placeholder, false);
      image.hidden = true;
      image.onload = () => { setPlaceholderVisible(placeholder, false); image.hidden = false; };
      image.onerror = () => { image.hidden = true; setPlaceholderVisible(placeholder, true); };
      image.src = `${record.imageUrl}${separator}rk=${encodeURIComponent(cacheKey)}`;
      if (time) {
        time.textContent = formatCaptureTime(record.captured?.toISOString());
        time.hidden = false;
      }
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      setPlaceholderVisible(placeholder, true);
      if (time) time.hidden = true;
    }
  }

  function renderHistoryOptions(record) {
    const summary = byId('observer-history-summary');
    const available = Object.values(record.comparisons).filter(item => item.available);
    if (summary) {
      summary.textContent = available.length
        ? `${available.length} historical comparison${available.length === 1 ? '' : 's'} ready.`
        : 'Historical comparison images have not been published yet.';
    }

    for (const slot of Object.keys(HISTORY_LABELS)) {
      const item = record.comparisons[slot];
      const button = byId(`observer-compare-${slot}`);
      const time = byId(`observer-compare-${slot}-time`);
      if (button) button.disabled = !record.imageUrl || !item.available;
      if (time) time.textContent = item.available ? formatCaptureTime(item.captured?.toISOString()) : 'Not available yet';
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
    renderHistoryOptions(record);

    const note = byId('observer-connection-note');
    if (note) {
      if (record.ok && !record.stale) {
        note.innerHTML = '<strong>Observer bridge connected.</strong><span>Reef Keeper is receiving the current image and selected historical comparison images. The full archive remains on the Raspberry Pi storage drive.</span>';
      } else if (record.stale) {
        note.innerHTML = '<strong>The last camera update is stale.</strong><span>The Pi may be offline, the camera may be unavailable, or the remote bridge may have stopped. Local captures can continue even when the app cannot receive an update.</span>';
      } else if (record.configured) {
        const safeMessage = record.message ? record.message.replace(/[<>]/g, '') : 'The Observer bridge has not reported a healthy capture.';
        note.innerHTML = `<strong>Observer bridge needs attention.</strong><span>${safeMessage}</span>`;
      } else {
        note.innerHTML = '<strong>App-side setup is ready.</strong><span>The Pi keeps full-resolution captures locally. Install the Build 2H publisher update to send the current image plus selected comparison frames.</span>';
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
        if (event && typeof showToast === 'function') showToast(record.ok ? '📹 Observer status refreshed' : 'Observer bridge is not connected yet');
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

  async function imageAttachmentFromUrl(url, name) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Image returned HTTP ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
    const dataUrl = await prepareAskAiImage(file);
    return { kind: 'image', name, type: 'image/jpeg', dataUrl, originalType: blob.type || 'image/jpeg' };
  }

  function openImagesInChat(images, prompt, toast) {
    attachedFileContext = {
      kind: 'image-set',
      name: images.length === 1 ? images[0].name : `${images.length} Observer photos`,
      images
    };
    updateAttachmentStatus();
    if (typeof window.rkDirectGo === 'function') window.rkDirectGo('chat');
    else if (typeof window.showPage === 'function') window.showPage('chat');
    const input = byId('chat-input');
    if (input) {
      input.value = prompt;
      input.focus();
      try { autoResize(input); } catch (_) {}
    }
    if (typeof showToast === 'function') showToast(toast);
  }

  async function analyzeLatestObserverCapture() {
    if (!snapshot?.imageUrl) {
      if (typeof showToast === 'function') showToast('Remote image is not available yet');
      return;
    }
    const button = byId('observer-analyze-btn');
    if (button) { button.disabled = true; button.textContent = 'Preparing image…'; }
    try {
      const image = await imageAttachmentFromUrl(snapshot.imageUrl, 'aquarium-observer-latest.jpg');
      openImagesInChat([image], OBSERVER_ANALYSIS_PROMPT, '📹 Latest Observer capture ready for AI');
    } catch (error) {
      console.warn('Could not prepare Observer image', error);
      if (typeof showToast === 'function') showToast(`⚠️ ${error.message || 'Could not load Observer image'}`);
    } finally {
      if (button) { button.textContent = 'Analyze latest capture'; button.disabled = !snapshot?.imageUrl; }
    }
  }

  async function compareObserverHistory(slot) {
    const comparison = snapshot?.comparisons?.[slot];
    if (!snapshot?.imageUrl || !comparison?.available) {
      if (typeof showToast === 'function') showToast('That historical comparison is not available yet');
      return;
    }
    const button = byId(`observer-compare-${slot}`);
    const originalText = button?.textContent || 'Compare';
    if (button) { button.disabled = true; button.textContent = 'Preparing…'; }
    try {
      const [older, latest] = await Promise.all([
        imageAttachmentFromUrl(comparison.imageUrl, `observer-${slot}-${comparison.captured?.toISOString().slice(0, 10) || 'older'}.jpg`),
        imageAttachmentFromUrl(snapshot.imageUrl, 'observer-latest.jpg')
      ]);
      const olderTime = formatCaptureTime(comparison.captured?.toISOString());
      const latestTime = formatCaptureTime(snapshot.captured?.toISOString());
      const prompt = [
        `Compare these two sump-camera images in chronological order: Image 1 was captured ${olderTime}; Image 2 was captured ${latestTime}.`,
        'First decide whether lighting, night vision, framing, camera movement, blur, obstruction, or reflections make the comparison unreliable.',
        'Then describe only visible changes between Image 1 and Image 2.',
        'Check water level, skimmer foam or cup condition, filter roller position, visible plumbing or tubing, equipment position, salt creep, condensation, algae or biofilm, debris, microbubbles, cloudiness, and possible leak or overflow evidence—but only where visible in both frames.',
        'Separate: Confirmed visible change; Possible change needing verification; No meaningful visible change; What cannot be determined.',
        'Do not infer pump operation, flow rate, water chemistry, or hidden leaks. Do not call normal lighting differences a tank change.',
        'End with no more than two practical next checks, ranked by urgency.'
      ].join('\n\n');
      openImagesInChat([older, latest], prompt, `🆚 ${comparison.label} and latest capture ready`);
    } catch (error) {
      console.warn('Could not prepare Observer comparison', error);
      if (typeof showToast === 'function') showToast(`⚠️ ${error.message || 'Could not load comparison images'}`);
    } finally {
      if (button) { button.textContent = originalText; button.disabled = !snapshot?.imageUrl || !comparison?.available; }
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
  window.compareObserverHistory = compareObserverHistory;
  window.ReefKeeperObserver = { refresh: refreshAquariumObserver, getSnapshot: () => snapshot, endpoint: STATUS_ENDPOINT };

  const initialize = () => {
    renderObserver(normalizeRecord({ configured: false, ok: false }));
    refreshAquariumObserver();
    startRefreshLoop();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
