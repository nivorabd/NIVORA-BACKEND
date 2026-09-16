const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL ||
  "gemini-2.5-flash-preview-tts";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

app.use(cors());

app.use(
  express.json({
    limit: "25mb"
  })
);


/* =========================================================
   BASIC HELPERS
========================================================= */

function requireApiKey(res) {
  if (!GEMINI_API_KEY) {
    res.status(500).json({
      ok: false,
      error:
        "Gemini API key is not configured on the backend."
    });

    return false;
  }

  return true;
}


async function geminiRequest(model, body) {
  const url =
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify(body)
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.raw ||
      `Gemini request failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}


function extractText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}


function cleanHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-30)
    .map((item) => {
      const role =
        item?.role === "model"
          ? "model"
          : "user";

      const text =
        typeof item?.text === "string"
          ? item.text
          : "";

      return {
        role,
        parts: [
          {
            text: text.slice(0, 20000)
          }
        ]
      };
    })
    .filter((item) => item.parts[0].text);
}


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "NIVORA AI Backend",
    aiConfigured: Boolean(GEMINI_API_KEY),
    chatModel: GEMINI_MODEL,
    ttsModel: GEMINI_TTS_MODEL
  });
});


/* =========================================================
   AI CHAT
========================================================= */

app.post("/api/chat", async (req, res) => {
  try {
    if (!requireApiKey(res)) {
      return;
    }

    const {
      message,
      history,
      webSearch,
      attachment
    } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        ok: false,
        error: "Message is required."
      });
    }

    const contents = cleanHistory(history);

    const currentParts = [];

    currentParts.push({
      text: message.trim()
    });


    /* -----------------------------------------------------
       ATTACHMENT
    ----------------------------------------------------- */

    if (
      attachment &&
      typeof attachment === "object" &&
      attachment.data
    ) {
      const mimeType =
        attachment.mimeType ||
        "application/octet-stream";

      const data =
        String(attachment.data)
          .replace(/^data:[^;]+;base64,/, "");

      currentParts.push({
        inlineData: {
          mimeType,
          data
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
            text:
              "You are NIVORA AI, a helpful, friendly and accurate AI assistant. " +
              "Answer in the user's language whenever possible. " +
              "For Bengali users, prefer clear natural Bengali. " +
              "Do not claim that you performed an action when you did not. " +
              "Be concise but useful."
          }
        ]
      },

      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };


    /* -----------------------------------------------------
       OPTIONAL GOOGLE SEARCH
    ----------------------------------------------------- */

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


    res.json({
      ok: true,
      text: answer
    });

  } catch (error) {
    console.error(
      "CHAT ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "AI chat failed."
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
      income = 0,
      expense = 0,
      profit = 0,
      transactions = []
    } = req.body || {};


    const safeTransactions =
      Array.isArray(transactions)
        ? transactions.slice(-200)
        : [];


    const prompt = `
আপনি NIVORA AI Business Manager-এর বিশ্লেষক।

নিচের ব্যবসায়িক তথ্য বিশ্লেষণ করুন।

মোট আয়:
${income}

মোট খরচ:
${expense}

লাভ:
${profit}

লেনদেন:
${JSON.stringify(
  safeTransactions,
  null,
  2
)}

বাংলায় একটি বাস্তবসম্মত ব্যবসায়িক বিশ্লেষণ দিন।

অন্তর্ভুক্ত করুন:
1. বর্তমান আর্থিক অবস্থা
2. আয় ও খরচের তুলনা
3. কোথায় খরচ কমানো যেতে পারে
4. লাভ বাড়ানোর বাস্তব উপায়
5. গুরুত্বপূর্ণ সতর্কতা
6. পরবর্তী করণীয়

তথ্য না থাকলে অনুমানকে নিশ্চিত তথ্য হিসেবে উপস্থাপন করবেন না।
`;


    const data =
      await geminiRequest(
        GEMINI_MODEL,
        {
          contents: [
            {
              role: "user",

              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 3000
          }
        }
      );


    const answer =
      extractText(data);


    res.json({
      ok: true,
      text:
        answer ||
        "বিশ্লেষণ পাওয়া যায়নি।"
    });

  } catch (error) {
    console.error(
      "ANALYZE ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Business analysis failed."
    });
  }
});


/* =========================================================
   VOICE GENERATOR
========================================================= */

app.post("/api/voice", async (req, res) => {
  try {
    if (!requireApiKey(res)) {
      return;
    }

    const {
      mode = "male",
      text
    } = req.body || {};


    if (
      typeof text !== "string" ||
      !text.trim()
    ) {
      return res.status(400).json({
        ok: false,
        error: "Voice text is required."
      });
    }


    const voiceText =
      text.trim().slice(0, 15000);


    let body;


    /* -----------------------------------------------------
       SINGLE MALE VOICE
    ----------------------------------------------------- */

    if (mode === "male") {

      body = {
        contents: [
          {
            role: "user",

            parts: [
              {
                text:
                  "Speak the following text naturally and clearly:\n\n" +
                  voiceText
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
                voiceName: "Kore"
              }
            }
          }
        }
      };

    }


    /* -----------------------------------------------------
       MALE + FEMALE MIXED VOICE
    ----------------------------------------------------- */

    else if (mode === "mixed") {

      body = {
        contents: [
          {
            role: "user",

            parts: [
              {
                text:
                  "Create a natural two-speaker public announcement " +
                  "from the following script. " +
                  "Lines beginning with [পুরুষ] must be spoken by the male voice. " +
                  "Lines beginning with [মহিলা] must be spoken by the female voice. " +
                  "Keep the speech clear, natural and suitable for a microphone/public announcement.\n\n" +
                  voiceText
              }
            ]
          }
        ],

        generationConfig: {
          responseModalities: [
            "AUDIO"
          ],

          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: "পুরুষ",

                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: "Kore"
                    }
                  }
                },

                {
                  speaker: "মহিলা",

                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: "Aoede"
                    }
                  }
                }
              ]
            }
          }
        }
      };

    }


    else {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid voice mode. Use male or mixed."
      });
    }


    const data =
      await geminiRequest(
        GEMINI_TTS_MODEL,
        body
      );


    const parts =
      data?.candidates?.[0]?.content?.parts ||
      [];


    let audioBase64 = null;
    let mimeType =
      "audio/wav";


    for (const part of parts) {

      if (part?.inlineData?.data) {

        audioBase64 =
          part.inlineData.data;

        mimeType =
          part.inlineData.mimeType ||
          mimeType;

        break;
      }
    }


    if (!audioBase64) {
      return res.status(502).json({
        ok: false,
        error:
          "Voice model did not return audio."
      });
    }


    res.json({
      ok: true,
      mimeType,
      audioBase64
    });

  } catch (error) {
    console.error(
      "VOICE ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Voice generation failed."
    });
  }
});


/* =========================================================
   ROOT
========================================================= */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "NIVORA AI Backend",
    message:
      "NIVORA backend is running."
  });
});


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      err
    );

    res.status(500).json({
      ok: false,
      error:
        err?.message ||
        "Internal server error."
    });
  }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      "===================================="
    );

    console.log(
      "NIVORA AI Backend is running"
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Chat Model: ${GEMINI_MODEL}`
    );

    console.log(
      `TTS Model: ${GEMINI_TTS_MODEL}`
    );

    console.log(
      `API Key configured: ${Boolean(GEMINI_API_KEY)}`
    );

    console.log(
      "===================================="
    );
  }
);