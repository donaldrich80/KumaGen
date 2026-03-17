const Docker = require('dockerode');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

async function listContainers() {
  const containers = await docker.listContainers({ all: false });

  return containers.map(c => {
    const ports = (c.Ports || []).map(p => ({
      hostPort: p.PublicPort || null,
      containerPort: p.PrivatePort,
      protocol: p.Type || 'tcp',
      hostIp: p.IP || '0.0.0.0',
    }));

    // Only include env var keys, not values (security)
    const envKeys = [];

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

async function getContainerEnvKeys(containerId) {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    const env = info.Config?.Env || [];
    return env.map(e => e.split('=')[0]).filter(Boolean);
  } catch {
    return [];
  }
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

async function getContainerDbEnv(containerId) {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    const env = info.Config?.Env || [];
    const result = {};
    for (const e of env) {
      const idx = e.indexOf('=');
      if (idx === -1) continue;
      const key = e.slice(0, idx);
      if (DB_ENV_ALLOWLIST.has(key)) result[key] = e.slice(idx + 1);
    }
    return result;
  } catch {
    return {};
  }
}

async function isDockerAvailable() {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { listContainers, getContainerEnvKeys, getContainerDbEnv, isDockerAvailable };
