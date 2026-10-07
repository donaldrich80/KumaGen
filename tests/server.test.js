// Characterization test for the process door: `node server/index.js`.
// Boots the real entrypoint as a subprocess on a free port with a scrubbed env,
// a temp DB and a temp cwd (so dotenv cannot pick up a real .env).

const { describe, it, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const h = require('./helpers');

const skip = h.depsMissing();
// A skipped describe() is not counted in the runner's totals; this test makes the skip visible there.
if (skip) test(`${require('node:path').basename(__filename)} suite`, { skip }, () => {});

describe('server/index.js entrypoint', { skip }, () => {
  let child, base, stdout = '';

  before(async () => {
    const port = await h.freePort();
    const dir = h.tempDir();
    const env = {
      PATH: process.env.PATH,
      HOME: dir,
      PORT: String(port),
      DB_PATH: path.join(dir, 'kumagen.db'),
    };
    child = spawn(process.execPath, [path.join(h.SERVER, 'index.js')], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    base = `http://127.0.0.1:${port}`;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start; stdout: ${stdout}`)), 15000);
      child.stdout.on('data', (d) => {
        stdout += d;
        if (stdout.includes('KumaGen server running')) { clearTimeout(timer); resolve(); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}; stdout: ${stdout}`)); });
    });
  });

  after(() => { if (child && child.exitCode === null) child.kill('SIGTERM'); });

  it('logs its listen URL using the PORT env var', () => {
    assert.match(stdout, /KumaGen server running on http:\/\/localhost:\d+/);
  });

  it('serves GET /api/settings as JSON with 200 (empty DB -> {})', async () => {
    const res = await h.request(base, 'GET', '/api/settings');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.deepEqual(res.json, {});
  });

  it('answers CORS (cors() middleware is mounted)', async () => {
    const res = await h.request(base, 'GET', '/api/settings');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  it('SPA catch-all returns 404 when client/dist has not been built', { skip: require('node:fs').existsSync(path.join(h.ROOT, 'client', 'dist', 'index.html')) ? 'client/dist is built; catch-all would serve index.html' : false }, async () => {
    const res = await h.request(base, 'GET', '/some/client/route');
    assert.equal(res.status, 404);
  });
});
