const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { generateNivoraAnswer } = require("./ai-core");

const root = path.resolve(__dirname);
const port = Number(process.env.PORT) || 5000;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function handleAIRequest(request, response) {
  if (request.method === "OPTIONS") {
    return sendJson(response, 204, {});
  }

  if (request.method !== "POST") {
    return sendJson(response, 405, {
      ok: false,
      error: "POST method required",
    });
  }

  try {
    const body = await readJson(request);
    const answer = await generateNivoraAnswer({
      prompt: body.prompt,
      history: body.history,
      context: body.context,
      mode: body.mode,
      apiKey: process.env.GEMINI_API_KEY,
    });

    sendJson(response, 200, { ok: true, answer });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 400;
    sendJson(response, status, {
      ok: false,
      error: error.message || "NIVORA AI server error",
    });
  }
}

function serveStatic(request, response) {
  const requestedPath = decodeURIComponent(
    (request.url || "/").split("?")[0]
  );
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const filePath = path.resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return sendJson(response, 403, { ok: false, error: "Forbidden" });
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("Not found");
    }

    response.writeHead(200, {
      "Content-Type":
        mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const requestPath = (request.url || "/").split("?")[0];

  if (requestPath === "/api/ai-chat" || requestPath === "/api/ai/chat") {
    return handleAIRequest(request, response);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return sendJson(response, 405, { ok: false, error: "Method not allowed" });
  }

  serveStatic(request, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`NIVORA ONE running on port ${port}`);
});