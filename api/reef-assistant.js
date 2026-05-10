export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, tankContext } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing question" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY environment variable"
      });
    }

    const reefContext = JSON.stringify(tankContext || {}, null, 2);

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.1",
        instructions: `
You are Reef Keeper's AI assistant for Jorge's 120 gallon mixed reef tank.

Give practical reef-aquarium advice based on the provided tank context.
Prioritize stability over aggressive correction.
Do not recommend rapid phosphate reduction.
Do not recommend rapid alkalinity changes.
Do not recommend restarting kalk unless the test data supports it.
When uncertain, ask for the missing test result.
Avoid pretending to know current measurements unless the user provides them.
Keep answers concise, specific, and action-oriented.
`,
        input: `
Tank context:
${reefContext}

User question:
${question}
`
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();

      return res.status(openaiResponse.status).json({
        error: "OpenAI API error",
        details: errorText
      });
    }

    const data = await openaiResponse.json();

    return res.status(200).json({
      answer: data.output_text || "I received a response, but could not read the answer text."
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
