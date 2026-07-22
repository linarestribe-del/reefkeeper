import assert from 'node:assert/strict';
import syncHandler from '../api/apex-sync.js';
import statusHandler from '../api/apex-status.js';

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

const sensitivePayload = {
  connectorVersion: 'pi-live-1.0',
  piTimestamp: '2026-07-21T14:00:00.000Z',
  apexSourceUrl: 'http://192.168.4.10',
  probes: [],
  inputs: [],
  outputs: [],
  rawText: 'complete raw controller response',
  raw: {
    istat: {
      hostname: 'private-apex-name',
      serial: 'SERIAL-SECRET',
      software: '5.13',
      hardware: 'A3',
      link: { linkKey: 'LINK-SECRET' },
      extra: { sdserial: 123456 },
      inputs: [
        { did: 'base_Temp', type: 'Temp', name: 'Tmp', value: 77.6, secret: 'remove-me' },
        { did: 'base_pH', type: 'pH', name: 'pH', value: '8.18' },
        { did: 'base_ORP', type: 'ORP', name: 'ORP', value: 344 },
        { did: 'leak_1', type: 'digital', name: 'Leak1', value: 0 },
        { did: 'private', type: 'private', name: 'UnneededPrivateProbe', value: 'hidden' }
      ],
      outputs: [
        { name: 'Return1', status: ['AON', 'ON'], gid: 'private-gid', ID: 12, did: 'private-did' },
        { name: 'Alarm_Main', status: ['OFF'], gid: 'alarm-gid' },
        { name: 'PrivateOutlet', status: ['ON'], gid: 'private-outlet-gid' }
      ]
    }
  }
};

function assertMinimized(record) {
  assert.equal(record.ok, true);
  assert.equal(record.source, 'Apex via Raspberry Pi');
  assert.equal('apexSourceUrl' in record, false);
  assert.equal('rawText' in record, false);
  assert.deepEqual(Object.keys(record.raw), ['istat']);
  assert.deepEqual(Object.keys(record.raw.istat).sort(), ['inputs', 'outputs']);

  const serialized = JSON.stringify(record);
  for (const forbidden of [
    '192.168.4.10',
    'private-apex-name',
    'SERIAL-SECRET',
    'LINK-SECRET',
    'sdserial',
    'complete raw controller response',
    'private-gid',
    'private-did',
    'private-outlet-gid',
    'UnneededPrivateProbe',
    'PrivateOutlet'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `Sanitized Apex response leaked: ${forbidden}`);
  }

  assert.deepEqual(record.inputs.map(item => item.name), ['Tmp', 'pH', 'ORP', 'Leak1']);
  assert.deepEqual(record.probes.map(item => item.name), ['Tmp', 'pH', 'ORP']);
  assert.deepEqual(record.outputs.map(item => item.name), ['Return1', 'Alarm_Main']);
  assert.deepEqual(record.raw.istat.inputs, record.inputs);
  assert.deepEqual(record.raw.istat.outputs, record.outputs);
  assert.deepEqual(record.outputs[0].status, ['AON', 'ON']);
  assert.deepEqual(Object.keys(record.inputs[0]).sort(), ['name', 'type', 'value']);
  assert.deepEqual(Object.keys(record.outputs[0]).sort(), ['name', 'status']);
}

const originalFetch = global.fetch;
const originalKvUrl = process.env.KV_REST_API_URL;
const originalKvToken = process.env.KV_REST_API_TOKEN;
const originalConnectorSecret = process.env.REEF_CONNECTOR_SECRET;

try {
  process.env.KV_REST_API_URL = 'https://kv.example.test';
  process.env.KV_REST_API_TOKEN = 'kv-test-token';
  process.env.REEF_CONNECTOR_SECRET = 'connector-test-secret';

  let storedRecord = null;
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/set\/reefkeeper%3Aapex%3Alatest$/);
    storedRecord = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => 'OK'
    };
  };

  const syncResponse = responseRecorder();
  await syncHandler({
    method: 'POST',
    headers: { authorization: 'Bearer connector-test-secret' },
    body: sensitivePayload
  }, syncResponse);

  assert.equal(syncResponse.statusCode, 200);
  assert.equal(syncResponse.payload.source, 'Apex via Raspberry Pi');
  assert.ok(storedRecord, 'A sanitized Apex record should be written to KV.');
  assertMinimized(storedRecord);

  global.fetch = async (url) => {
    assert.match(String(url), /\/get\/reefkeeper%3Aapex%3Alatest$/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        result: {
          ok: true,
          receivedAt: '2026-07-21T14:01:00.000Z',
          ...sensitivePayload
        }
      })
    };
  };

  const statusResponse = responseRecorder();
  await statusHandler({ method: 'GET', headers: {} }, statusResponse);
  assert.equal(statusResponse.statusCode, 200);
  assertMinimized(statusResponse.payload);

  console.log('Apex data minimization tests passed.');
} finally {
  global.fetch = originalFetch;
  if (originalKvUrl === undefined) delete process.env.KV_REST_API_URL;
  else process.env.KV_REST_API_URL = originalKvUrl;
  if (originalKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
  else process.env.KV_REST_API_TOKEN = originalKvToken;
  if (originalConnectorSecret === undefined) delete process.env.REEF_CONNECTOR_SECRET;
  else process.env.REEF_CONNECTOR_SECRET = originalConnectorSecret;
}
