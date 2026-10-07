// POST /api/suggestions — build monitor suggestions for the selected
// containers: programmatic rules first, AI only when an enabled monitor type
// needs it. Last verified: 2026-10-07.
const express = require('express');
const router = express.Router();
const { listContainers, getContainerEnvKeys, getContainerDbEnv } = require('../docker');
const { getOpenApiSpecs } = require('../openapi');
const { suggestMonitors, needsAI } = require('../ai');
const { getMonitorSettings } = require('../db');
const log = require('../log');
const { CODES } = require('../codes');

// POST /api/suggestions
// Body: { containerIds: string[] }
router.post('/', async (req, res) => {
  const { containerIds } = req.body || {};
  // Error path: nothing selected -> 400 (E03)
  if (!Array.isArray(containerIds) || containerIds.length === 0) {
    log.warn(CODES.SUGGESTIONS_BAD_REQUEST, 'suggestions.bad_request', {});
    return res.status(400).json({ error: 'containerIds must be a non-empty array' });
  }

  const run = log.startRun('suggestions');
  try {
    // External call: Docker listContainers; then filter to the selected ones
    const allContainers = await run.stage('docker.list', () => listContainers());
    const selected = allContainers.filter(c => containerIds.includes(c.id));

    // Error path: none of the ids exist (stale UI selection) -> 404 (E04)
    if (selected.length === 0) {
      run.record('warn', CODES.SUGGESTIONS_NOT_FOUND, 'suggestions.not_found', { requested: containerIds.length });
      run.finish('failed', { requested: containerIds.length });
      return res.status(404).json({ error: 'None of the specified containers were found' });
    }

    const monitorSettings = getMonitorSettings();

    // Branch: AI is only consulted when HTTP/DNS suggestions are enabled; otherwise
    // env keys and OpenAPI probes are skipped entirely.
    const isAI = needsAI(monitorSettings);
    // External calls: Docker inspect (env keys, allow-listed DB env), and HTTP
    // GETs against host-mapped ports on localhost for OpenAPI specs
    const enriched = await run.stage('enrich', () => Promise.all(
      selected.map(async c => {
        const [envKeys, openApiSpecs, dbEnv] = await Promise.all([
          isAI ? getContainerEnvKeys(c.id) : Promise.resolve([]),
          isAI ? getOpenApiSpecs(c) : Promise.resolve([]),
          monitorSettings.suggestDatabase ? getContainerDbEnv(c.id) : Promise.resolve({}),
        ]);
        return { ...c, envKeys, openApiSpecs, dbEnv };
      })
    ));

    // External call (when isAI): the configured AI provider via the ai SDK
    const suggestions = await run.stage('suggest', () => suggestMonitors(enriched, monitorSettings));
    const count = Object.values(suggestions || {}).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
    run.record('info', CODES.SUGGESTIONS_GENERATED, 'suggestions.generated', { containers: selected.length, suggestions: count, ai: isAI });
    run.finish('ok', { containers: selected.length });
    res.json({ suggestions });
  } catch (err) {
    // Error path: Docker, enrichment or AI threw (no key, bad JSON, provider error) -> 500 (E05)
    run.record('error', CODES.SUGGESTIONS_FAILED, 'suggestions.failed', { error: err.message });
    run.finish('failed', { requested: containerIds.length });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
