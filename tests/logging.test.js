// Structured-log contract: every documented event code in src/codes.js is
// emitted on its path, stages are timed, runs summarise failures, and secrets
// never reach the log. Offline: same fakes as routes.test.js.

const { describe, it, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const h = require('./helpers');

const skip = h.depsMissing();
// A skipped describe() is not counted in the runner's totals; this test makes the skip visible there.
if (skip) test(`${path.basename(__filename)} suite`, { skip }, () => {});

describe('structured logs and event codes', { skip }, () => {
  let fakes, server, base, db, log, CODES;

  const records = () => fakes.log.records;
  const byCode = (code) => records().filter(r => r.code === code);

  before(async () => {
    fakes = h.setupOffline();
    db = require(path.join(h.SERVER, 'db'));
    log = require(path.join(h.SERVER, 'log'));
    ({ CODES } = require(path.join(h.SERVER, 'codes')));
    ({ server, base } = await h.listen(h.buildApp()));
    db.setSetting('kumaUrl', 'http://kuma.test:3001');
    db.setSetting('kumaUsername', 'admin');
    db.setSetting('kumaPassword', 'pw-secret-value');
  });

  after(() => server && server.close());

  beforeEach(() => {
    h.resetKuma();
    h.resetLogs();
    log.config.slowRunMs = 10000;
    fakes.docker.available = true;
    fakes.docker.containers = [];
    fakes.docker.inspect = {};
  });

  describe('registry', () => {
    it('codes are unique and follow the Sxx/Exx scheme', () => {
      const values = Object.values(CODES);
      assert.equal(new Set(values).size, values.length);
      for (const v of values) assert.match(v, /^[SE]\d{2}$/);
    });
  });

  describe('record shape', () => {
    it('each line is JSON with ts, level, code, event and data', async () => {
      await h.request(base, 'GET', '/api/settings');
      const r = byCode(CODES.HTTP_REQUEST)[0];
      assert.ok(!Number.isNaN(Date.parse(r.ts)));
      assert.equal(r.level, 'info');
      assert.equal(r.event, 'http.request');
      assert.deepEqual(Object.keys(r.data).sort(), ['duration_ms', 'method', 'path', 'status']);
      assert.equal(r.data.status, 200);
      assert.equal(typeof r.data.duration_ms, 'number');
    });
  });

  describe('GET /api/containers', () => {
    it('S02 on success', async () => {
      fakes.docker.containers = [h.rawContainer()];
      await h.request(base, 'GET', '/api/containers');
      assert.equal(byCode(CODES.CONTAINERS_LISTED)[0].data.count, 1);
    });

    it('E01 when the Docker socket is unreachable', async () => {
      fakes.docker.available = false;
      await h.request(base, 'GET', '/api/containers');
      assert.equal(byCode(CODES.DOCKER_UNAVAILABLE).length, 1);
    });

    it('E02 when listing containers throws', async () => {
      const Docker = require(require.resolve('dockerode', { paths: [h.ROOT] }));
      const orig = Docker.prototype.listContainers;
      Docker.prototype.listContainers = async () => { throw new Error('daemon exploded'); };
      try {
        const res = await h.request(base, 'GET', '/api/containers');
        assert.equal(res.status, 500);
      } finally {
        Docker.prototype.listContainers = orig;
      }
      assert.equal(byCode(CODES.CONTAINERS_LIST_FAILED)[0].data.error, 'daemon exploded');
    });
  });

  describe('POST /api/suggestions', () => {
    it('E03 on an empty request', async () => {
      await h.request(base, 'POST', '/api/suggestions', { containerIds: [] });
      assert.equal(byCode(CODES.SUGGESTIONS_BAD_REQUEST).length, 1);
    });

    it('E04 and an E90 run summary when no container matches', async () => {
      await h.request(base, 'POST', '/api/suggestions', { containerIds: ['nope'] });
      assert.equal(byCode(CODES.SUGGESTIONS_NOT_FOUND).length, 1);
      const summary = byCode(CODES.RUN_FAILED)[0];
      assert.equal(summary.data.run, 'suggestions');
      assert.equal(summary.data.state, 'failed');
      assert.ok(summary.data.codes.includes(CODES.SUGGESTIONS_NOT_FOUND));
    });

    it('S03 with timed stages and no summary on a fast success', async () => {
      db.setSetting('suggestHttp', 'false');
      db.setSetting('suggestDns', 'false');
      const raw = h.rawContainer({ Names: ['/pg'], Image: 'postgres:16', Ports: [{ PrivatePort: 5432, PublicPort: 15432, Type: 'tcp' }] });
      fakes.docker.containers = [raw];
      fakes.docker.inspect[raw.Id] = { Config: { Env: ['POSTGRES_PASSWORD=db-secret-value'] } };
      await h.request(base, 'POST', '/api/suggestions', { containerIds: [raw.Id] });
      assert.equal(byCode(CODES.SUGGESTIONS_GENERATED)[0].data.ai, false);
      const stages = byCode(CODES.STAGE_COMPLETED).map(r => r.data.stage);
      assert.deepEqual(stages, ['docker.list', 'enrich', 'suggest']);
      for (const r of byCode(CODES.STAGE_COMPLETED)) assert.equal(typeof r.data.duration_ms, 'number');
      assert.equal(byCode(CODES.RUN_FAILED).length + byCode(CODES.RUN_SUMMARY).length, 0);
      assert.ok(!JSON.stringify(records()).includes('db-secret-value'), 'DB env values must never be logged');
    });

    it('S90 run summary when a success is slower than the threshold', async () => {
      db.setSetting('suggestHttp', 'false');
      db.setSetting('suggestDns', 'false');
      fakes.docker.containers = [h.rawContainer({ Ports: [] })];
      log.config.slowRunMs = -1;
      await h.request(base, 'POST', '/api/suggestions', { containerIds: [h.rawContainer().Id] });
      const summary = byCode(CODES.RUN_SUMMARY)[0];
      assert.equal(summary.data.state, 'ok');
      assert.equal(typeof summary.data.duration_ms, 'number');
    });

    it('E20 on the failing stage, E05 and an E90 summary when AI has no key', async () => {
      db.setSetting('suggestHttp', 'true');
      db.setSetting('aiProvider', 'anthropic');
      fakes.docker.containers = [h.rawContainer({ Ports: [] })];
      await h.request(base, 'POST', '/api/suggestions', { containerIds: [h.rawContainer().Id] });
      assert.equal(byCode(CODES.STAGE_FAILED)[0].data.stage, 'suggest');
      assert.match(byCode(CODES.SUGGESTIONS_FAILED)[0].data.error, /API key not configured/);
      assert.deepEqual(byCode(CODES.RUN_FAILED)[0].data.codes.slice(-2), [CODES.STAGE_FAILED, CODES.SUGGESTIONS_FAILED]);
    });
  });

  describe('POST /api/monitors', () => {
    const monitor = (name) => ({ containerId: 'c1', containerName: 'c1', type: 'ping', name, hostname: 'localhost' });

    it('E06 on an empty request', async () => {
      await h.request(base, 'POST', '/api/monitors', { monitors: [] });
      assert.equal(byCode(CODES.MONITORS_BAD_REQUEST).length, 1);
    });

    it('S04 and no summary when every monitor is added', async () => {
      await h.request(base, 'POST', '/api/monitors', { monitors: [monitor('c1 - Ok')], options: { groupByContainer: false } });
      assert.deepEqual(byCode(CODES.MONITORS_ADDED)[0].data, { run: 'monitors', succeeded: 1, failed: 0, groupByContainer: false });
      assert.equal(byCode(CODES.RUN_FAILED).length, 0);
    });

    it('E08 per rejected monitor and an E90 partial summary', async () => {
      fakes.kuma.failNames = new Set(['c1 - Bad']);
      await h.request(base, 'POST', '/api/monitors', {
        monitors: [monitor('c1 - Ok'), monitor('c1 - Bad')], options: { groupByContainer: false },
      });
      assert.equal(byCode(CODES.MONITOR_REJECTED)[0].data.name, 'c1 - Bad');
      const summary = byCode(CODES.RUN_FAILED)[0];
      assert.equal(summary.data.state, 'partial');
      assert.equal(summary.data.failed, 1);
    });

    it('E07 when Kuma is unreachable, without logging the Kuma password', async () => {
      fakes.kuma.connectError = 'ECONNREFUSED';
      await h.request(base, 'POST', '/api/monitors', { monitors: [monitor('c1 - Ok')] });
      assert.match(byCode(CODES.MONITORS_ADD_FAILED)[0].data.error, /ECONNREFUSED/);
      assert.equal(byCode(CODES.STAGE_FAILED)[0].data.stage, 'kuma.add');
      assert.equal(byCode(CODES.RUN_FAILED)[0].data.state, 'failed');
      assert.ok(!JSON.stringify(records()).includes('pw-secret-value'));
    });
  });

  describe('/api/settings', () => {
    it('S05 lists updated key names only, never values', async () => {
      await h.request(base, 'PUT', '/api/settings', { aiApiKey: 'sk-secret-value', aiProvider: 'openai' });
      assert.deepEqual(byCode(CODES.SETTINGS_UPDATED)[0].data, { keys: ['aiProvider', 'aiApiKey'] });
      assert.ok(!JSON.stringify(records()).includes('sk-secret-value'));
    });

    it('S06 when the Kuma connection test succeeds', async () => {
      await h.request(base, 'POST', '/api/settings/test-connection');
      assert.equal(byCode(CODES.KUMA_CONNECTION_OK).length, 1);
    });

    it('E09 when the Kuma connection test fails', async () => {
      fakes.kuma.loginOk = false;
      await h.request(base, 'POST', '/api/settings/test-connection');
      assert.match(byCode(CODES.KUMA_CONNECTION_FAILED)[0].data.error, /Incorrect username/);
    });
  });
});
