const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

/* =========================================================
   GEMINI CONFIGURATION
========================================================= */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL ||
  "gemini-2.5-flash-preview-tts";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta";


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(
  express.json({
    limit: "25mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "25mb"
  })
);


/* =========================================================
   HELPERS
========================================================= */

function requireApiKey(res) {
  if (!GEMINI_API_KEY) {
    res.status(500).json({
      ok: false,
      error:
        "GEMINI_API_KEY is not configured on the server."
    });

    return false;
  }

  return true;
}


async function geminiRequest(model, body) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const url =
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify(body)
  });

  const rawText = await response.text();

  let data;

  try {
    data = rawText
      ? JSON.parse(rawText)
      : {};
  } catch {
    data = {
      raw: rawText
    };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      rawText ||
      `Gemini request failed with HTTP ${response.status}`;

    const error = new Error(message);

    error.status = response.status;
    error.gemini = data;

    throw error;
  }

  return data;
}


/* =========================================================
   EXTRACT GEMINI TEXT
========================================================= */

function extractText(data) {
  try {
    const candidates =
      Array.isArray(data?.candidates)
        ? data.candidates
        : [];

    const parts = [];

    for (const candidate of candidates) {
      const candidateParts =
        candidate?.content?.parts;

      if (!Array.isArray(candidateParts)) {
        continue;
      }

      for (const part of candidateParts) {
        if (
          typeof part?.text === "string" &&
          part.text.trim()
        ) {
          parts.push(part.text.trim());
        }
      }
    }

    return parts.join("\n\n").trim();

  } catch {
    return "";
  }
}


/* =========================================================
   HISTORY CLEANER
========================================================= */

function cleanHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-20)
    .map((item) => {
      if (!item) {
        return null;
      }

      const role =
        item.role === "assistant" ||
        item.role === "model"
          ? "model"
          : "user";

      const text =
        typeof item.content === "string"
          ? item.content
          : typeof item.text === "string"
            ? item.text
            : typeof item.message === "string"
              ? item.message
              : "";

      if (!text.trim()) {
        return null;
      }

      return {
        role,

        parts: [
          {
            text: text
              .trim()
              .slice(0, 20000)
          }
        ]
      };
    })
    .filter(Boolean);
}


/* =========================================================
   ERROR MESSAGE
========================================================= */

function getServerErrorMessage(error) {
  if (!error) {
    return "Unknown server error.";
  }

  return (
    error?.message ||
    "Server request failed."
  );
}


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "NIVORA AI SERVER",
    status: GEMINI_API_KEY
      ? "configured"
      : "api_key_missing",
    model: GEMINI_MODEL,
    ttsModel: GEMINI_TTS_MODEL,
    time: new Date().toISOString()
  });
});


/* =========================================================
   ROOT
========================================================= */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "NIVORA AI",
    message: "NIVORA AI backend is running.",
    api: "/api/health"
  });
});


/* =========================================================
   NIVORA AI CHAT
   FRONTEND:
   POST /api/ai/chat
========================================================= */

