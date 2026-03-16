const express = require('express');
const router = express.Router();
const { listContainers, isDockerAvailable } = require('../docker');
const { getMonitoredContainerIds, getMonitorsByContainerId } = require('../db');

// GET /api/containers
router.get('/', async (req, res) => {
  const available = await isDockerAvailable();
  if (!available) {
    return res.status(503).json({
      error: 'Docker socket not available. Ensure /var/run/docker.sock is mounted.',
    });
  }

  try {
    const containers = await listContainers();
    const monitoredIds = await getMonitoredContainerIds();

    const result = containers.map(c => ({
      ...c,
      monitored: monitoredIds.has(c.id),
      existingMonitors: monitoredIds.has(c.id) ? getMonitorsByContainerId(c.id) : [],
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
