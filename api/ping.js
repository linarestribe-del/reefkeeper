export default async function handler(req, res) {
  return res.status(200).json({ ok: true, time: new Date().toISOString(), hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY) });
}
