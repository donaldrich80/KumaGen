/**
 * Static lookup table: image name substring → array of known health endpoint paths.
 * Matched case-insensitively against the container image name.
 */
const HEALTH_ENDPOINTS = [
  { match: 'nginx',         paths: [{ path: '/healthz', description: 'nginx health check' }, { path: '/', description: 'nginx root' }] },
  { match: 'traefik',       paths: [{ path: '/ping', description: 'Traefik built-in health' }] },
  { match: 'grafana',       paths: [{ path: '/api/health', description: 'Grafana API health' }] },
  { match: 'prometheus',    paths: [{ path: '/-/healthy', description: 'Prometheus health' }, { path: '/-/ready', description: 'Prometheus readiness' }] },
  { match: 'alertmanager',  paths: [{ path: '/-/healthy', description: 'Alertmanager health' }] },
  { match: 'node-exporter', paths: [{ path: '/metrics', description: 'Prometheus metrics' }] },
  { match: 'exporter',      paths: [{ path: '/metrics', description: 'Prometheus metrics' }] },
  { match: 'portainer',     paths: [{ path: '/api/status', description: 'Portainer status' }] },
  { match: 'gitea',         paths: [{ path: '/api/healthz', description: 'Gitea health check' }] },
  { match: 'nextcloud',     paths: [{ path: '/status.php', description: 'Nextcloud status' }] },
  { match: 'minio',         paths: [{ path: '/minio/health/live', description: 'MinIO liveness' }] },
  { match: 'keycloak',      paths: [{ path: '/health/ready', description: 'Keycloak readiness' }] },
  { match: 'authentik',     paths: [{ path: '/-/health/ready/', description: 'Authentik readiness' }] },
  { match: 'vaultwarden',   paths: [{ path: '/alive', description: 'Vaultwarden alive check' }] },
  { match: 'bitwarden',     paths: [{ path: '/alive', description: 'Bitwarden alive check' }] },
  { match: 'vault',         paths: [{ path: '/v1/sys/health', description: 'Vault system health' }] },
  { match: 'influxdb',      paths: [{ path: '/health', description: 'InfluxDB health' }] },
  { match: 'loki',          paths: [{ path: '/ready', description: 'Loki readiness' }] },
  { match: 'tempo',         paths: [{ path: '/ready', description: 'Tempo readiness' }] },
  { match: 'elasticsearch', paths: [{ path: '/_cluster/health', description: 'Elasticsearch cluster health' }] },
  { match: 'opensearch',    paths: [{ path: '/_cluster/health', description: 'OpenSearch cluster health' }] },
  { match: 'kibana',        paths: [{ path: '/api/status', description: 'Kibana status' }] },
  { match: 'rabbitmq',      paths: [{ path: '/api/health/checks/aliveness', description: 'RabbitMQ aliveness (port 15672)' }] },
  { match: 'nats',          paths: [{ path: '/healthz', description: 'NATS health' }] },
  { match: 'directus',      paths: [{ path: '/server/health', description: 'Directus server health' }] },
  { match: 'strapi',        paths: [{ path: '/_health', description: 'Strapi health' }] },
  { match: 'hasura',        paths: [{ path: '/healthz', description: 'Hasura health check' }] },
  { match: 'ghost',         paths: [{ path: '/ghost/api/v4/admin/site/', description: 'Ghost admin API' }] },
  { match: 'uptime-kuma',   paths: [{ path: '/', description: 'Uptime Kuma root' }] },
  { match: 'harbor',        paths: [{ path: '/api/v2.0/ping', description: 'Harbor API ping' }] },
  { match: 'consul',        paths: [{ path: '/v1/status/leader', description: 'Consul leader status' }] },
];

/**
 * Returns known health endpoint paths for the given image name.
 * @param {string} imageName
 * @returns {{ path: string, description: string }[]}
 */
function getKnownEndpoints(imageName) {
  if (!imageName) return [];
  const lower = imageName.toLowerCase();
  for (const entry of HEALTH_ENDPOINTS) {
    if (lower.includes(entry.match)) return entry.paths;
  }
  return [];
}

module.exports = { getKnownEndpoints };
