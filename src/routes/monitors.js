// POST /api/monitors — create the reviewed monitors in Uptime Kuma and record
// the successes in SQLite. Last verified: 2026-10-07.
const express = require('express');
const router = express.Router();
const { addMonitors } = require('../kuma');
const { recordMonitors, getBoolSetting } = require('../db');
const log = require('../log');
const { CODES } = require('../codes');

// POST /api/monitors
// Body: { monitors: Array<{ containerId, containerName, ...kumaMonitorFields }> }
router.post('/', async (req, res) => {
  const { monitors, options = {} } = req.body || {};
  // Error path: nothing to add -> 400 (E06)
  if (!Array.isArray(monitors) || monitors.length === 0) {
    log.warn(CODES.MONITORS_BAD_REQUEST, 'monitors.bad_request', {});
    return res.status(400).json({ error: 'monitors must be a non-empty array' });
  }

  // Branch: caller can pass options.groupByContainer explicitly; falls back to stored setting
  const groupByContainer =
    options.groupByContainer !== undefined
      ? options.groupByContainer
      : getBoolSetting('groupByContainer', false);

  const run = log.startRun('monitors');
  try {
    // External call: Uptime Kuma over socket.io (login, then one 'add' per monitor)
    const results = await run.stage('kuma.add', () => addMonitors(monitors, { groupByContainer }));

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
      } else {
        // Error path: Kuma rejected this one monitor; the batch continues (E08)
        run.record('warn', CODES.MONITOR_REJECTED, 'monitors.rejected', {
          containerId: r.containerId, name: r.name, error: r.error,
        });
      }
    }

    // External call: SQLite write of the monitors Kuma accepted
    for (const [containerId, data] of Object.entries(byContainer)) {
      if (data.monitors.length > 0) {
        recordMonitors(containerId, data.name, data.monitors);
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    run.record('info', CODES.MONITORS_ADDED, 'monitors.added', { succeeded, failed, groupByContainer });
    run.finish(failed > 0 ? 'partial' : 'ok', { succeeded, failed });
    res.json({ results, summary: { succeeded, failed } });
  } catch (err) {
    // Error path: Kuma not configured, unreachable, login refused, or group creation failed -> 500 (E07)
    run.record('error', CODES.MONITORS_ADD_FAILED, 'monitors.add_failed', { error: err.message });
    run.finish('failed', { requested: monitors.length });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
