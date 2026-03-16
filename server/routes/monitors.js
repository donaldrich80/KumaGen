const express = require('express');
const router = express.Router();
const { addMonitors } = require('../kuma');
const { recordMonitors } = require('../db');

// POST /api/monitors
// Body: { monitors: Array<{ containerId, containerName, ...kumaMonitorFields }> }
router.post('/', async (req, res) => {
  const { monitors } = req.body;
  if (!Array.isArray(monitors) || monitors.length === 0) {
    return res.status(400).json({ error: 'monitors must be a non-empty array' });
  }

  try {
    const results = await addMonitors(monitors);

    // Record successful additions in SQLite
    const byContainer = {};
    for (const r of results) {
      if (r.ok) {
        if (!byContainer[r.containerId]) {
          byContainer[r.containerId] = { name: r.containerName, monitors: [] };
        }
        byContainer[r.containerId].monitors.push({
          monitorId: r.monitorID,
          name: r.name,
          type: r.type || 'unknown',
        });
      }
    }

    for (const [containerId, data] of Object.entries(byContainer)) {
      if (data.monitors.length > 0) {
        recordMonitors(containerId, data.name, data.monitors);
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    res.json({ results, summary: { succeeded, failed } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
