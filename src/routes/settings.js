// /api/settings — read/write the SQLite settings table, report whether AI is
// needed, and test the Uptime Kuma connection. Last verified: 2026-10-07.
const express = require('express');
const router = express.Router();
const { getAllSettings, setSetting, getMonitorSettings } = require('../db');
const { testConnection } = require('../kuma');
const { needsAI, resolveAiConfig } = require('../ai');
const log = require('../log');
const { CODES } = require('../codes');

// Secret settings are never sent to the client; a PUT echoing the mask is ignored
const MASK = '••••••••';
const SECRET_KEYS = ['kumaPassword', 'aiApiKey', 'anthropicApiKey'];

// GET /api/settings
router.get('/', (req, res) => {
  const settings = getAllSettings();
  for (const key of SECRET_KEYS) {
    if (settings[key]) settings[key] = MASK;
  }
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
    // Branch: absent or null keys are left unchanged (the column is NOT NULL)
    if (body[key] != null) {
      // Branch: skip a masked secret (don't overwrite with placeholder)
      if (SECRET_KEYS.includes(key) && body[key] === MASK) continue;
      // External call: SQLite write; values are stored as text (JSON true -> 'true'),
      // since better-sqlite3 cannot bind booleans
      setSetting(key, String(body[key]));
      updates.push(key);
    }
  }

  // Key names only — values may be secrets
  log.info(CODES.SETTINGS_UPDATED, 'settings.updated', { keys: updates });
  res.json({ ok: true, updated: updates });
});

// GET /api/settings/ai-status — whether AI is needed and whether it's configured
router.get('/ai-status', (req, res) => {
  const required = needsAI(getMonitorSettings());
  const ready = !required || resolveAiConfig().ready;
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
