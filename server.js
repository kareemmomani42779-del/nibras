
const http = require("http");
const fs = require("fs");
const path = require("path");

const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/sw.js": ["sw.js", "application/javascript"],
  "/robots.txt": ["robots.txt", "text/plain"],
  "/sitemap.xml": ["sitemap.xml", "application/xml"],
  "/icon-192.png": ["icon-192.png", "image/png"],
  "/icon-512.png": ["icon-512.png", "image/png"]
};

const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 60000);
  a.push(now);
  hits.set(ip, a);
  return a.length > 20;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function askGemini(model, apiKey, requestBody) {
  const delays = [1500, 3000];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30000)
        }
      );

      const data = await response.json();

      if (response.ok) {
        const text = (data.candidates?.[0]?.content?.parts || [])
          .map(p => p.text || "")
          .join("\n");

        if (text) return text;

        console.error("Empty Gemini response:", model, data);
        return null;
      }

      console.error(
        `Gemini error | Model: ${model} | Attempt: ${attempt + 1} | Status: ${response.status}`,
        data
      );

      // Retry only temporary errors.
      if (![429, 500, 503, 504].includes(response.status)) {
        return null;
      }

    } catch (error) {
      console.error(`Gemini connection error | ${model}:`, error.message);
    }

    if (attempt < 2) {
      await wait(delays[attempt]);
    }
  }

  return null;
}

http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "POST" && url === "/api/chat") {
    const ip = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress || "").split(",")[0];

    if (limited(ip)) {
      res.writeHead(429, {
        "Content-Type": "application/json"
      });
      return res.end("{}");
    }

    let body = "";

    req.on("data", c => {
      body += c;
      if (body.length > 40000) req.destroy();
    });

    req.on("end", async () => {
      try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
          console.error("GEMINI_API_KEY is missing");
          res.writeHead(500);
          return res.end("{}");
        }

        const { system, messages } = JSON.parse(body || "{}");

        if (!Array.isArray(messages) || !messages.length) {
          res.writeHead(400);
          return res.end("{}");
        }

        const contents = messages.slice(-12).map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{
            text: String(m.content || "").slice(0, 2000)
          }]
        }));

        const requestBody = {
          systemInstruction: {
            parts: [{
              text: String(system || "").slice(0, 1500)
            }]
          },
          contents,
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.7
          }
        };

        const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";

        const models = [
          ...new Set([
            primary,
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite"
          ])
        ];

        let answer = null;

        for (const model of models) {
          console.log("Trying Gemini model:", model);

          answer = await askGemini(model, apiKey, requestBody);

          if (answer) {
            console.log("Gemini success:", model);
            break;
          }

          console.log("Trying next model...");
        }

        if (!answer) {
          console.error("All Gemini models failed");
          res.writeHead(502, {
            "Content-Type": "application/json"
          });
          return res.end("{}");
        }

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({ text: answer }));

      } catch (error) {
        console.error("Server error:", error.message);
        res.writeHead(500);
        res.end("{}");
      }
    });

    return;
  }

  const f = FILES[url];

  if (req.method === "GET" && f) {
    res.writeHead(200, { "Content-Type": f[1] });
    return fs.createReadStream(
      path.join(__dirname, "public", f[0])
    ).pipe(res);
  }

  res.writeHead(404);
  res.end("Not found");

}).listen(process.env.PORT || 3000);
