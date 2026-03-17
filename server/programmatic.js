/**
 * Generates monitor suggestions that can be derived purely from container metadata,
 * with no AI involvement.
 *
 * Covers: docker (container status), port (TCP), ping, Traefik DNS
 */

const { getTraefikRouters } = require('./traefik');
const { getKnownEndpoints } = require('./health-endpoints');

const DB_TYPES = [
  { match: 'postgres',  type: 'postgres', label: 'PostgreSQL', defaultPort: 5432, template: (h, p) => `postgres://user:password@${h}:${p}/dbname` },
  { match: 'mysql',     type: 'mysql',    label: 'MySQL',      defaultPort: 3306, template: (h, p) => `mysql://user:password@${h}:${p}/dbname` },
  { match: 'mariadb',   type: 'mysql',    label: 'MariaDB',    defaultPort: 3306, template: (h, p) => `mysql://user:password@${h}:${p}/dbname` },
  { match: 'redis',     type: 'redis',    label: 'Redis',      defaultPort: 6379, template: (h, p) => `redis://${h}:${p}` },
  { match: 'mongo',     type: 'mongodb',  label: 'MongoDB',    defaultPort: 27017, template: (h, p) => `mongodb://user:password@${h}:${p}/dbname` },
];

/** Returns the best HTTP base URL for a container given settings. */
function resolveHttpBase(c, settings) {
  const { useContainerNames = false, preferPublicUrl = false, useTraefikLabels = true } = settings || {};

  if (preferPublicUrl && useTraefikLabels) {
    const routers = getTraefikRouters(c.labels || {});
    if (routers.length > 0) {
      const r = routers[0];
      const scheme = r.scheme || 'https';
      const hostname = r.hostnames && r.hostnames[0];
      if (hostname) return `${scheme}://${hostname}`;
    }
  }

  const tcpPorts = (c.ports || []).filter(p => p.protocol === 'tcp');
  if (tcpPorts.length === 0) return null;

  const port = useContainerNames
    ? tcpPorts[0].containerPort
    : (tcpPorts[0].hostPort ?? tcpPorts[0].containerPort);
  const hostname = useContainerNames ? c.name : 'localhost';
  return `http://${hostname}:${port}`;
}

function generateDbSuggestions(containers, settings) {
  const { suggestDatabase = true, useContainerNames = false } = settings || {};
  if (!suggestDatabase) return {};

  const result = {};
  for (const c of containers) {
    const imageLower = (c.image || '').toLowerCase();
    const dbType = DB_TYPES.find(d => imageLower.includes(d.match));
    if (!dbType) { result[c.id] = []; continue; }

    const hostname = useContainerNames ? c.name : 'localhost';
    const mapping = (c.ports || []).find(p => p.containerPort === dbType.defaultPort && p.protocol === 'tcp');
    const port = mapping
      ? (useContainerNames ? mapping.containerPort : (mapping.hostPort ?? mapping.containerPort))
      : dbType.defaultPort;

    result[c.id] = [{
      type: dbType.type,
      name: `${c.name} - ${dbType.label}`,
      description: `${dbType.label} database health check`,
      interval: 60,
      requiresConnectionString: true,
      databaseConnectionString: dbType.template(hostname, port),
    }];
  }
  return result;
}

function generateProgrammaticSuggestions(containers, settings) {
  const {
    suggestDocker = true,
    suggestPort = true,
    suggestPing = true,
    suggestHttp = true,
    useContainerNames = false,
    useTraefikLabels = true,
  } = settings || {};

  const result = {};

  for (const c of containers) {
    const suggestions = [];

    // Docker container status check — just needs the container name
    if (suggestDocker) {
      suggestions.push({
        type: 'docker',
        name: `${c.name} - Container`,
        description: 'Docker container running status check',
        interval: 60,
        requiresConnectionString: false,
        dockerContainer: c.name,
        dockerHost: null,
      });
    }

    // Ping — reachable hostname
    if (suggestPing) {
      const hostname = useContainerNames ? c.name : 'localhost';
      suggestions.push({
        type: 'ping',
        name: `${c.name} - Ping`,
        description: `ICMP ping to ${hostname}`,
        interval: 60,
        requiresConnectionString: false,
        hostname,
      });
    }

    // TCP port check — one per unique exposed TCP port
    if (suggestPort) {
      const seen = new Set();
      for (const p of (c.ports || [])) {
        if (p.protocol !== 'tcp') continue;
        // When using container names, use the internal containerPort; otherwise use the host-mapped port
        const port = useContainerNames ? p.containerPort : (p.hostPort ?? p.containerPort);
        if (!port || seen.has(port)) continue;
        seen.add(port);
        const hostname = useContainerNames ? c.name : 'localhost';
        suggestions.push({
          type: 'port',
          name: `${c.name} - Port ${port}`,
          description: `TCP port check on port ${port}`,
          interval: 60,
          requiresConnectionString: false,
          hostname,
          port,
        });
      }
    }

    // Traefik DNS checks — one per discovered hostname from router rules
    if (useTraefikLabels) {
      const routers = getTraefikRouters(c.labels || {});
      for (const router of routers) {
        for (const hostname of router.hostnames) {
          suggestions.push({
            type: 'dns',
            name: `${c.name} - DNS (${hostname})`,
            description: `DNS resolution check for Traefik-managed hostname ${hostname}`,
            interval: 60,
            requiresConnectionString: false,
            hostname,
            dns_resolve_server: '1.1.1.1',
            dns_resolve_type: 'A',
          });
        }
      }
    }

    // HTTP suggestions from static lookup table for known images
    if (suggestHttp) {
      const endpoints = getKnownEndpoints(c.image);
      if (endpoints.length > 0) {
        const base = resolveHttpBase(c, settings);
        if (base) {
          for (const { path, description } of endpoints) {
            suggestions.push({
              type: 'http',
              name: `${c.name} - ${description}`,
              description,
              interval: 60,
              requiresConnectionString: false,
              url: `${base}${path}`,
              method: 'GET',
            });
          }
        }
      }
    }

    result[c.id] = suggestions;
  }

  // Merge in database suggestions
  const dbSuggs = generateDbSuggestions(containers, settings);
  for (const [cid, suggs] of Object.entries(dbSuggs)) {
    if (suggs.length > 0) result[cid] = [...(result[cid] || []), ...suggs];
  }

  return result;
}

/**
 * Returns true if the given settings require an AI call.
 * Only HTTP health paths and DNS (non-Traefik) need AI heuristics.
 * Database and all other types are now fully programmatic.
 */
function needsAI(settings) {
  return !!(settings.suggestHttp || settings.suggestDns);
}

module.exports = { generateProgrammaticSuggestions, needsAI };
