// Simple HTTPS proxy that forwards to the HTTP Docker container
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HTTPS_PORT = 3443;
const HTTP_TARGET = "http://127.0.0.1:3001";

const opts = {
  key: fs.readFileSync(path.join(__dirname, "certs", "selfsigned.key")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "selfsigned.crt")),
};

https.createServer(opts, (clientReq, clientRes) => {
  const targetUrl = new URL(clientReq.url, HTTP_TARGET);

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: 3001,
      path: clientReq.url,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: clientReq.headers.host,
        "x-forwarded-proto": "https",
        "x-forwarded-host": clientReq.headers.host,
      },
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on("error", (e) => {
    console.error("Proxy error:", e.message);
    clientRes.writeHead(502);
    clientRes.end("Bad Gateway");
  });

  clientReq.pipe(proxyReq);
}).listen(HTTPS_PORT, "0.0.0.0", () => {
  console.log(`HTTPS proxy ready on https://localhost:${HTTPS_PORT}`);
  console.log(`Forwarding to ${HTTP_TARGET}`);
});
