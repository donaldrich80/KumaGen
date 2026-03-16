/**
 * Utilities for extracting routing information from Traefik Docker labels.
 *
 * Traefik uses labels like:
 *   traefik.http.routers.myapp.rule=Host(`myapp.example.com`)
 *   traefik.http.routers.myapp.tls=true
 *   traefik.http.routers.myapp.entrypoints=websecure
 */

/**
 * Parse all Host()/HostSNI() values from a Traefik router rule string.
 * Handles compound rules like:
 *   Host(`a.com`) || Host(`b.com`)
 *   Host(`a.com`) && PathPrefix(`/api`)
 */
function parseHostnames(rule) {
  const hostnames = [];
  const re = /Host(?:SNI)?\(`([^`]+)`\)/g;
  let m;
  while ((m = re.exec(rule)) !== null) {
    hostnames.push(m[1]);
  }
  return hostnames;
}

/**
 * Determine the scheme for a named router based on its labels.
 * Returns 'https' when tls=true or entrypoints includes 'websecure'.
 */
function routerScheme(labels, routerName) {
  if (labels[`traefik.http.routers.${routerName}.tls`] === 'true') return 'https';
  const ep = labels[`traefik.http.routers.${routerName}.entrypoints`] || '';
  if (ep.split(',').map(s => s.trim()).includes('websecure')) return 'https';
  return 'http';
}

/**
 * Extract all Traefik-managed routes from a container's label map.
 * Returns an array of { routerName, hostnames, scheme }.
 */
function getTraefikRouters(labels) {
  if (!labels || typeof labels !== 'object') return [];

  const routers = {};
  for (const [key, value] of Object.entries(labels)) {
    const m = key.match(/^traefik\.http\.routers\.([^.]+)\.rule$/);
    if (!m) continue;
    const routerName = m[1];
    const hostnames = parseHostnames(value);
    if (hostnames.length === 0) continue;
    routers[routerName] = {
      routerName,
      hostnames,
      scheme: routerScheme(labels, routerName),
    };
  }

  return Object.values(routers);
}

/**
 * Convenience: return a flat, deduplicated list of all hostnames across all routers.
 */
function getTraefikHostnames(labels) {
  return [...new Set(getTraefikRouters(labels).flatMap(r => r.hostnames))];
}

module.exports = { getTraefikRouters, getTraefikHostnames };
