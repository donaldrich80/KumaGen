/**
 * Generates monitor suggestions that can be derived purely from container metadata,
 * with no AI involvement.
 *
 * Covers: docker (container status), port (TCP), ping, Traefik DNS
 */

const { getTraefikRouters } = require('./traefik');

function generateProgrammaticSuggestions(containers, settings) {
  const {
    suggestDocker = true,
    suggestPort = true,
    suggestPing = true,
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

    result[c.id] = suggestions;
  }

  return result;
}

/**
 * Returns true if the given settings require an AI call.
 * HTTP health paths, DNS, and database monitors need AI knowledge/heuristics.
 */
function needsAI(settings) {
  return !!(settings.suggestHttp || settings.suggestDns || settings.suggestDatabase);
}

module.exports = { generateProgrammaticSuggestions, needsAI };
