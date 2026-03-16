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

async function isDockerAvailable() {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { listContainers, getContainerEnvKeys, isDockerAvailable };
