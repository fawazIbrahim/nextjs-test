// Zero-dependency stand-in for Grafana Alloy's OTLP/HTTP receiver, for
// local development only. Logs every request it receives (method, path,
// content-type, byte size) so you can see traces/metrics arriving, then
// responds 200. Point ALLOY_URL at this server instead of a real Alloy
// instance. See README.md "Run it locally" and design/DESIGN.md §7.3/§8.
import http from "node:http";

const port = Number(process.env.MOCK_OTLP_PORT) || 4318;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const bytes = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const contentType = req.headers["content-type"] ?? "(none)";
    console.log(`[mock-otlp] ${req.method} ${req.url}  content-type=${contentType}  bytes=${bytes}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });
});

server.listen(port, () => {
  console.log(`[mock-otlp] listening on http://localhost:${port}`);
  console.log(`[mock-otlp] set ALLOY_URL=http://localhost:${port} in .env.local`);
});
