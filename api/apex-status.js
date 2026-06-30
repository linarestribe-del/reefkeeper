import { latestApexStatus } from './apex-sync.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!latestApexStatus) {
    return res.status(404).json({
      ok: false,
      error: 'No Apex status has been received yet'
    });
  }

  return res.status(200).json({ ok: true, status: latestApexStatus });
}
