// Reef Keeper Maintenance 8A — private Cloudflare R2 storage for Observer media and metadata

import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  OBSERVER_IMAGE_SLOTS,
  OBSERVER_STATUS_PATH,
  OBSERVER_TIMELAPSE_SLOTS,
  normalizeObserverSlot,
  normalizeObserverTimelapseSlot
} from './observer-common.js';

export const OBSERVER_DAILY_SUMMARY_PATH = 'aquarium-observer/daily-summary.json';
export const OBSERVER_ALERTS_PATH = 'aquarium-observer/change-alerts.json';
export const OBSERVER_TIMELAPSES_PATH = 'aquarium-observer/timelapses.json';

const REGION = 'auto';
const SERVICE = 's3';
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

function cleanEnvironmentValue(name) {
  return String(process.env[name] || '').trim();
}

function r2Config() {
  const endpoint = cleanEnvironmentValue('REEF_OBSERVER_R2_ENDPOINT').replace(/\/+$/, '');
  const accessKeyId = cleanEnvironmentValue('REEF_OBSERVER_R2_ACCESS_KEY_ID');
  const secretAccessKey = cleanEnvironmentValue('REEF_OBSERVER_R2_SECRET_ACCESS_KEY');
  const bucket = cleanEnvironmentValue('REEF_OBSERVER_R2_BUCKET');

  if (!endpoint.startsWith('https://')) {
    throw new Error('REEF_OBSERVER_R2_ENDPOINT must be an HTTPS Cloudflare R2 S3 endpoint.');
  }
  if (!accessKeyId) throw new Error('REEF_OBSERVER_R2_ACCESS_KEY_ID is missing.');
  if (!secretAccessKey) throw new Error('REEF_OBSERVER_R2_SECRET_ACCESS_KEY is missing.');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(bucket)) {
    throw new Error('REEF_OBSERVER_R2_BUCKET is missing or invalid.');
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalObjectPath(bucket, key) {
  const segments = [bucket, ...String(key || '').split('/')].map(rfc3986);
  return `/${segments.join('/')}`;
}

function signingKey(secretAccessKey, shortDate) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, shortDate);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, 'aws4_request');
}

function timestampParts(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    shortDate: iso.slice(0, 8)
  };
}

function responseBodyToWebStream(body) {
  if (!body) return null;
  if (typeof body.getReader === 'function') return body;
  if (typeof body.transformToWebStream === 'function') return body.transformToWebStream();
  if (typeof body.pipe === 'function') return Readable.toWeb(body);
  return Readable.toWeb(Readable.from(body));
}

async function signedR2Request(method, key, { body = null, contentType = '' } = {}) {
  const config = r2Config();
  const endpoint = new URL(config.endpoint);
  const canonicalUri = canonicalObjectPath(config.bucket, key);
  const url = new URL(canonicalUri, `${endpoint.protocol}//${endpoint.host}`);
  const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(body));
  const payloadHash = payload == null ? EMPTY_SHA256 : sha256Hex(payload);
  const { amzDate, shortDate } = timestampParts();

  const headers = {
    host: endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (contentType) headers['content-type'] = contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = `${signedHeaderNames.map(name => `${name}:${String(headers[name]).trim()}\n`).join('')}`;
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  const scope = `${shortDate}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const signature = hmac(signingKey(config.secretAccessKey, shortDate), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: authorization
  };
  if (contentType) requestHeaders['Content-Type'] = contentType;

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: payload,
    redirect: 'error'
  });

  if (!response.ok && response.status !== 404) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`Cloudflare R2 ${method} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response;
}

function objectMetadata(response) {
  const size = Number(response.headers.get('content-length') || 0);
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const etag = String(response.headers.get('etag') || '').replace(/^W\//, '').replace(/^"|"$/g, '');
  return { size, contentType, etag };
}

async function putObject(key, body, contentType) {
  const response = await signedR2Request('PUT', key, { body, contentType });
  return {
    key,
    etag: objectMetadata(response).etag || sha256Hex(Buffer.isBuffer(body) ? body : Buffer.from(body)),
    contentType
  };
}

async function getObject(key) {
  const response = await signedR2Request('GET', key);
  if (response.status === 404) return null;
  return {
    statusCode: response.status,
    stream: responseBodyToWebStream(response.body),
    blob: objectMetadata(response)
  };
}

async function readJsonObject(key) {
  const result = await getObject(key);
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).json();
}

export async function writeObserverImage(image, slot = 'latest') {
  const normalizedSlot = normalizeObserverSlot(slot);
  if (!normalizedSlot) throw new Error('Unknown Observer image slot.');
  const body = image instanceof Uint8Array
    ? Buffer.from(image.buffer, image.byteOffset, image.byteLength)
    : Buffer.from(image);
  return putObject(OBSERVER_IMAGE_SLOTS[normalizedSlot], body, 'image/jpeg');
}

export async function writeObserverStatus(record) {
  return putObject(OBSERVER_STATUS_PATH, JSON.stringify(record), 'application/json');
}

export async function readObserverStatus() {
  return readJsonObject(OBSERVER_STATUS_PATH);
}

export async function readObserverImage(slot = 'latest') {
  const normalizedSlot = normalizeObserverSlot(slot);
  if (!normalizedSlot) return null;
  return getObject(OBSERVER_IMAGE_SLOTS[normalizedSlot]);
}

export async function writeObserverDailySummary(record) {
  return putObject(OBSERVER_DAILY_SUMMARY_PATH, JSON.stringify(record), 'application/json');
}

export async function readObserverDailySummary() {
  return readJsonObject(OBSERVER_DAILY_SUMMARY_PATH);
}

export async function writeObserverAlerts(record) {
  return putObject(OBSERVER_ALERTS_PATH, JSON.stringify(record), 'application/json');
}

export async function readObserverAlerts() {
  return readJsonObject(OBSERVER_ALERTS_PATH);
}

export async function writeObserverTimelapse(video, slot) {
  const normalizedSlot = normalizeObserverTimelapseSlot(slot);
  if (!normalizedSlot) throw new Error('Unknown Observer timelapse slot.');
  const body = video instanceof Uint8Array
    ? Buffer.from(video.buffer, video.byteOffset, video.byteLength)
    : Buffer.from(video);
  return putObject(OBSERVER_TIMELAPSE_SLOTS[normalizedSlot], body, 'video/mp4');
}

export async function readObserverTimelapse(slot) {
  const normalizedSlot = normalizeObserverTimelapseSlot(slot);
  if (!normalizedSlot) return null;
  return getObject(OBSERVER_TIMELAPSE_SLOTS[normalizedSlot]);
}

export async function writeObserverTimelapseFeed(record) {
  return putObject(OBSERVER_TIMELAPSES_PATH, JSON.stringify(record), 'application/json');
}

export async function readObserverTimelapseFeed() {
  return readJsonObject(OBSERVER_TIMELAPSES_PATH);
}
