const express = require('express');
const router = express.Router();
const { getAllSettings, setSetting, getSetting } = require('../db');
const { testConnection } = require('../kuma');
const { needsAI } = require('../ai');

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
  const updates = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      // Skip masked password (don't overwrite with placeholder)
      if (key === 'kumaPassword' && req.body[key] === '••••••••') continue;
      setSetting(key, req.body[key]);
      updates.push(key);
    }
  }

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
    await testConnection();
    res.json({ ok: true, message: 'Connected to Uptime Kuma successfully' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
