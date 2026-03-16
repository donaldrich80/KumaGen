const express = require('express');
const router = express.Router();
const { listContainers, getContainerEnvKeys } = require('../docker');
const { getOpenApiSpecs } = require('../openapi');
const { suggestMonitors } = require('../ai');

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

    // Enrich with env keys and OpenAPI specs in parallel
    const enriched = await Promise.all(
      selected.map(async c => {
        const [envKeys, openApiSpecs] = await Promise.all([
          getContainerEnvKeys(c.id),
          getOpenApiSpecs(c),
        ]);
        return { ...c, envKeys, openApiSpecs };
      })
    );

    const suggestions = await suggestMonitors(enriched);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
