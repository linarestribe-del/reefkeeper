let latestApexStatus = null;

function readBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice('Bearer '.length).trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expectedSecret = process.env.REEF_CONNECTOR_SECRET;
  if (!expectedSecret) {
    return res.status(500).json({ error: 'Server missing REEF_CONNECTOR_SECRET' });
  }

  const token = readBearerToken(req);
  if (token !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body || {};
  const receivedAt = new Date().toISOString();

  latestApexStatus = {
    receivedAt,
    connectorVersion: payload.connectorVersion || null,
    piTimestamp: payload.piTimestamp || null,
    apexSourceUrl: payload.apexSourceUrl || null,
    probes: payload.probes || [],
    inputs: payload.inputs || [],
    outputs: payload.outputs || [],
    raw: payload.raw || null,
    rawText: payload.rawText || null
  };

  return res.status(200).json({ ok: true, receivedAt });
}

export { latestApexStatus };
