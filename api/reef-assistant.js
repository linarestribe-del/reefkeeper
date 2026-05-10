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
    const {
      question,
      tankContext,
      mode = "careful",
      attachments = []
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing question" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY environment variable"
      });
    }

    const selectedMode = ["fast", "careful", "expert"].includes(mode)
      ? mode
      : "careful";

    const modelByMode = {
      fast: "gpt-4.1-mini",
      careful: "gpt-4.1-mini",
      expert: "gpt-4.1-mini"
    };

    const selectedModel = modelByMode[selectedMode];

    const reefContext = JSON.stringify(tankContext || {}, null, 2);

    const cleanedAttachments = Array.isArray(attachments)
      ? attachments
          .filter(file =>
            file &&
            typeof file.name === "string" &&
            typeof file.dataUrl === "string" &&
            file.dataUrl.startsWith("data:")
          )
          .slice(0, 5)
      : [];

    const attachmentContent = cleanedAttachments.map(file => {
      return {
        type: "input_file",
        filename: file.name,
        file_data: file.dataUrl
      };
    });

    const systemInstructions = `
You are Reef Keeper's AI assistant for Jorge's 120 gallon mixed reef tank.

Current response mode: ${selectedMode}

Mode behavior:
- Fast: brief, practical answer. Use for ordinary questions.
- Careful: more measured answer with reasoning and next steps. Use for parameter interpretation and maintenance decisions.
- Expert: most cautious and detailed. Use for coral decline, livestock stress, chemistry problems, uploaded ICP tests, photos, or conflicting data.

Your role:
Give practical, cautious, reef-aquarium husbandry advice using the supplied tank context, user question, and uploaded files/images.

Tank philosophy:
- Prioritize stability over fast correction.
- Avoid aggressive swings in alkalinity, phosphate, salinity, lighting, flow, or nutrients.
- Prefer observation, measured testing, and gradual correction.
- Do not recommend adding livestock or coral while the tank is in recovery unless the user specifically asks and stability conditions are met.

Known tank context:
- This is a 120 gallon SCA mixed reef with sump, protein skimmer, UV, filter roller, GFO reactor, Apex, multiple powerheads, and RODI.
- Recent issues include high phosphate, alkalinity spike, high iodine on ICP, hair algae, aiptasia, inconsistent water changes, and coral loss.
- Current recovery strategy is: no kalk for now, reduce phosphate slowly, perform 20–25 gallon water changes on off weeks, verify salinity, avoid trace dosing, and do not add new coral until stable.

Current target ranges:
- Salinity: 1.025–1.026 sg
- Temperature: 77–79°F
- Alkalinity recovery target: 8.3–9.0 dKH
- Calcium: 400–440 ppm
- Magnesium: 1300–1400 ppm
- Nitrate: 5–20 ppm acceptable during recovery
- Phosphate first goal: below 0.30 ppm
- Phosphate later goal: 0.10–0.15 ppm
- Do not push phosphate to ultra-low levels quickly.

Important reef rules:
- GFO reduces phosphate. It does not directly reduce alkalinity.
- Kalkwasser raises alkalinity, calcium, and pH. Do not suggest restarting kalk unless alkalinity is low or there is proven daily alkalinity consumption.
- Lanthanum chloride / Phosphate RX can reduce phosphate quickly, but it can stress livestock if used carelessly. Do not recommend it casually.
- Water changes help dilute iodine, phosphate, dissolved organics, and trace imbalances, but new saltwater should be matched for salinity, temperature, and preferably alkalinity.
- High phosphate should be lowered gradually. Avoid dropping phosphate by more than about 0.10 ppm per week unless there is a specific reason.
- Aiptasia should be treated in small batches. Do not recommend returning Australian stripys to the display because they attacked bubble tip anemones.
- Berghia may be eaten by wrasses; mention that risk if relevant.
- Do not chase ORP.
- If pH is high, suggest verifying probe calibration before taking action.
- If coral is declining suddenly, first ask/check salinity, alkalinity, phosphate, temperature, ATO/RODI, and recent changes.

Uploaded file rules:
- Use uploaded files/images when relevant.
- If an uploaded image is unclear, say what can and cannot be determined.
- If a PDF or file appears to contain test results, summarize the important values first, then give action steps.
- Do not invent values that are not visible or provided.

Answer style:
- Be concise but specific.
- Use short sections when useful: "What this means", "What to do now", "What to test next".
- Give clear action steps.
- When data is missing, ask for the missing number instead of guessing.
- If a proposed action has risk, say so clearly.
- Do not overstate certainty.
- Do not give generic reef advice that ignores this tank's recovery plan.
- Avoid vague phrases like "adjust calcium consumption."
`;

    const userContent = [
      {
        type: "input_text",
        text: `
Tank context:
${reefContext}

User question:
${question}

Attached files:
${cleanedAttachments.length ? cleanedAttachments.map(f => `- ${f.name} (${f.type || "unknown type"}, ${f.size || "unknown size"} bytes)`).join("\n") : "None"}
`
      },
      ...attachmentContent
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(process.env.OPENAI_API_KEY || "").trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: selectedModel,
        input: [
          {
            role: "system",
            content: systemInstructions
          },
          {
            role: "user",
            content: userContent
          }
        ]
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

    let answer = data.output_text;

    if (!answer && Array.isArray(data.output)) {
      answer = data.output
        .flatMap(item => item.content || [])
        .map(content => content.text || "")
        .join("\n")
        .trim();
    }

    if (!answer && data.choices?.[0]?.message?.content) {
      answer = data.choices[0].message.content;
    }

    if (!answer) {
      return res.status(500).json({
        error: "Could not read answer text",
        details: JSON.stringify(data, null, 2).slice(0, 4000)
      });
    }

    return res.status(200).json({
      answer,
      mode: selectedMode,
      model: selectedModel,
      filesReceived: cleanedAttachments.map(file => file.name)
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
