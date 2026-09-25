const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });

  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain") {
  res.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Access-Control-Allow-Origin": "*"
  });

  res.end(text);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".md": "text/markdown",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon"
  };

  return types[ext] || "application/octet-stream";
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });

    req.on("error", reject);
  });
}

async function handleAIChat(req, res) {
  try {
    const body = await readRequestBody(req);

    const prompt = String(body.prompt || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const context = body.context || {};
    const appInfo = body.app || {};

    if (!prompt) {
      return sendJson(res, 400, {
        ok: false,
        error: "Prompt is required."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return sendJson(res, 500, {
        ok: false,
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    const model =
      process.env.GEMINI_MODEL || "gemini-3.6-flash";

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

    contents.push({
      role: "user",
      parts: [
        {
          text: prompt
        }
      ]
    });

    const systemText = `
You are NIVORA ONE, a professional AI assistant and all-in-one work platform.

LANGUAGE:
- Understand Bengali, Banglish and English.
- If the user asks in Bengali, answer naturally in Bengali.
- If the user asks in English, answer in English.
- Understand mixed Bengali-English messages.

CORE BEHAVIOR:
- Be accurate, clear and professional.
- Do not invent information.
- Do not invent business records.
- Do not invent products, stock, sales, purchases, income, expenses, customers, orders or baki records.
- Use supplied application data when available.
- If required information is missing, clearly state what is missing.
- For calculations, provide useful steps when appropriate.
- Help with general questions, business, coding, mathematics, content creation and normal professional tasks.

BUSINESS DATA SAFETY:
- Treat supplied business data as authoritative for the user's app.
- Never create fake totals or fake transactions.
- Do not claim that a transaction was saved unless the application actually saved it.
- Distinguish between an AI suggestion and an actual application action.

PROBLEM SOLVING:
When the user provides a technical problem:
1. Understand the problem.
2. Identify likely cause from the supplied evidence.
3. Explain the issue simply.
4. Give an exact practical solution.
5. If code is required, provide copy-paste-ready code.
6. Clearly identify the file and location where code belongs.
7. Preserve existing working features.
8. Do not claim that code was executed or tested unless the server actually performed that test.

CODING:
- Help with HTML, CSS, JavaScript, Node.js, Firebase and APIs.
- Review supplied code carefully.
- Avoid unnecessary rewrites.
- Prefer minimal safe fixes when repairing an existing project.

NIVORA ONE APPLICATION:
${JSON.stringify(appInfo).slice(0, 10000)}

CURRENT APPLICATION CONTEXT:
${JSON.stringify(context).slice(0, 30000)}
`.trim();

    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);

    let geminiResponse;

    try {
      geminiResponse = await fetch(geminiUrl, {
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
    } catch (networkError) {
      return sendJson(res, 502, {
        ok: false,
        error:
          "Unable to connect to Gemini API: " +
          (networkError.message || "network error")
      });
    }

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const message =
        geminiData?.error?.message ||
        "Gemini API request failed.";

      return sendJson(res, geminiResponse.status, {
        ok: false,
        error: message
      });
    }

    const answer =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map(part => part?.text || "")
        .join("")
        .trim() || "";

    if (!answer) {
      return sendJson(res, 502, {
        ok: false,
        error: "Gemini returned an empty response."
      });
    }

    return sendJson(res, 200, {
      ok: true,
      answer
    });

  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error:
        error?.message ||
        "NIVORA AI server error."
    });
  }
}

function serveStatic(req, res, pathname) {
  let requestedPath = pathname;

  if (requestedPath === "/") {
    requestedPath = "/index.html";
  }

  requestedPath = decodeURIComponent(requestedPath);

  const filePath = path.normalize(
    path.join(ROOT, requestedPath)
  );

  if (!filePath.startsWith(ROOT)) {
    return sendText(res, 403, "Forbidden");
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      return sendText(res, 404, "Not Found");
    }

    res.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": "no-cache"
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const pathname = parsedUrl.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });

    return res.end();
  }

  if (pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      service: "NIVORA ONE",
      ai: "ready",
      time: new Date().toISOString()
    });
  }

  if (
    (pathname === "/api/ai-chat" ||
      pathname === "/api/ai/chat") &&
    req.method === "POST"
  ) {
    return handleAIChat(req, res);
  }

  if (pathname.startsWith("/api/")) {
    return sendJson(res, 404, {
      ok: false,
      error: "API route not found."
    });
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `NIVORA ONE server running on port ${PORT}`
  );
});
