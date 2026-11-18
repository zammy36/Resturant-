// Zero-dependency server: serves the app and syncs live state between
// customer phones, the staff tablet and the kitchen display.
// Run:  node server.js   (then open http://<your-ip>:3000)
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const core = require("./store-core.js");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "state.json");
const ROOT = __dirname;

let state = core.emptyState();
try { state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (_) {}

const clients = new Set();
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(state), () => {}), 200);
}
function broadcast() {
  const msg = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) res.write(msg);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};
const PUBLIC = new Set(["index.html", "app.js", "data.js", "store-core.js", "qrcode.js", "styles.css", "manifest.webmanifest", "icon.svg"]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/api/state" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(state));
  }

  if (url.pathname === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (url.pathname === "/api/action" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try {
        const action = JSON.parse(body);
        state = core.reduce(state, action);
        persist();
        broadcast();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state));
      } catch (e) {
        res.writeHead(400); res.end("bad request");
      }
    });
    return;
  }

  let file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!PUBLIC.has(file)) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(path.join(ROOT, file), (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\nRestaurant app running:`);
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) console.log(`  Same Wi-Fi:     http://${i.address}:${PORT}`);
    }
  }
  console.log(`\nOpen the "Same Wi-Fi" link on the counter PC, print the table QR codes from there.\n`);
});
