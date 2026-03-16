const express = require('express');
const router = express.Router();
const { listContainers, getContainerEnvKeys } = require('../docker');
const { getOpenApiSpecs } = require('../openapi');
const { suggestMonitors, needsAI } = require('../ai');
const { getSetting } = require('../db');

// POST /api/suggestions
// Body: { containerIds: string[] }
router.post('/', async (req, res) => {
  const { containerIds } = req.body;
  if (!Array.isArray(containerIds) || containerIds.length === 0) {
    return res.status(400).json({ error: 'containerIds must be a non-empty array' });
  }

  try {
    // Fetch full container list and filter to selected ones
    const allContainers = await listContainers();
    const selected = allContainers.filter(c => containerIds.includes(c.id));

    if (selected.length === 0) {
      return res.status(404).json({ error: 'None of the specified containers were found' });
    }

    const monitorSettings = {
      suggestHttp:      (getSetting('suggestHttp')      ?? 'true') !== 'false',
      suggestPort:      (getSetting('suggestPort')      ?? 'true') !== 'false',
      suggestPing:      (getSetting('suggestPing')      ?? 'true') !== 'false',
      suggestDns:       (getSetting('suggestDns')       ?? 'false') !== 'false',
      suggestDocker:    (getSetting('suggestDocker')    ?? 'true') !== 'false',
      suggestDatabase:  (getSetting('suggestDatabase')  ?? 'true') !== 'false',
      useContainerNames:  (getSetting('useContainerNames')  ?? 'false') !== 'false',
      useTraefikLabels:   (getSetting('useTraefikLabels')   ?? 'true')  !== 'false',
    };

    // Only enrich with env keys and OpenAPI specs if the AI will be invoked;
    // purely programmatic types (docker/port/ping) don't need this data
    const enriched = await Promise.all(
      selected.map(async c => {
        if (!needsAI(monitorSettings)) return c;
        const [envKeys, openApiSpecs] = await Promise.all([
          getContainerEnvKeys(c.id),
          getOpenApiSpecs(c),
        ]);
        return { ...c, envKeys, openApiSpecs };
      })
    );

    const suggestions = await suggestMonitors(enriched, monitorSettings);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
