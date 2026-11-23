// خادم نبراس: يقدّم الموقع ويوصل المحادثة بـ Anthropic API. المفتاح يبقى في متغيرات Render فقط.
const http = require("http"), fs = require("fs"), path = require("path");
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
const hits = new Map(); // حد بسيط: 20 رسالة بالدقيقة لكل IP
function limited(ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 60000);
  a.push(now); hits.set(ip, a); return a.length > 20;
}
http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (req.method === "POST" && url === "/api/chat") {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0];
    if (limited(ip)) { res.writeHead(429); return res.end("{}"); }
    let body = "";
    req.on("data", c => { body += c; if (body.length > 40000) req.destroy(); });
    req.on("end", async () => {
      try {
        const { system, messages } = JSON.parse(body || "{}");
        if (!Array.isArray(messages) || !messages.length) { res.writeHead(400); return res.end("{}"); }
        const clean = messages.slice(-12).map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || "").slice(0, 2000)
        }));
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: 800, system: String(system || "").slice(0, 1500), messages: clean })
        });
        const d = await r.json();
        if (!r.ok) { res.writeHead(502); return res.end("{}"); }
        const text = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ text }));
      } catch (e) { res.writeHead(500); res.end("{}"); }
    });
    return;
  }
  const f = FILES[url];
  if (req.method === "GET" && f) {
    res.writeHead(200, { "content-type": f[1] });
    return fs.createReadStream(path.join(__dirname, "public", f[0])).pipe(res);
  }
  res.writeHead(404); res.end("Not found");
}).listen(process.env.PORT || 3000);
