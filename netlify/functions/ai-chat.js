exports.handler = async function (event) {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers,
            body: ""
        };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({
                ok: false,
                error: "Method Not Allowed. Use POST."
            })
        };
    }

    try {
        const body = JSON.parse(event.body || "{}");

        const prompt =
            typeof body.prompt === "string"
                ? body.prompt.trim()
                : "";

        if (!prompt) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    ok: false,
                    error: "Prompt is required."
                })
            };
        }

        const apiKey = process.env.GEMINI_API_KEY;

        const model =
            process.env.GEMINI_MODEL ||
            "gemini-2.5-flash";

        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    ok: false,
                    error: "GEMINI_API_KEY is not configured in Netlify."
                })
            };
        }

        const history =
            Array.isArray(body.history)
                ? body.history
                : [];

        const context =
            body.context &&
            typeof body.context === "object"
                ? body.context
                : {};

        const appInfo =
            body.app &&
            typeof body.app === "object"
                ? body.app
                : {};

        const contents = [];

        for (const item of history) {
            if (!item || typeof item !== "object") {
                continue;
            }

            const role =
                item.role === "assistant"
                    ? "model"
                    : "user";

            let text = "";

            if (typeof item.content === "string") {
                text = item.content;
            } else if (typeof item.text === "string") {
                text = item.text;
            }

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

        const systemInstruction = `
You are NIVORA AI, the professional AI assistant inside NIVORA ONE.

Language:
- Bengali question = natural Bengali answer.
- English question = English answer.
- Banglish = understand it and answer naturally.
- Do not unnecessarily switch languages.

Rules:
- Be accurate, practical and professional.
- Never invent NIVORA business records.
- Never invent stock, sales, purchases, customers, accounts or financial data.
- Use supplied application data as the source of truth.
- If information is missing, clearly say it is missing.
- For calculations, show important steps when useful.
- Do not claim that an action was completed unless the application actually completed it.

Application:
${JSON.stringify(appInfo)}

Available application data:
${JSON.stringify(context)}
`;

        contents.push({
            role: "user",
            parts: [
                {
                    text: prompt
                }
            ]
        });

        const apiUrl =
            "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(model) +
            ":generateContent?key=" +
            encodeURIComponent(apiKey);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [
                        {
                            text: systemInstruction
                        }
                    ]
                },
                contents: contents,
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 4096
                }
            })
        });

        const responseText = await response.text();

        let data;

        try {
            data = JSON.parse(responseText);
        } catch (error) {
            data = {
                raw: responseText
            };
        }

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({
                    ok: false,
                    error:
                        data?.error?.message ||
                        "Gemini API request failed."
                })
            };
        }

        const answer =
            data?.candidates?.[0]?.content?.parts
                ?.map(function (part) {
                    return typeof part.text === "string"
                        ? part.text
                        : "";
                })
                .join("")
                .trim();

        if (!answer) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    ok: false,
                    error: "Gemini returned no usable answer."
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                answer: answer,
                model: model,
                service: "NIVORA ONE AI"
            })
        };

    } catch (error) {

        console.error(
            "NIVORA AI ERROR:",
            error
        );

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                ok: false,
                error:
                    error?.message ||
                    "Unexpected server error."
            })
        };
    }
};
