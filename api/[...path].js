// ============================================================
// NIVORA ONE - SIMPLE VERCEL AI BACKEND
// No Express
// No CORS package
// No server.js
// No separate backend server
// ============================================================

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ------------------------------------------------------------
// JSON RESPONSE
// ------------------------------------------------------------
function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  res.end(JSON.stringify(data));
}

// ------------------------------------------------------------
// BODY PARSER
// ------------------------------------------------------------
async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  let raw = "";

  for await (const chunk of req) {
    raw += chunk;
  }

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ------------------------------------------------------------
// GEMINI TEXT EXTRACTOR
// ------------------------------------------------------------
function extractGeminiText(data) {
  try {
    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    return parts
      .map(part => part?.text || "")
      .join("")
      .trim();
  } catch {
    return "";
  }
}

// ------------------------------------------------------------
// CLEAN APP CONTEXT
// Prevent unnecessarily huge/infinite context
// ------------------------------------------------------------
function cleanContext(context) {
  if (!context || typeof context !== "object") {
    return {};
  }

  const safe = {
    user: context.user || null,

    products: Array.isArray(context.products)
      ? context.products.slice(0, 300)
      : [],

    financeRecords: Array.isArray(context.financeRecords)
      ? context.financeRecords.slice(0, 500)
      : [],

    customers: Array.isArray(context.customers)
      ? context.customers.slice(0, 300)
      : [],

    shopProducts: Array.isArray(context.shopProducts)
      ? context.shopProducts.slice(0, 300)
      : [],

    orders: Array.isArray(context.orders)
      ? context.orders.slice(0, 300)
      : [],

    taskEarnTasks: Array.isArray(context.taskEarnTasks)
      ? context.taskEarnTasks.slice(0, 300)
      : [],

    homeo: Array.isArray(context.homeo)
      ? context.homeo.slice(0, 300)
      : [],

    cart: Array.isArray(context.cart)
      ? context.cart.slice(0, 100)
      : []
  };

  return safe;
}

// ------------------------------------------------------------
// SYSTEM INSTRUCTION
// ------------------------------------------------------------
function buildSystemInstruction() {
  return `
You are NIVORA AI, a professional multilingual AI assistant.

Core requirements:

1. Understand Bengali and English.
2. If the user asks in Bengali, normally answer in Bengali.
3. If the user asks in English, answer in English.
4. Give clear, useful and accurate answers.
5. Do not invent facts.
6. If information is uncertain, clearly say so.
7. Help with mathematics, coding, business, education,
   writing, analysis, general questions and problem solving.
8. When NIVORA application data is provided, use that data
   to help the user understand their business information.
9. Never expose the Gemini API key.
10. Never tell the user to put the API key inside index.html.
11. Keep answers practical and easy to understand.
12. For business calculations, use the supplied data carefully.
13. Do not modify application data unless the application
    explicitly provides a supported operation.
14. The assistant should not claim that an action was completed
    if it was not actually performed.
`;
}

// ------------------------------------------------------------
// GEMINI REQUEST
// ------------------------------------------------------------
async function callGemini({
  prompt,
  history,
  context,
  webSearch
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "GEMINI_API_KEY is not configured in Vercel."
    );

    error.code = "API_KEY_MISSING";
    throw error;
  }

  const safeContext = cleanContext(context);

  const contextText =
    JSON.stringify(safeContext, null, 2);

  const contents = [];

  // ----------------------------------------------------------
  // HISTORY
  // ----------------------------------------------------------
  if (Array.isArray(history)) {
    for (const item of history.slice(-20)) {
      const role =
        item?.role === "model"
          ? "model"
          : "user";

      const text =
        item?.text ||
        item?.content ||
        item?.message ||
        "";

      if (!text) continue;

      contents.push({
        role,
        parts: [
          {
            text: String(text).slice(0, 12000)
          }
        ]
      });
    }
  }

  // ----------------------------------------------------------
  // CURRENT USER PROMPT
  // ----------------------------------------------------------
  const finalPrompt = `
CURRENT USER QUESTION:
${String(prompt || "").slice(0, 20000)}

NIVORA APPLICATION DATA:
${contextText}

Use the application data only when relevant to the question.
`;

  contents.push({
    role: "user",
    parts: [
      {
        text: finalPrompt
      }
    ]
  });

  const body = {
    systemInstruction: {
      parts: [
        {
          text: buildSystemInstruction()
        }
      ]
    },

    contents,

    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096
    }
  };

  // ----------------------------------------------------------
  // OPTIONAL GOOGLE SEARCH
  // ----------------------------------------------------------
  if (webSearch === true) {
    body.tools = [
      {
        google_search: {}
      }
    ];
  }

  const url =
    `${GEMINI_BASE}/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify(body)
  });

  const responseText = await response.text();

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = {
      error: {
        message: responseText
      }
    };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini API returned HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const reply = extractGeminiText(data);

  if (!reply) {
    const error = new Error(
      "Gemini returned an empty response."
    );

    error.code = "EMPTY_RESPONSE";
    throw error;
  }

  return reply;
}

// ------------------------------------------------------------
// MAIN VERCEL FUNCTION
// ------------------------------------------------------------
module.exports = async function handler(req, res) {

  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // ----------------------------------------------------------
  // FIND REQUEST PATH
  // ----------------------------------------------------------
  const path =
    Array.isArray(req.query?.path)
      ? req.query.path.join("/")
      : String(req.query?.path || "");

  // ----------------------------------------------------------
  // HEALTH CHECK
  // ----------------------------------------------------------
  if (
    req.method === "GET" &&
    (
      path === "health" ||
      path === ""
    )
  ) {
    return sendJson(res, 200, {
      ok: true,
      service: "NIVORA AI",
      status: "online",
      geminiKey:
        process.env.GEMINI_API_KEY
          ? "configured"
          : "missing",
      model: DEFAULT_MODEL
    });
  }

  // ----------------------------------------------------------
  // AI CHAT
  // Supports:
  // /api/ai/chat
  // ----------------------------------------------------------
  if (
    req.method === "POST" &&
    (
      path === "ai/chat" ||
      path === "chat"
    )
  ) {
    try {
      const body = await readBody(req);

      const prompt =
        body.prompt ||
        body.message ||
        "";

      if (!String(prompt).trim()) {
        return sendJson(res, 400, {
          ok: false,
          error: "প্রশ্নটি খালি রাখা যাবে না।"
        });
      }

      const reply = await callGemini({
        prompt,
        history: body.history || [],
        context: body.context || body.app || {},
        webSearch:
          body.webSearch === true
      });

      return sendJson(res, 200, {
        ok: true,
        reply
      });

    } catch (error) {

      console.error(
        "NIVORA AI ERROR:",
        error
      );

      if (
        error?.code === "API_KEY_MISSING"
      ) {
        return sendJson(res, 500, {
          ok: false,
          error: "Gemini API Key Vercel-এ সেট করা হয়নি।",
          code: "api_key_missing"
        });
      }

      return sendJson(res, 500, {
        ok: false,
        error:
          error?.message ||
          "AI সার্ভার থেকে উত্তর পাওয়া যায়নি।"
      });
    }
  }

  // ----------------------------------------------------------
  // UNKNOWN API ROUTE
  // ----------------------------------------------------------
  return sendJson(res, 404, {
    ok: false,
    error: "NIVORA API route not found.",
    path
  });
};
