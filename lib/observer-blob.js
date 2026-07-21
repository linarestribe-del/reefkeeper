// Reef Keeper Build 2L — private Vercel Blob storage for images, status, summaries, alerts, and timelapses

import { get, put } from '@vercel/blob';
import { OBSERVER_IMAGE_SLOTS, OBSERVER_STATUS_PATH, OBSERVER_TIMELAPSE_SLOTS, normalizeObserverSlot, normalizeObserverTimelapseSlot } from './observer-common.js';

export const OBSERVER_DAILY_SUMMARY_PATH = 'aquarium-observer/daily-summary.json';
export const OBSERVER_ALERTS_PATH = 'aquarium-observer/change-alerts.json';
export const OBSERVER_TIMELAPSES_PATH = 'aquarium-observer/timelapses.json';

const PRIVATE_OPTIONS = {
  access: 'private',
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 60
};

export async function writeObserverImage(image, slot = 'latest') {
  const normalizedSlot = normalizeObserverSlot(slot);
  if (!normalizedSlot) throw new Error('Unknown Observer image slot.');
  const body = image instanceof Uint8Array
    ? image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength)
    : image;
  return put(OBSERVER_IMAGE_SLOTS[normalizedSlot], body, {
    ...PRIVATE_OPTIONS,
    contentType: 'image/jpeg'
  });
}

export async function writeObserverStatus(record) {
  return put(OBSERVER_STATUS_PATH, JSON.stringify(record), {
    ...PRIVATE_OPTIONS,
    contentType: 'application/json'
  });
}

export async function readObserverStatus() {
  const result = await get(OBSERVER_STATUS_PATH, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}

export async function readObserverImage(slot = 'latest') {
  const normalizedSlot = normalizeObserverSlot(slot);
  if (!normalizedSlot) return null;
  return get(OBSERVER_IMAGE_SLOTS[normalizedSlot], { access: 'private', useCache: false });
}


export async function writeObserverDailySummary(record) {
  return put(OBSERVER_DAILY_SUMMARY_PATH, JSON.stringify(record), {
    ...PRIVATE_OPTIONS,
    contentType: 'application/json'
  });
}

export async function readObserverDailySummary() {
  const result = await get(OBSERVER_DAILY_SUMMARY_PATH, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}


export async function writeObserverAlerts(record) {
  return put(OBSERVER_ALERTS_PATH, JSON.stringify(record), {
    ...PRIVATE_OPTIONS,
    contentType: 'application/json'
  });
}

export async function readObserverAlerts() {
  const result = await get(OBSERVER_ALERTS_PATH, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}


export async function writeObserverTimelapse(video, slot) {
  const normalizedSlot = normalizeObserverTimelapseSlot(slot);
  if (!normalizedSlot) throw new Error('Unknown Observer timelapse slot.');
  const body = video instanceof Uint8Array
    ? video.buffer.slice(video.byteOffset, video.byteOffset + video.byteLength)
    : video;
  return put(OBSERVER_TIMELAPSE_SLOTS[normalizedSlot], body, {
    ...PRIVATE_OPTIONS,
    contentType: 'video/mp4'
  });
}

export async function readObserverTimelapse(slot) {
  const normalizedSlot = normalizeObserverTimelapseSlot(slot);
  if (!normalizedSlot) return null;
  return get(OBSERVER_TIMELAPSE_SLOTS[normalizedSlot], { access: 'private', useCache: false });
}

export async function writeObserverTimelapseFeed(record) {
  return put(OBSERVER_TIMELAPSES_PATH, JSON.stringify(record), {
    ...PRIVATE_OPTIONS,
    contentType: 'application/json'
  });
}

export async function readObserverTimelapseFeed() {
  const result = await get(OBSERVER_TIMELAPSES_PATH, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}
