// Event-code registry for KumaGen's structured logs.
//
// Purpose: every named path the server logs carries one permanent code, so a
// failure can be grepped across runs (`grep '"code":"E07"'`) without knowing
// the message text. Last verified: 2026-10-07.
//
// Rules (core-tenets §1):
//   - Codes are PERMANENT. Never renumber, never reuse a retired code; add new
//     ones at the end of their series. A renamed event keeps its code.
//   - Exxx = a failure mode, Sxxx = a success/progress path.
//   - docs/spec.md carries the human-readable table; keep the two in step.

const CODES = Object.freeze({
  // ---- success / progress ----
  SERVER_LISTENING:        'S01', // process door bound its port
  CONTAINERS_LISTED:       'S02', // GET /api/containers answered
  SUGGESTIONS_GENERATED:   'S03', // POST /api/suggestions answered
  MONITORS_ADDED:          'S04', // POST /api/monitors finished (may include per-monitor E08s)
  SETTINGS_UPDATED:        'S05', // PUT /api/settings stored keys (names only, never values)
  KUMA_CONNECTION_OK:      'S06', // POST /api/settings/test-connection succeeded
  HTTP_REQUEST:            'S10', // one line per HTTP request: method, path, status, duration_ms
  STAGE_COMPLETED:         'S20', // a timed stage inside a run finished
  RUN_SUMMARY:             'S90', // run summary: slow success

  // ---- failures ----
  DOCKER_UNAVAILABLE:      'E01', // Docker socket did not answer ping -> 503
  CONTAINERS_LIST_FAILED:  'E02', // listing containers or reading the DB threw -> 500
  SUGGESTIONS_BAD_REQUEST: 'E03', // containerIds missing/empty -> 400
  SUGGESTIONS_NOT_FOUND:   'E04', // none of the requested containers exist -> 404
  SUGGESTIONS_FAILED:      'E05', // Docker/OpenAPI/AI pipeline threw (incl. missing AI key, bad AI JSON) -> 500
  MONITORS_BAD_REQUEST:    'E06', // monitors missing/empty -> 400
  MONITORS_ADD_FAILED:     'E07', // Kuma config/connect/login/group creation threw -> 500
  MONITOR_REJECTED:        'E08', // Kuma rejected one monitor inside an otherwise-successful batch
  KUMA_CONNECTION_FAILED:  'E09', // POST /api/settings/test-connection failed -> 400
  STAGE_FAILED:            'E20', // a timed stage inside a run threw
  RUN_FAILED:              'E90', // run summary: run ended in failure or with failed items
});

module.exports = { CODES };
