// /api/settings — read/write the SQLite settings table, report whether AI is
// needed, and test the Uptime Kuma connection. Last verified: 2026-10-07.
const express = require('express');
const router = express.Router();
const { getAllSettings, setSetting, getSetting } = require('../db');
const { testConnection } = require('../kuma');
const { needsAI } = require('../ai');
const log = require('../log');
const { CODES } = require('../codes');

// GET /api/settings
router.get('/', (req, res) => {
  const settings = getAllSettings();
  // Mask password
  if (settings.kumaPassword) settings.kumaPassword = '••••••••';
  res.json(settings);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const allowed = ['aiProvider', 'aiApiKey', 'aiModel', 'aiBaseUrl', 'kumaUrl', 'kumaUsername', 'kumaPassword',
    'anthropicApiKey', // kept for backward compat
    'suggestHttp', 'suggestPort', 'suggestPing', 'suggestDns', 'suggestDocker', 'suggestDatabase',
    'useContainerNames', 'useTraefikLabels', 'groupByContainer', 'preferPublicUrl',
  ];
  const body = req.body || {};
  const updates = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      // Branch: skip masked password (don't overwrite with placeholder)
      if (key === 'kumaPassword' && body[key] === '••••••••') continue;
      // External call: SQLite write
      setSetting(key, body[key]);
      updates.push(key);
    }
  }

  // Key names only — values may be secrets
  log.info(CODES.SETTINGS_UPDATED, 'settings.updated', { keys: updates });
  res.json({ ok: true, updated: updates });
});

// GET /api/settings/ai-status — whether AI is needed and whether it's configured
router.get('/ai-status', (req, res) => {
  const monitorSettings = {
    suggestHttp:     (getSetting('suggestHttp')     ?? 'true') !== 'false',
    suggestDns:      (getSetting('suggestDns')      ?? 'false') !== 'false',
    suggestDatabase: (getSetting('suggestDatabase') ?? 'true') !== 'false',
  };
  const required = needsAI(monitorSettings);
  const configured = !!(getSetting('aiApiKey') || getSetting('anthropicApiKey') || process.env.ANTHROPIC_API_KEY);
  const provider = getSetting('aiProvider') || 'anthropic';
  // Ollama doesn't need an API key
  const ready = !required || provider === 'ollama' || configured;
  res.json({ required, ready });
});

// POST /api/settings/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    // External call: Uptime Kuma over socket.io (connect + login, then disconnect)
    await testConnection();
    log.info(CODES.KUMA_CONNECTION_OK, 'kuma.connection_ok', {});
    res.json({ ok: true, message: 'Connected to Uptime Kuma successfully' });
  } catch (err) {
    // Error path: not configured, unreachable or login refused -> 400 with the reason (E09)
    log.warn(CODES.KUMA_CONNECTION_FAILED, 'kuma.connection_failed', { error: err.message });
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