app.post("/api/ai/chat", async (req, res) => {
  try {
    if (!requireApiKey(res)) {
      return;
    }

    const {
      prompt,
      message,
      history = [],
      context = {},
      webSearch = false,
      attachment = null
    } = req.body || {};


    /* -----------------------------------------------------
       MESSAGE
    ----------------------------------------------------- */

    const userMessage =
      typeof prompt === "string" &&
      prompt.trim()
        ? prompt.trim()
        : typeof message === "string"
          ? message.trim()
          : "";


    if (!userMessage && !attachment) {
      return res.status(400).json({
        ok: false,
        error: "Message is required."
      });
    }


    /* -----------------------------------------------------
       CHAT HISTORY
    ----------------------------------------------------- */

    const contents =
      cleanHistory(history);


    /* -----------------------------------------------------
       APP CONTEXT
    ----------------------------------------------------- */

    let appContextText = "{}";

    try {
      appContextText =
        JSON.stringify(
          context || {},
          null,
          2
        );
    } catch {
      appContextText = "{}";
    }

    /*
      Prevent an extremely large app state from making
      the Gemini request unnecessarily huge.
    */

    appContextText =
      appContextText.slice(0, 50000);


    /* -----------------------------------------------------
       SYSTEM INSTRUCTION
    ----------------------------------------------------- */

    const systemPrompt = `
You are NIVORA AI, a professional multilingual AI assistant.

LANGUAGE:
- Answer in the same language as the user whenever possible.
- If the user asks in Bengali, answer naturally in Bengali.
- If the user asks in English, answer in English.
- If the user uses Banglish, understand it and answer naturally.
- If another language is used, answer in that language when possible.
- Do not unnecessarily mix languages.

GENERAL:
- Be accurate, useful, clear and professional.
- Do not invent facts.
- If information is uncertain or missing, say so clearly.
- Do not claim an action was completed unless it was actually completed.
- Help with education, mathematics, coding, business, writing,
  planning, general questions and problem solving.
- For mathematics, show useful calculation steps.
- For coding, provide practical runnable code when requested.
- For business questions, use the supplied NIVORA business data.

CURRENT NIVORA APPLICATION DATA:
The application may provide products, stock, purchases,
sales, income, expenses, customers, orders, tasks,
baki/accounts receivable, cart information and homeo records.

Use supplied application data when relevant.

IMPORTANT DATA RULES:
- Treat the supplied application data as the current session data.
- Do not invent records that are not present.
- If a requested record cannot be found, say that it was not found.
- Do not change application data merely by answering.
- Do not expose unnecessary private information.
- When calculating totals, use the supplied records.
- Clearly distinguish calculated results from information that
  already exists in the records.

CURRENT APP DATA:

${appContextText}
`;


    /* -----------------------------------------------------
       CURRENT USER MESSAGE
    ----------------------------------------------------- */

    const currentParts = [];


    if (userMessage) {
      currentParts.push({
        text: userMessage
      });
    }


    /* -----------------------------------------------------
       OPTIONAL ATTACHMENT
    ----------------------------------------------------- */

    if (
      attachment &&
      typeof attachment === "object" &&
      typeof attachment.data === "string" &&
      attachment.data.trim()
    ) {
      const mimeType =
        typeof attachment.mime === "string" &&
        attachment.mime.trim()
          ? attachment.mime.trim()
          : "application/octet-stream";

      currentParts.push({
        inlineData: {
          mimeType,
          data: attachment.data
        }
      });
    }


    contents.push({
      role: "user",
      parts: currentParts
    });


    /* -----------------------------------------------------
       GEMINI REQUEST BODY
    ----------------------------------------------------- */

    const body = {
      contents,

      systemInstruction: {
        parts: [
          {
            text: systemPrompt
          }
        ]
      },

      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096
      }
    };


    /* -----------------------------------------------------
       OPTIONAL WEB SEARCH
    ----------------------------------------------------- */

    if (webSearch === true) {
      body.tools = [
        {
          googleSearch: {}
        }
      ];
    }


    /* -----------------------------------------------------
       GEMINI
    ----------------------------------------------------- */

    const data =
      await geminiRequest(
        GEMINI_MODEL,
        body
      );


    const answer =
      extractText(data);


    if (!answer) {
      return res.status(502).json({
        ok: false,
        error:
          "AI returned an empty response."
      });
    }


    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

    return res.json({
      ok: true,
      reply: answer,
      text: answer,
      response: answer
    });

  } catch (error) {
    console.error(
      "NIVORA AI CHAT ERROR:",
      error
    );

    return res.status(
      Number(error?.status) >= 400 &&
      Number(error?.status) < 600
        ? Number(error.status)
        : 500
    ).json({
      ok: false,
      error:
        getServerErrorMessage(error)
    });
  }
});


/* =========================================================
   OLD CHAT COMPATIBILITY ROUTE
   Keeps older NIVORA code working if it still calls /api/chat
========================================================= */

app.post("/api/chat", async (req, res) => {
  try {
    if (!requireApiKey(res)) {
      return;
    }

    const {
      message = "",
      history = [],
      webSearch = false,
      attachment = null,
      context = {}
    } = req.body || {};


    const text =
      typeof message === "string"
        ? message.trim()
        : "";


    if (!text && !attachment) {
      return res.status(400).json({
        ok: false,
        error: "Message is required."
      });
    }


    const contents =
      cleanHistory(history);


    let contextText = "{}";

    try {
      contextText =
        JSON.stringify(
          context || {},
          null,
          2
        );
    } catch {
      contextText = "{}";
    }

    contextText =
      contextText.slice(0, 50000);


    const currentParts = [
      {
        text:
          text ||
          "এই সংযুক্ত ফাইলটি বিশ্লেষণ করুন।"
      }
    ];


    if (
      attachment &&
      typeof attachment === "object" &&
      typeof attachment.data === "string" &&
      attachment.data.trim()
    ) {
      currentParts.push({
        inlineData: {
          mimeType:
            attachment.mime ||
            "application/octet-stream",
          data: attachment.data
        }
      });
    }


    contents.push({
      role: "user",
      parts: currentParts
    });


    const body = {
      contents,

      systemInstruction: {
        parts: [
          {
            text: `
You are NIVORA AI.

Answer in the user's language.
If the user asks in Bengali, answer in Bengali.
Be accurate, useful and professional.
Do not invent information.

NIVORA application data:

${contextText}
`
          }
        ]
      },

      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096
      }
    };


    if (webSearch === true) {
      body.tools = [
        {
          googleSearch: {}
        }
      ];
    }


    const data =
      await geminiRequest(
        GEMINI_MODEL,
        body
      );


    const answer =
      extractText(data);


    if (!answer) {
      return res.status(502).json({
        ok: false,
        error:
          "AI returned an empty response."
      });
    }


    return res.json({
      ok: true,
      text: answer,
      reply: answer,
      response: answer
    });

  } catch (error) {
    console.error(
      "OLD CHAT ERROR:",
      error
    );

    return res.status(
      Number(error?.status) >= 400 &&
      Number(error?.status) < 600
        ? Number(error.status)
        : 500
    ).json({
      ok: false,
      error:
        getServerErrorMessage(error)
    });
  }
});


