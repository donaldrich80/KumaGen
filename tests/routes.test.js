// Characterization tests for the HTTP doors under /api/*.
// Pins current behaviour (status codes + response shapes) with Docker, Kuma and AI faked.

const { describe, it, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const skip = h.depsMissing();
// A skipped describe() is not counted in the runner's totals; this test makes the skip visible there.
if (skip) test(`${require('node:path').basename(__filename)} suite`, { skip }, () => {});

describe('HTTP API routes', { skip }, () => {
  let fakes, server, base, db;

  before(async () => {
    fakes = h.setupOffline();
    db = require(require('node:path').join(h.SERVER, 'db'));
    ({ server, base } = await h.listen(h.buildApp()));
  });

  after(() => server && server.close());

  beforeEach(() => {
    h.resetKuma();
    fakes.docker.available = true;
    fakes.docker.containers = [];
    fakes.docker.inspect = {};
    fakes.ai.calls = [];
  });

  describe('GET /api/settings', () => {
    it('returns the settings map with the Kuma password masked', async () => {
      db.setSetting('kumaUrl', 'http://kuma:3001');
      db.setSetting('kumaPassword', 'hunter2');
      const res = await h.request(base, 'GET', '/api/settings');
      assert.equal(res.status, 200);
      assert.equal(res.json.kumaUrl, 'http://kuma:3001');
      assert.equal(res.json.kumaPassword, '••••••••');
    });

    it('masks stored AI API keys too', async () => {
      db.setSetting('aiApiKey', 'sk-real-not-real');
      db.setSetting('anthropicApiKey', 'sk-legacy-not-real');
      const res = await h.request(base, 'GET', '/api/settings');
      assert.equal(res.json.aiApiKey, '••••••••');
      assert.equal(res.json.anthropicApiKey, '••••••••');
      db.setSetting('aiApiKey', '');
      db.setSetting('anthropicApiKey', '');
    });
  });

  describe('PUT /api/settings', () => {
    it('stores only allow-listed keys and reports which were updated', async () => {
      const res = await h.request(base, 'PUT', '/api/settings', {
        aiProvider: 'openai', groupByContainer: 'true', notAllowed: 'x',
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { ok: true, updated: ['aiProvider', 'groupByContainer'] });
      assert.equal(db.getSetting('aiProvider'), 'openai');
      assert.equal(db.getSetting('notAllowed'), null);
    });

    it('does not overwrite the stored password with the mask placeholder', async () => {
      db.setSetting('kumaPassword', 'real-secret');
      const res = await h.request(base, 'PUT', '/api/settings', { kumaPassword: '••••••••' });
      assert.deepEqual(res.json, { ok: true, updated: [] });
      assert.equal(db.getSetting('kumaPassword'), 'real-secret');
    });

    it('does not overwrite stored AI keys with the mask placeholder', async () => {
      db.setSetting('aiApiKey', 'sk-real-not-real');
      const res = await h.request(base, 'PUT', '/api/settings', { aiApiKey: '••••••••', anthropicApiKey: '••••••••' });
      assert.deepEqual(res.json, { ok: true, updated: [] });
      assert.equal(db.getSetting('aiApiKey'), 'sk-real-not-real');
      db.setSetting('aiApiKey', '');
    });

    it('stores JSON booleans as strings instead of failing', async () => {
      const res = await h.request(base, 'PUT', '/api/settings', { suggestDns: true, preferPublicUrl: false });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { ok: true, updated: ['suggestDns', 'preferPublicUrl'] });
      assert.equal(db.getSetting('suggestDns'), 'true');
      assert.equal(db.getSetting('preferPublicUrl'), 'false');
      db.setSetting('suggestDns', 'false');
      db.setSetting('preferPublicUrl', 'false');
    });
  });

  describe('GET /api/settings/ai-status', () => {
    it('reports AI not required when HTTP and DNS suggestions are off', async () => {
      db.setSetting('suggestHttp', 'false');
      db.setSetting('suggestDns', 'false');
      const res = await h.request(base, 'GET', '/api/settings/ai-status');
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { required: false, ready: true });
    });

    it('reports AI required but not ready when no key is configured', async () => {
      db.setSetting('suggestHttp', 'true');
      db.setSetting('aiProvider', 'anthropic');
      const res = await h.request(base, 'GET', '/api/settings/ai-status');
      assert.deepEqual(res.json, { required: true, ready: false });
    });

    it('reports ready for an OpenAI-compatible provider with base URL and model but no key', async () => {
      db.setSetting('suggestHttp', 'true');
      db.setSetting('aiProvider', 'openai-compatible');
      db.setSetting('aiBaseUrl', 'http://llm.local/v1');
      db.setSetting('aiModel', 'local-model');
      const res = await h.request(base, 'GET', '/api/settings/ai-status');
      assert.deepEqual(res.json, { required: true, ready: true });
      db.setSetting('aiBaseUrl', '');
      db.setSetting('aiModel', '');
    });

    it('reports not ready when only the legacy Anthropic key is set for another provider', async () => {
      db.setSetting('suggestHttp', 'true');
      db.setSetting('aiProvider', 'openai');
      db.setSetting('anthropicApiKey', 'legacy-not-real');
      const res = await h.request(base, 'GET', '/api/settings/ai-status');
      assert.deepEqual(res.json, { required: true, ready: false });
      db.setSetting('anthropicApiKey', '');
    });

    it('reports ready for ollama without a key', async () => {
      db.setSetting('suggestHttp', 'true');
      db.setSetting('aiProvider', 'ollama');
      const res = await h.request(base, 'GET', '/api/settings/ai-status');
      assert.deepEqual(res.json, { required: true, ready: true });
    });
  });

  describe('POST /api/settings/test-connection', () => {
    it('returns 200 ok when the fake Kuma accepts the login', async () => {
      db.setSetting('kumaUrl', 'http://kuma.test:3001');
      db.setSetting('kumaUsername', 'admin');
      db.setSetting('kumaPassword', 'pw');
      const res = await h.request(base, 'POST', '/api/settings/test-connection');
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { ok: true, message: 'Connected to Uptime Kuma successfully' });
    });

    it('returns 400 with the Kuma login error message', async () => {
      db.setSetting('kumaUrl', 'http://kuma.test:3001');
      db.setSetting('kumaUsername', 'admin');
      db.setSetting('kumaPassword', 'pw');
      fakes.kuma.loginOk = false;
      const res = await h.request(base, 'POST', '/api/settings/test-connection');
      assert.equal(res.status, 400);
      assert.deepEqual(res.json, { ok: false, error: 'Incorrect username or password.' });
    });
  });

  describe('GET /api/containers', () => {
    it('returns 503 when the Docker socket is unreachable', async () => {
      fakes.docker.available = false;
      const res = await h.request(base, 'GET', '/api/containers');
      assert.equal(res.status, 503);
      assert.match(res.json.error, /Docker socket not available/);
    });

    it('lists containers with monitored flag and existing monitors', async () => {
      const monitoredId = 'b'.repeat(64);
      fakes.docker.containers = [
        h.rawContainer(),
        h.rawContainer({ Id: monitoredId, Names: ['/db'], Image: 'postgres:16', Ports: [] }),
      ];
      db.recordMonitors(monitoredId, 'db', [{ monitorId: 7, name: 'db - Ping', type: 'ping' }]);

      const res = await h.request(base, 'GET', '/api/containers');
      assert.equal(res.status, 200);
      assert.equal(res.json.length, 2);
      const [web, pg] = res.json;
      assert.equal(web.name, 'web');
      assert.equal(web.monitored, false);
      assert.deepEqual(web.existingMonitors, []);
      assert.equal(pg.monitored, true);
      assert.equal(pg.existingMonitors.length, 1);
      assert.equal(pg.existingMonitors[0].monitor_name, 'db - Ping');
      assert.equal(pg.existingMonitors[0].monitor_id, 7);
    });
  });

  describe('POST /api/suggestions', () => {
    it('rejects a missing or empty containerIds with 400', async () => {
      const res = await h.request(base, 'POST', '/api/suggestions', { containerIds: [] });
      assert.equal(res.status, 400);
      assert.deepEqual(res.json, { error: 'containerIds must be a non-empty array' });
    });

    it('returns 404 when none of the ids match a running container', async () => {
      fakes.docker.containers = [h.rawContainer()];
      const res = await h.request(base, 'POST', '/api/suggestions', { containerIds: ['nope'] });
      assert.equal(res.status, 404);
      assert.deepEqual(res.json, { error: 'None of the specified containers were found' });
    });

    it('returns programmatic suggestions keyed by container id without calling AI', async () => {
      db.setSetting('suggestHttp', 'false');
      db.setSetting('suggestDns', 'false');
      const raw = h.rawContainer({ Names: ['/pg'], Image: 'postgres:16', Ports: [{ PrivatePort: 5432, PublicPort: 15432, Type: 'tcp' }] });
      fakes.docker.containers = [raw];
      fakes.docker.inspect[raw.Id] = { Config: { Env: ['POSTGRES_USER=app', 'POSTGRES_PASSWORD=p@ss', 'PATH=/bin'] } };

      const res = await h.request(base, 'POST', '/api/suggestions', { containerIds: [raw.Id] });
      assert.equal(res.status, 200);
      assert.equal(fakes.ai.calls.length, 0);
      const suggs = res.json.suggestions[raw.Id];
      assert.deepEqual(suggs.map(s => s.type), ['docker', 'ping', 'port', 'postgres']);
      assert.equal(suggs[3].databaseConnectionString, 'postgres://app:p%40ss@localhost:15432/postgres');
    });

    it('returns 500 with the provider error when AI is needed but no key is set', async () => {
      db.setSetting('suggestHttp', 'true');
      db.setSetting('aiProvider', 'anthropic');
      fakes.docker.containers = [h.rawContainer({ Ports: [] })];
      const res = await h.request(base, 'POST', '/api/suggestions', { containerIds: [h.rawContainer().Id] });
      assert.equal(res.status, 500);
      assert.deepEqual(res.json, { error: 'Anthropic API key not configured. Set it in Settings.' });
    });
  });

  describe('POST /api/monitors', () => {
    before(() => {
      db.setSetting('kumaUrl', 'http://kuma.test:3001');
      db.setSetting('kumaUsername', 'admin');
      db.setSetting('kumaPassword', 'pw');
    });

    it('rejects an empty monitors array with 400', async () => {
      const res = await h.request(base, 'POST', '/api/monitors', { monitors: [] });
      assert.equal(res.status, 400);
      assert.deepEqual(res.json, { error: 'monitors must be a non-empty array' });
    });

    it('adds monitors, reports per-monitor results and records successes', async () => {
      fakes.kuma.failNames = new Set(['c1 - Bad']);
      const res = await h.request(base, 'POST', '/api/monitors', {
        monitors: [
          { containerId: 'c1', containerName: 'c1', type: 'ping', name: 'c1 - Ping', hostname: 'localhost' },
          { containerId: 'c1', containerName: 'c1', type: 'port', name: 'c1 - Bad', hostname: 'localhost', port: 1 },
        ],
        options: { groupByContainer: false },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.summary, { succeeded: 1, failed: 1 });
      assert.deepEqual(res.json.results[0], {
        containerId: 'c1', containerName: 'c1', name: 'c1 - Ping', type: 'ping', ok: true, monitorID: 100,
      });
      assert.deepEqual(res.json.results[1], {
        containerId: 'c1', containerName: 'c1', name: 'c1 - Bad', ok: false, error: 'rejected by fake kuma',
      });
      const rows = db.getMonitorsByContainerId('c1');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].monitor_name, 'c1 - Ping');
    });

    it('returns 500 when Kuma is unreachable', async () => {
      fakes.kuma.connectError = 'ECONNREFUSED';
      const res = await h.request(base, 'POST', '/api/monitors', {
        monitors: [{ containerId: 'c2', containerName: 'c2', type: 'ping', name: 'c2 - Ping' }],
      });
      assert.equal(res.status, 500);
      assert.deepEqual(res.json, { error: 'Cannot connect to Uptime Kuma: ECONNREFUSED' });
    });
  });
});
