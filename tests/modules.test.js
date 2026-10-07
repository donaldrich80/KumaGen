// Characterization tests for the public functions server modules export to each other.
// Offline: Docker, Kuma and the AI SDK are faked; OpenAPI probing hits a local server only.

const { describe, it, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const h = require('./helpers');

const skip = h.depsMissing();
// A skipped describe() is not counted in the runner's totals; this test makes the skip visible there.
if (skip) test(`${require('node:path').basename(__filename)} suite`, { skip }, () => {});
const load = (m) => require(path.join(h.SERVER, m));

describe('server modules', { skip }, () => {
  let fakes;
  before(() => { fakes = h.setupOffline(); });

  describe('traefik', () => {
    it('getTraefikRouters parses Host rules and derives scheme', () => {
      const { getTraefikRouters, getTraefikHostnames } = load('traefik');
      const labels = {
        'traefik.http.routers.app.rule': 'Host(`a.example.com`) || Host(`b.example.com`)',
        'traefik.http.routers.app.tls': 'true',
        'traefik.http.routers.api.rule': 'Host(`a.example.com`) && PathPrefix(`/api`)',
        'traefik.http.routers.api.entrypoints': 'web',
        'traefik.http.routers.nohost.rule': 'PathPrefix(`/x`)',
      };
      assert.deepEqual(getTraefikRouters(labels), [
        { routerName: 'app', hostnames: ['a.example.com', 'b.example.com'], scheme: 'https' },
        { routerName: 'api', hostnames: ['a.example.com'], scheme: 'http' },
      ]);
      assert.deepEqual(getTraefikHostnames(labels), ['a.example.com', 'b.example.com']);
      assert.deepEqual(getTraefikRouters(null), []);
    });
  });

  describe('health-endpoints', () => {
    it('getKnownEndpoints returns paths for known images and [] otherwise', () => {
      const { getKnownEndpoints } = load('health-endpoints');
      const grafana = getKnownEndpoints('grafana/grafana:latest');
      assert.ok(grafana.length > 0);
      for (const e of grafana) {
        assert.equal(typeof e.path, 'string');
        assert.equal(typeof e.description, 'string');
      }
      assert.deepEqual(getKnownEndpoints('totally-unknown-image'), []);
      assert.deepEqual(getKnownEndpoints(undefined), []);
    });
  });

  describe('programmatic', () => {
    const container = {
      id: 'c1', name: 'pg', image: 'postgres:16',
      ports: [{ containerPort: 5432, hostPort: 15432, protocol: 'tcp' }, { containerPort: 53, hostPort: 53, protocol: 'udp' }],
      labels: { 'traefik.http.routers.pg.rule': 'Host(`pg.example.com`)' },
    };

    it('generateProgrammaticSuggestions emits docker/ping/port/dns/db suggestions by default', () => {
      const { generateProgrammaticSuggestions } = load('programmatic');
      const out = generateProgrammaticSuggestions([container], {});
      assert.deepEqual(Object.keys(out), ['c1']);
      assert.deepEqual(out.c1.map(s => s.type), ['docker', 'ping', 'port', 'dns', 'postgres']);
      assert.equal(out.c1[2].port, 15432);
      assert.equal(out.c1[3].hostname, 'pg.example.com');
      assert.equal(out.c1[4].databaseConnectionString, 'postgres://user:password@localhost:15432/dbname');
      assert.equal(out.c1[4].requiresConnectionString, true);
    });

    it('uses container names and internal ports when useContainerNames is set', () => {
      const { generateProgrammaticSuggestions } = load('programmatic');
      const out = generateProgrammaticSuggestions([container], {
        useContainerNames: true, suggestDocker: false, suggestPing: false, useTraefikLabels: false,
      });
      assert.deepEqual(out.c1.map(s => [s.type, s.hostname ?? null, s.port ?? null]), [
        ['port', 'pg', 5432],
        ['postgres', null, null],
      ]);
      assert.equal(out.c1[1].databaseConnectionString, 'postgres://user:password@pg:5432/dbname');
    });

    it('needsAI is true only for HTTP or DNS suggestions', () => {
      const { needsAI } = load('programmatic');
      assert.equal(needsAI({}), false);
      assert.equal(needsAI({ suggestHttp: true }), true);
      assert.equal(needsAI({ suggestDns: true }), true);
      assert.equal(needsAI({ suggestPort: true, suggestDatabase: true }), false);
    });
  });

  describe('db-connection', () => {
    it('buildDbConnectionString builds URL-encoded strings or null', () => {
      const { buildDbConnectionString } = load('db-connection');
      assert.equal(buildDbConnectionString('postgres', { POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p:w' }, 'h', 1),
        'postgres://u:p%3Aw@h:1/postgres');
      assert.equal(buildDbConnectionString('postgres', {}, 'h', 1), null);
      assert.equal(buildDbConnectionString('mysql', { MYSQL_ROOT_PASSWORD: 'r' }, 'h', 2), 'mysql://root:r@h:2/');
      assert.equal(buildDbConnectionString('redis', { REQUIREPASS: 's' }, 'h', 3), 'redis://:s@h:3');
      assert.equal(buildDbConnectionString('redis', {}, 'h', 3), null);
      assert.equal(buildDbConnectionString('mongodb', { MONGODB_USERNAME: 'm' }, 'h', 4), 'mongodb://m:@h:4/');
      assert.equal(buildDbConnectionString('sqlite', { X: 1 }, 'h', 5), null);
    });

    it('enrichDbSuggestions replaces DB templates in place when env data exists', () => {
      const { enrichDbSuggestions } = load('db-connection');
      const merged = { c1: [{ type: 'redis', databaseConnectionString: 'redis://localhost:6379' }, { type: 'ping' }] };
      const containers = [{ id: 'c1', name: 'r', ports: [{ containerPort: 6379, hostPort: 16379, protocol: 'tcp' }], dbEnv: { REDIS_PASSWORD: 'pw' } }];
      enrichDbSuggestions(merged, containers, {});
      assert.equal(merged.c1[0].databaseConnectionString, 'redis://:pw@localhost:16379');
      assert.deepEqual(merged.c1[1], { type: 'ping' });
    });
  });

  describe('db', () => {
    it('round-trips settings and monitored-container records', () => {
      const db = load('db');
      assert.equal(db.getSetting('missing'), null);
      db.setSetting('k', 'v');
      assert.equal(db.getSetting('k'), 'v');
      assert.equal(db.getAllSettings().k, 'v');

      db.recordMonitors('dbc', 'dbc-name', [
        { monitorId: 5, name: 'dbc', type: 'group' },
        { name: 'dbc - Ping', type: 'ping' },
      ]);
      assert.ok(db.getMonitoredContainerIds().has('dbc'));
      const rows = db.getMonitorsByContainerId('dbc');
      assert.equal(rows.length, 2);
      assert.deepEqual(Object.keys(rows[0]).sort(),
        ['container_id', 'container_name', 'created_at', 'id', 'monitor_id', 'monitor_name', 'monitor_type']);
      assert.equal(db.getGroupMonitorId('dbc'), 5);
      assert.equal(db.getGroupMonitorId('nobody'), null);
    });
  });

  describe('docker', () => {
    beforeEach(() => {
      fakes.docker.available = true;
      fakes.docker.containers = [];
      fakes.docker.inspect = {};
    });

    it('listContainers maps the Docker API shape to KumaGen container objects', async () => {
      const { listContainers } = load('docker');
      fakes.docker.containers = [h.rawContainer({ Ports: [{ PrivatePort: 80, Type: 'tcp' }] })];
      const [c] = await listContainers();
      assert.deepEqual(c, {
        id: 'a'.repeat(64), shortId: 'a'.repeat(12), name: 'web', image: 'nginx:alpine',
        imageId: 'sha256:abc', status: 'Up 5 minutes', state: 'running', created: 1700000000,
        ports: [{ hostPort: null, containerPort: 80, protocol: 'tcp', hostIp: '0.0.0.0' }],
        labels: {}, networkMode: 'bridge', networks: ['bridge'],
      });
    });

    it('env helpers return keys / allow-listed DB values, and swallow errors', async () => {
      const { getContainerEnvKeys, getContainerDbEnv } = load('docker');
      fakes.docker.inspect.x = { Config: { Env: ['POSTGRES_PASSWORD=a=b', 'SECRET_TOKEN=zzz', 'NOEQ'] } };
      assert.deepEqual(await getContainerEnvKeys('x'), ['POSTGRES_PASSWORD', 'SECRET_TOKEN', 'NOEQ']);
      assert.deepEqual(await getContainerDbEnv('x'), { POSTGRES_PASSWORD: 'a=b' });
      assert.deepEqual(await getContainerEnvKeys('missing'), []);
      assert.deepEqual(await getContainerDbEnv('missing'), {});
    });

    it('isDockerAvailable reflects ping success', async () => {
      const { isDockerAvailable } = load('docker');
      assert.equal(await isDockerAvailable(), true);
      fakes.docker.available = false;
      assert.equal(await isDockerAvailable(), false);
    });
  });

  describe('openapi', () => {
    let srv, port;
    before(async () => {
      srv = http.createServer((req, res) => {
        if (req.url === '/openapi.json') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({
            openapi: '3.0.0', info: { title: 'Svc', version: '1' },
            paths: { '/health': { get: { summary: 'Health' } } },
          }));
        } else { res.statusCode = 404; res.end(); }
      });
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      port = srv.address().port;
    });
    after(() => srv.close());

    it('getOpenApiSpecs probes host-mapped ports on localhost and returns spec summaries', async () => {
      const { getOpenApiSpecs } = load('openapi');
      const specs = await getOpenApiSpecs({ ports: [{ containerPort: 8000, hostPort: port }, { containerPort: 9 }] });
      assert.equal(specs.length, 1);
      const s = specs[0];
      assert.equal(s.port, port);
      assert.equal(s.containerPort, 8000);
      assert.equal(s.foundAt, `http://localhost:${port}/openapi.json`);
      assert.equal(s.title, 'Svc');
      assert.ok(Array.isArray(s.endpoints));
      assert.ok(s.endpoints.some(e => e.path === '/health' && e.method.toUpperCase() === 'GET'));
    });

    it('returns [] when no ports are host-mapped', async () => {
      const { getOpenApiSpecs } = load('openapi');
      assert.deepEqual(await getOpenApiSpecs({ ports: [{ containerPort: 80 }] }), []);
    });
  });

  describe('ai.suggestMonitors', () => {
    const db = () => load('db');
    const containers = [{
      id: 'n1', name: 'nginx', image: 'nginx:alpine',
      ports: [{ containerPort: 80, hostPort: 8080, protocol: 'tcp' }], labels: {}, networks: ['bridge'],
    }];

    beforeEach(() => { fakes.ai.calls = []; });

    it('skips the AI call when no AI-dependent types are enabled', async () => {
      const { suggestMonitors } = load('ai');
      const out = await suggestMonitors(containers, { suggestHttp: false, suggestDns: false });
      assert.equal(fakes.ai.calls.length, 0);
      assert.deepEqual(out.n1.map(s => s.type), ['docker', 'ping', 'port']);
    });

    it('throws a configuration error when the provider has no API key', async () => {
      const { suggestMonitors } = load('ai');
      db().setSetting('aiProvider', 'anthropic');
      await assert.rejects(suggestMonitors(containers, { suggestHttp: true }),
        { message: 'Anthropic API key not configured. Set it in Settings.' });
      assert.equal(fakes.ai.calls.length, 0);
    });

    it('merges AI suggestions after programmatic ones, de-duplicating HTTP by URL', async () => {
      const { suggestMonitors } = load('ai');
      db().setSetting('aiProvider', 'anthropic');
      db().setSetting('aiApiKey', 'test-key-not-real');
      const prog = load('programmatic').generateProgrammaticSuggestions(containers, { suggestHttp: true });
      const existingHttp = prog.n1.find(s => s.type === 'http');
      assert.ok(existingHttp, 'nginx should have a known programmatic HTTP endpoint');

      fakes.ai.responseText = 'Here you go:\n' + JSON.stringify({
        n1: [
          { type: 'http', name: 'dup', url: existingHttp.url.toUpperCase() },
          { type: 'http', name: 'new', url: 'http://localhost:8080/status' },
        ],
        other: [{ type: 'ping', name: 'other - Ping' }],
      });
      const out = await suggestMonitors(containers, { suggestHttp: true });

      assert.equal(fakes.ai.calls.length, 1);
      assert.equal(typeof fakes.ai.calls[0].instructions, 'string');
      assert.match(fakes.ai.calls[0].prompt, /"id": "n1"/);
      const names = out.n1.map(s => s.name);
      assert.ok(!names.includes('dup'));
      assert.equal(names[names.length - 1], 'new');
      assert.deepEqual(out.other, [{ type: 'ping', name: 'other - Ping' }]);
    });

    it('rejects when the AI reply contains no JSON object', async () => {
      const { suggestMonitors } = load('ai');
      db().setSetting('aiApiKey', 'test-key-not-real');
      fakes.ai.responseText = 'sorry, no';
      await assert.rejects(suggestMonitors(containers, { suggestHttp: true }),
        { message: 'AI returned invalid JSON. Please try again.' });
    });
  });

  describe('kuma', () => {
    beforeEach(() => {
      h.resetKuma();
      const db = load('db');
      db.setSetting('kumaUrl', 'http://kuma.test:3001');
      db.setSetting('kumaUsername', 'admin');
      db.setSetting('kumaPassword', 'pw');
    });

    it('addMonitors applies payload defaults and groups under a created group monitor', async () => {
      const { addMonitors } = load('kuma');
      const results = await addMonitors([
        { containerId: 'k1', containerName: 'svc', type: 'ping', name: 'svc - Ping', hostname: 'localhost' },
      ], { groupByContainer: true });

      assert.equal(fakes.kuma.added.length, 2);
      const [group, ping] = fakes.kuma.added;
      assert.equal(group.type, 'group');
      assert.equal(group.name, 'svc');
      assert.deepEqual(ping, {
        maxretries: 1, retryInterval: 60, accepted_statuscodes: ['200-299'], notificationIDList: {},
        kafkaProducerBrokers: [], kafkaProducerSaslOptions: {},
        type: 'ping', name: 'svc - Ping', hostname: 'localhost', parent: 100,
      });
      assert.deepEqual(results, [{ containerId: 'k1', containerName: 'svc', name: 'svc - Ping', type: 'ping', ok: true, monitorID: 101 }]);
      assert.equal(load('db').getGroupMonitorId('k1'), 100);
    });

    it('reuses an existing group from the live monitorList', async () => {
      const { addMonitors } = load('kuma');
      fakes.kuma.monitorList = { 42: { id: 42, type: 'group', name: 'svc2' } };
      await addMonitors([{ containerId: 'k2', containerName: 'svc2', type: 'ping', name: 'p' }], { groupByContainer: true });
      assert.equal(fakes.kuma.added.length, 1);
      assert.equal(fakes.kuma.added[0].parent, 42);
    });

    it('testConnection resolves { ok: true } and errors clearly when unconfigured', async () => {
      const { testConnection } = load('kuma');
      assert.deepEqual(await testConnection(), { ok: true });
      assert.deepEqual(fakes.kuma.urls, ['http://kuma.test:3001']);
      load('db').setSetting('kumaUrl', '');
      await assert.rejects(testConnection(), { message: 'Uptime Kuma URL not configured. Set it in Settings.' });
    });
  });
});