/* =========================================================
   BUSINESS ANALYSIS
========================================================= */

app.post("/api/analyze", async (req, res) => {
  try {
    if (!requireApiKey(res)) {
      return;
    }


    const {
      data,
      context,
      prompt
    } = req.body || {};


    let businessData = data;

    if (
      businessData === undefined ||
      businessData === null
    ) {
      businessData =
        context || {};
    }


    let businessText = "{}";

    try {
      businessText =
        JSON.stringify(
          businessData || {},
          null,
          2
        );
    } catch {
      businessText = "{}";
    }


    businessText =
      businessText.slice(0, 60000);


    const userPrompt =
      typeof prompt === "string" &&
      prompt.trim()
        ? prompt.trim()
        : `
এই ব্যবসার তথ্য বিশ্লেষণ করুন।

নিচের বিষয়গুলো থাকলে বিশ্লেষণ করুন:
1. মোট আয়
2. মোট খরচ
3. লাভ বা ক্ষতি
4. বিক্রয়
5. ক্রয়
6. স্টক
7. বাকি
8. গ্রাহক
9. কোন পণ্য বেশি/কম চলছে
10. ব্যবসা উন্নত করার বাস্তবসম্মত পরামর্শ

ব্যবসার তথ্য:

${businessText}
`;


    const body = {
      contents: [
        {
          role: "user",

          parts: [
            {
              text: userPrompt
            }
          ]
        }
      ],

      systemInstruction: {
        parts: [
          {
            text: `
You are NIVORA AI Business Analyst.

Analyze only the business data provided.
Do not invent financial records.
If data is missing, clearly mention it.
Answer in Bengali when the user uses Bengali.
Use clear headings and practical calculations.
`
          }
        ]
      },

      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    };


    const result =
      await geminiRequest(
        GEMINI_MODEL,
        body
      );


    const analysis =
      extractText(result);


    if (!analysis) {
      return res.status(502).json({
        ok: false,
        error:
          "Business analysis returned an empty response."
      });
    }


    return res.json({
      ok: true,
      analysis,
      text: analysis,
      reply: analysis
    });

  } catch (error) {
    console.error(
      "BUSINESS ANALYSIS ERROR:",
      error
    );

    return res.status(
      Number(error?.status) >= 400 &&
      Number(error?.status) < 600
        ? Number(error.status)
        : 500
    ).json({
      ok: false,
      error:
        getServerErrorMessage(error)
    });
  }
});


/* =========================================================
   VOICE / TTS
========================================================= */

app.post("/api/voice", async (req, res) => {
  try {
    if (!requireApiKey(res)) {
      return;
    }


    const {
      text,
      prompt,
      voiceName = "Kore"
    } = req.body || {};


    const inputText =
      typeof text === "string" &&
      text.trim()
        ? text.trim()
        : typeof prompt === "string"
          ? prompt.trim()
          : "";


    if (!inputText) {
      return res.status(400).json({
        ok: false,
        error: "Text is required."
      });
    }


    const body = {
      contents: [
        {
          parts: [
            {
              text: inputText
            }
          ]
        }
      ],

      generationConfig: {
        responseModalities: [
          "AUDIO"
        ],

        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName
            }
          }
        }
      }
    };


    const data =
      await geminiRequest(
        GEMINI_TTS_MODEL,
        body
      );


    let audioBase64 = null;
    let mimeType =
      "audio/wav";


    const candidates =
      Array.isArray(data?.candidates)
        ? data.candidates
        : [];


    for (const candidate of candidates) {
      const parts =
        candidate?.content?.parts;

      if (!Array.isArray(parts)) {
        continue;
      }


      for (const part of parts) {
        const inline =
          part?.inlineData;


        if (
          inline &&
          typeof inline.data === "string"
        ) {
          audioBase64 =
            inline.data;

          mimeType =
            inline.mimeType ||
            "audio/wav";

          break;
        }
      }


      if (audioBase64) {
        break;
      }
    }


    if (!audioBase64) {
      return res.status(502).json({
        ok: false,
        error:
          "Voice model did not return audio data."
      });
    }


    return res.json({
      ok: true,
      audio: audioBase64,
      audioBase64,
      mimeType
    });

  } catch (error) {
    console.error(
      "VOICE ERROR:",
      error
    );

    return res.status(
      Number(error?.status) >= 400 &&
      Number(error?.status) < 600
        ? Number(error.status)
        : 500
    ).json({
      ok: false,
      error:
        getServerErrorMessage(error)
    });
  }
});


/* =========================================================
   404 HANDLER
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "API route not found.",
    path: req.originalUrl
  });
});


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
  console.error(
    "GLOBAL SERVER ERROR:",
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    ok: false,
    error:
      error?.message ||
      "Internal server error."
  });
});


/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log(
    `NIVORA AI server running on port ${PORT}`
  );

  console.log(
    `Gemini model: ${GEMINI_MODEL}`
  );

  console.log(
    `Gemini API key: ${
      GEMINI_API_KEY
        ? "CONFIGURED"
        : "NOT CONFIGURED"
    }`
  );
});