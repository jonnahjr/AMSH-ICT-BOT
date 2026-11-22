// Application entry point (compatible with Plesk, Render, Railway, VPS)
// In webhook mode, Telegraf opens its own HTTP server on PORT — no separate server needed.
// In polling mode (local dev), there is no PORT, so we start a minimal health-check server.
const webhookDomain =
  process.env.WEBHOOK_DOMAIN ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);

if (!webhookDomain && process.env.PORT) {
  // Local dev with an explicit PORT — provide a plain health-check only
  const http = require('http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Amanuel Mental Specialized Hospital IT Support Bot is running.\n');
  });
  server.listen(process.env.PORT, () => {
    console.log(`HTTP health check server listening on port ${process.env.PORT}`);
  });
}

require('./src/index');

