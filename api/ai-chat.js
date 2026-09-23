module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  // OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "POST method required"
    });
  }

  try {
    const body = req.body || {};

    const prompt = String(body.prompt || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const context = body.context || {};

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "Prompt is required"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured in Vercel."
      });
    }

    // Conversation history
    const contents = [];

    for (const item of history.slice(-20)) {
      if (!item) continue;

      const role =
        item.role === "model" || item.role === "assistant"
          ? "model"
          : "user";

      const text =
        typeof item.content === "string"
          ? item.content
          : typeof item.text === "string"
            ? item.text
            : "";

      if (text.trim()) {
        contents.push({
          role,
          parts: [
            {
              text: text.trim()
            }
          ]
        });
      }
    }

    // Current user message
    contents.push({
      role: "user",
      parts: [
        {
          text: prompt
        }
      ]
    });

    // NIVORA ONE system instruction
    const systemText = `
You are NIVORA ONE, a professional AI assistant.

LANGUAGE:
- Understand Bengali, Banglish and English.
- If the user asks in Bengali, answer naturally in Bengali.
- If the user asks in English, answer in English.
- Understand mixed Bengali-English messages.

BEHAVIOR:
- Be accurate, clear and professional.
- Do not invent business records.
- Do not invent products, stock, sales, purchases, income, expenses, customers, orders or baki records.
- When app data is supplied in context, use that data.
- If required information is missing, clearly say what information is missing.
- For calculations, provide useful steps when appropriate.
- Help with general questions, business, coding, mathematics and normal day-to-day tasks.

NIVORA ONE APP CONTEXT:
${JSON.stringify(context).slice(0, 30000)}
`.trim();

    // Gemini API URL
    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: systemText
            }
          ]
        },

        contents,

        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096
        }
      })
    });

    const geminiData = await geminiResponse.json();

    // Gemini error
    if (!geminiResponse.ok) {
      const message =
        geminiData?.error?.message ||
        "Gemini API request failed.";

      return res.status(geminiResponse.status).json({
        ok: false,
        error: message
      });
    }

    // Extract answer
    const answer =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map(part => part?.text || "")
        .join("")
        .trim() || "";

    if (!answer) {
      return res.status(502).json({
        ok: false,
        error: "Gemini returned an empty response."
      });
    }

    // Success
    return res.status(200).json({
      ok: true,
      answer: answer
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "NIVORA AI server error."
    });
  }
};
