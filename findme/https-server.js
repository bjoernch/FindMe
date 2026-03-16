const https = require("https");
const fs = require("fs");
const path = require("path");
const { parse } = require("url");
const next = require("next");

const dev = false;
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const certPath = process.env.SSL_CERT || "/app/certs/selfsigned.crt";
const keyPath = process.env.SSL_KEY || "/app/certs/selfsigned.key";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  https
    .createServer(options, async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Error occurred handling", req.url, err);
        res.statusCode = 500;
        res.end("internal server error");
      }
    })
    .listen(port, hostname, () => {
      console.log(`> HTTPS server ready on https://${hostname}:${port}`);
    });
});
