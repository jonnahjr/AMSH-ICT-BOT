// Application entry point (compatible with Plesk, Render, Railway, VPS)
const http = require('http');

// Provide lightweight HTTP health check endpoint for cloud platforms (Render/Railway)
const port = process.env.PORT;
if (port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Amanuel Mental Specialized Hospital IT Support Bot is running.\n');
  });
  server.listen(port, () => {
    console.log(`HTTP health check server listening on port ${port}`);
  });
}

require('./src/index');

