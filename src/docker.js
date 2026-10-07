// Read-only Docker access over /var/run/docker.sock: list running containers,
// inspect env var names, and read allow-listed DB credential env values.
// Never logs env values. Last verified: 2026-10-07.
const Docker = require('dockerode');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// External call: Docker listContainers (running only) over the socket
async function listContainers() {
  const containers = await docker.listContainers({ all: false });

  return containers.map(c => {
    const ports = (c.Ports || []).map(p => ({
      hostPort: p.PublicPort || null,
      containerPort: p.PrivatePort,
      protocol: p.Type || 'tcp',
      hostIp: p.IP || '0.0.0.0',
    }));

    return {
      id: c.Id,
      shortId: c.Id.slice(0, 12),
      name: (c.Names[0] || '').replace(/^\//, ''),
      image: c.Image,
      imageId: c.ImageID,
      status: c.Status,
      state: c.State,
      created: c.Created,
      ports,
      labels: c.Labels || {},
      networkMode: c.HostConfig?.NetworkMode || 'bridge',
      networks: Object.keys(c.NetworkSettings?.Networks || {}),
    };
  });
}

// External call: Docker inspect; the container's raw "KEY=value" env list, [] on any error
async function inspectEnv(containerId) {
  try {
    const info = await docker.getContainer(containerId).inspect();
    return info.Config?.Env || [];
  } catch {
    return [];
  }
}

// Env var NAMES only
async function getContainerEnvKeys(containerId) {
  return (await inspectEnv(containerId)).map(e => e.split('=')[0]).filter(Boolean);
}

// Strict allowlist: only well-known database credential env var names.
// Values are returned so connection strings can be pre-filled in the UI.
const DB_ENV_ALLOWLIST = new Set([
  'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_HOST', 'POSTGRES_PORT',
  'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'MYSQL_DATABASE', 'MYSQL_HOST', 'MYSQL_PORT',
  'MARIADB_USER', 'MARIADB_PASSWORD', 'MARIADB_ROOT_PASSWORD', 'MARIADB_DATABASE',
  'REDIS_PASSWORD', 'REQUIREPASS',
  'MONGO_INITDB_ROOT_USERNAME', 'MONGO_INITDB_ROOT_PASSWORD', 'MONGO_INITDB_DATABASE',
  'MONGODB_USERNAME', 'MONGODB_PASSWORD', 'MONGODB_DATABASE',
]);

// Allow-listed DB env VALUES ({} on error) — never log them
async function getContainerDbEnv(containerId) {
  const result = {};
  for (const e of await inspectEnv(containerId)) {
    const idx = e.indexOf('=');
    if (idx === -1) continue;
    const key = e.slice(0, idx);
    if (DB_ENV_ALLOWLIST.has(key)) result[key] = e.slice(idx + 1);
  }
  return result;
}

// External call: Docker ping; false (never throws) when the socket is absent
async function isDockerAvailable() {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { listContainers, getContainerEnvKeys, getContainerDbEnv, isDockerAvailable };
