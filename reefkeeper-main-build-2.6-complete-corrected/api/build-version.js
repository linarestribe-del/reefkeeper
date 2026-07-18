export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({ build: '2.6', feature: 'native-why', generated: '2026-07-18' });
}
