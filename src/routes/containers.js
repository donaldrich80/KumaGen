// GET /api/containers — list running Docker containers, flagged with whether
// KumaGen already created monitors for them. Last verified: 2026-10-07.
const express = require('express');
const router = express.Router();
const { listContainers, isDockerAvailable } = require('../docker');
const { getMonitoredContainerIds, getMonitorsByContainerId } = require('../db');
const log = require('../log');
const { CODES } = require('../codes');

// GET /api/containers
router.get('/', async (req, res) => {
  // External call: ping the Docker socket (/var/run/docker.sock)
  const available = await isDockerAvailable();
  // Error path: socket not mounted/answering -> 503 with mount hint (E01)
  if (!available) {
    log.error(CODES.DOCKER_UNAVAILABLE, 'containers.docker_unavailable', {});
    return res.status(503).json({
      error: 'Docker socket not available. Ensure /var/run/docker.sock is mounted.',
    });
  }

  try {
    // External calls: Docker listContainers, then SQLite reads of recorded monitors
    const containers = await listContainers();
    const monitoredIds = await getMonitoredContainerIds();

    const result = containers.map(c => ({
      ...c,
      monitored: monitoredIds.has(c.id),
      existingMonitors: monitoredIds.has(c.id) ? getMonitorsByContainerId(c.id) : [],
    }));

    log.info(CODES.CONTAINERS_LISTED, 'containers.listed', { count: result.length, monitored: monitoredIds.size });
    res.json(result);
  } catch (err) {
    // Error path: Docker or DB threw -> 500 with the raw message (E02)
    log.error(CODES.CONTAINERS_LIST_FAILED, 'containers.list_failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
