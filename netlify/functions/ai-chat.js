const { generateNivoraAnswer } = require("../../ai-core");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: false,
        error: "POST method required"
      })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const answer = await generateNivoraAnswer({
      prompt: body.prompt,
      history: body.history,
      context: body.context,
      apiKey: process.env.GEMINI_API_KEY
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ ok: true, answer })
    };

  } catch (error) {
    return {
      statusCode: Number.isInteger(error.status) ? error.status : 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        ok: false,
        error: error.message || "Server error"
      })
    };
  }
};
