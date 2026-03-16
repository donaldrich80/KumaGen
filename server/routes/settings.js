const express = require('express');
const router = express.Router();
const { getAllSettings, setSetting } = require('../db');
const { testConnection } = require('../kuma');

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
