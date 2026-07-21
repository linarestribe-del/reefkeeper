// Reef Keeper Build 2H — private Vercel Blob storage for current and comparison images

import { get, put } from '@vercel/blob';
import { OBSERVER_IMAGE_SLOTS, OBSERVER_STATUS_PATH, normalizeObserverSlot } from './observer-common.js';

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
