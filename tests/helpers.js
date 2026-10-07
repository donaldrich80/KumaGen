// Shared test harness for the KumaGen server.
//
// Every test runs offline: Docker, Uptime Kuma (socket.io), the AI SDK and the
// SQLite path are all faked or redirected before any server module is required.
// Server routes destructure their imports at require time, so fakes must be
// installed BEFORE the first require of anything under server/.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server');

const SCRUBBED_ENV_KEYS = ['ANTHROPIC_API_KEY', 'KUMA_URL', 'KUMA_USERNAME', 'KUMA_PASSWORD', 'DB_PATH', 'PORT'];

// Returns a skip reason string when the npm toolchain is absent, else false.
function depsMissing() {
  for (const mod of ['express', 'better-sqlite3', 'dockerode', 'socket.io-client', 'ai']) {
    try {
      require.resolve(mod, { paths: [ROOT] });
    } catch {
      return `dependency "${mod}" not installed — run \`npm install\` first`;
    }
  }
  try {
    const Database = require(require.resolve('better-sqlite3', { paths: [ROOT] }));
    new Database(':memory:').close(); // loads the native binary; catches ABI mismatches
  } catch (err) {
    return `better-sqlite3 native module failed to load: ${err.message}`;
  }
  return false;
}

function tempDir(prefix = 'kumagen-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Point the DB at a fresh temp file and strip live credentials from the env.
function isolateEnv() {
  for (const k of SCRUBBED_ENV_KEYS) delete process.env[k];
  const dir = tempDir();
  process.env.DB_PATH = path.join(dir, 'kumagen.db');
  return dir;
}

// ---- Docker fake (patched on the dockerode prototype) ----------------------

const dockerState = {
  available: true,
  containers: [],      // raw Docker API shape (Id, Names, Ports, ...)
  inspect: {},         // id -> { Config: { Env: [...] } }
};

function installDockerFake() {
  const Docker = require(require.resolve('dockerode', { paths: [ROOT] }));
  Docker.prototype.ping = async function () {
    if (!dockerState.available) throw new Error('connect ENOENT /var/run/docker.sock');
    return 'OK';
  };
  Docker.prototype.listContainers = async function () {
    return dockerState.containers;
  };
  Docker.prototype.getContainer = function (id) {
    return {
      inspect: async () => {
        if (!dockerState.inspect[id]) throw new Error(`no such container: ${id}`);
        return dockerState.inspect[id];
      },
    };
  };
  return dockerState;
}

// ---- AI SDK fake (generateText is a non-writable getter, so swap the module) --

const aiState = { calls: [], responseText: '{}' };

function installAiFake() {
  const resolved = require.resolve('ai', { paths: [SERVER] });
  const real = require(resolved);
  const fake = Object.create(null);
  for (const key of Object.keys(real)) fake[key] = real[key];
  fake.generateText = async (args) => {
    aiState.calls.push(args);
    return { text: aiState.responseText };
  };
  require.cache[resolved].exports = fake;
  return aiState;
}

// ---- Uptime Kuma socket.io fake ---------------------------------------------

const kumaState = {
  connectError: null,   // string -> emit connect_error
  loginOk: true,
  monitorList: {},
  added: [],            // payloads received by 'add'
  nextId: 100,
  failNames: new Set(), // monitor names whose 'add' is rejected
  urls: [],
};

function installKumaFake() {
  const resolved = require.resolve('socket.io-client', { paths: [SERVER] });
  const mod = require(resolved);
  mod.io = (url) => {
    kumaState.urls.push(url);
    const socket = new EventEmitter();
    socket.disconnected = false;
    socket.disconnect = () => { socket.disconnected = true; };
    const serverEmit = EventEmitter.prototype.emit.bind(socket);
    socket.emit = (ev, payload, ack) => {
      if (ev === 'login') {
        setImmediate(() => {
          ack(kumaState.loginOk ? { ok: true } : { ok: false, msg: 'Incorrect username or password.' });
          if (kumaState.loginOk) setImmediate(() => serverEmit('monitorList', kumaState.monitorList));
        });
      } else if (ev === 'add') {
        kumaState.added.push(payload);
        setImmediate(() => {
          if (kumaState.failNames.has(payload.name)) ack({ ok: false, msg: 'rejected by fake kuma' });
          else ack({ ok: true, monitorID: kumaState.nextId++ });
        });
      }
      return true;
    };
    setImmediate(() => {
      if (kumaState.connectError) serverEmit('connect_error', new Error(kumaState.connectError));
      else serverEmit('connect');
    });
    return socket;
  };
  return kumaState;
}

function resetKuma() {
  kumaState.connectError = null;
  kumaState.loginOk = true;
  kumaState.monitorList = {};
  kumaState.added = [];
  kumaState.nextId = 100;
  kumaState.failNames = new Set();
  kumaState.urls = [];
}

// Installs every fake, isolates env/DB. Call once per test file before requiring server code.
function setupOffline() {
  const dir = isolateEnv();
  installDockerFake();
  installAiFake();
  installKumaFake();
  return { dir, docker: dockerState, ai: aiState, kuma: kumaState };
}

// Builds the same Express app as server/index.js (minus listen and static SPA).
function buildApp() {
  const express = require(require.resolve('express', { paths: [ROOT] }));
  const app = express();
  app.use(express.json());
  app.use('/api/settings', require(path.join(SERVER, 'routes/settings')));
  app.use('/api/containers', require(path.join(SERVER, 'routes/containers')));
  app.use('/api/suggestions', require(path.join(SERVER, 'routes/suggestions')));
  app.use('/api/monitors', require(path.join(SERVER, 'routes/monitors')));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      resolve({ server: srv, base: `http://127.0.0.1:${srv.address().port}` });
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function request(base, method, urlPath, body) {
  const res = await fetch(base + urlPath, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, json, text, headers: res.headers };
}

// A raw Docker API container record, as dockerode.listContainers returns it.
function rawContainer(overrides = {}) {
  return {
    Id: 'a'.repeat(64),
    Names: ['/web'],
    Image: 'nginx:alpine',
    ImageID: 'sha256:abc',
    Status: 'Up 5 minutes',
    State: 'running',
    Created: 1700000000,
    Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp', IP: '0.0.0.0' }],
    Labels: {},
    HostConfig: { NetworkMode: 'bridge' },
    NetworkSettings: { Networks: { bridge: {} } },
    ...overrides,
  };
}

module.exports = {
  ROOT, SERVER, SCRUBBED_ENV_KEYS,
  depsMissing, tempDir, setupOffline, resetKuma,
  buildApp, listen, freePort, request, rawContainer,
};
