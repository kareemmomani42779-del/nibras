
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

http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "POST" && url === "/api/chat") {
    const ip = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress || "").split(",")[0];

    if (limited(ip)) {
      res.writeHead(429);
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

        const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
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
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error("Gemini API error:", response.status, data);
          res.writeHead(502);
          return res.end("{}");
        }

        const text = (data.candidates?.[0]?.content?.parts || [])
          .map(p => p.text || "")
          .join("\n");

        if (!text) {
          res.writeHead(502);
          return res.end("{}");
        }

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({ text }));

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
