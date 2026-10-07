// Structured logger for the KumaGen server.
//
// Purpose: emit one JSON line per event — { ts, level, code, event, data } —
// so the server's behaviour can be diagnosed from its output alone.
// Last verified: 2026-10-07.
//
// Logs go to stdout only and are append-only: this process never rotates,
// truncates or deletes them. Rotation is the job of whatever captures stdout
// (Docker's log driver in production). NEVER pass secrets in `data`
// (aiApiKey, kumaPassword, container DB env values).

const { CODES } = require('./codes');

// A run that succeeds but takes longer than this still gets a summary line.
const config = { slowRunMs: Number(process.env.KUMAGEN_SLOW_RUN_MS) || 10000 };

let sink = (line) => process.stdout.write(line + '\n');

// Tests swap the sink to capture lines and keep the reporter output clean.
function setSink(fn) {
  const prev = sink;
  sink = fn;
  return prev;
}

function emit(level, code, event, data = {}) {
  const record = { ts: new Date().toISOString(), level, code, event, data };
  sink(JSON.stringify(record));
  return record;
}

const info = (code, event, data) => emit('info', code, event, data);
const warn = (code, event, data) => emit('warn', code, event, data);
const error = (code, event, data) => emit('error', code, event, data);

// A run groups the events and stage timings of one door invocation and ends
// with a summary line when it failed, had failed items, or was slow.
function startRun(name) {
  const started = Date.now();
  const codes = [];

  const run = {
    name,
    record(level, code, event, data) {
      codes.push(code);
      return emit(level, code, event, { run: name, ...data });
    },

    // Times one stage; logs S20 on success, E20 (and rethrows) on failure.
    async stage(stage, fn) {
      const t0 = Date.now();
      try {
        const out = await fn();
        run.record('info', CODES.STAGE_COMPLETED, 'stage.completed', { stage, duration_ms: Date.now() - t0 });
        return out;
      } catch (err) {
        run.record('error', CODES.STAGE_FAILED, 'stage.failed', { stage, duration_ms: Date.now() - t0, error: err.message });
        throw err;
      }
    },

    // state: 'ok' | 'partial' | 'failed'. Silent successes stay silent.
    finish(state, data = {}) {
      const duration_ms = Date.now() - started;
      const failed = state !== 'ok';
      if (!failed && duration_ms <= config.slowRunMs) return null;
      return emit(failed ? 'error' : 'warn', failed ? CODES.RUN_FAILED : CODES.RUN_SUMMARY, 'run.summary', {
        run: name, state, duration_ms, codes: [...codes], ...data,
      });
    },
  };
  return run;
}

// Express middleware: one S10 line per request with status and duration.
function requestLogger() {
  return (req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      info(CODES.HTTP_REQUEST, 'http.request', {
        method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, duration_ms: Date.now() - t0,
      });
    });
    next();
  };
}

module.exports = { info, warn, error, startRun, requestLogger, setSink, config };
