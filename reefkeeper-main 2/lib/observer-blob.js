// Reef Keeper Build 2F — private Vercel Blob storage for Aquarium Observer

import { get, put } from '@vercel/blob';
import { OBSERVER_IMAGE_PATH, OBSERVER_STATUS_PATH } from './observer-common.js';

const PRIVATE_OPTIONS = {
  access: 'private',
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 60
};

export async function writeObserverImage(image) {
  const body = image instanceof Uint8Array
    ? image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength)
    : image;
  return put(OBSERVER_IMAGE_PATH, body, {
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
  const result = await get(OBSERVER_STATUS_PATH, {
    access: 'private',
    useCache: false
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}

export async function readObserverImage() {
  return get(OBSERVER_IMAGE_PATH, {
    access: 'private',
    useCache: false
  });
}
