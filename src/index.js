// KumaGen server — process door.
//
// Purpose: serve the /api/* JSON API (containers, suggestions, monitors,
// settings) and the built React SPA. Trigger: `node src/index.js` (npm start,
// Docker CMD); runs on demand, no scheduler. Last verified: 2026-10-07.
// Logs: JSON lines on stdout, codes in src/codes.js.
require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const log = require('./log');
const { CODES } = require('./codes');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());
app.use(log.requestLogger());

// API routes
app.use('/api/settings', require('./routes/settings'));
app.use('/api/containers', require('./routes/containers'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/monitors', require('./routes/monitors'));

// Serve built React app in production
const webDist = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(webDist));
// SPA fallback: any non-API path gets index.html (404 when the client is not built)
app.get('/{*splat}', (req, res) => {
  res.sendFile('index.html', { root: webDist });
});

app.listen(PORT, () => {
  log.info(CODES.SERVER_LISTENING, 'server.listening', { msg: `KumaGen server running on http://localhost:${PORT}`, port: Number(PORT) });
});
