const { generateText } = require('ai');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { createOpenAI } = require('@ai-sdk/openai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createOllama } = require('ollama-ai-provider');
const { getSetting } = require('./db');

const DEFAULT_MODELS = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  ollama: 'llama3.2',
  'openai-compatible': '',
};

function getModel() {
  const provider = getSetting('aiProvider') || 'anthropic';
  const apiKey = getSetting('aiApiKey') || getSetting('anthropicApiKey') || process.env.ANTHROPIC_API_KEY;
  const modelName = getSetting('aiModel') || DEFAULT_MODELS[provider] || '';
  const baseUrl = getSetting('aiBaseUrl') || '';

  switch (provider) {
    case 'anthropic': {
      if (!apiKey) throw new Error('Anthropic API key not configured. Set it in Settings.');
      return createAnthropic({ apiKey })(modelName || DEFAULT_MODELS.anthropic);
    }
    case 'openai': {
      if (!apiKey) throw new Error('OpenAI API key not configured. Set it in Settings.');
      return createOpenAI({ apiKey })(modelName || DEFAULT_MODELS.openai);
    }
    case 'google': {
      if (!apiKey) throw new Error('Google AI API key not configured. Set it in Settings.');
      return createGoogleGenerativeAI({ apiKey })(modelName || DEFAULT_MODELS.google);
    }
    case 'ollama': {
      const ollamaBase = baseUrl || 'http://localhost:11434';
      return createOllama({ baseURL: `${ollamaBase}/api` })(modelName || DEFAULT_MODELS.ollama);
    }
    case 'openai-compatible': {
      if (!baseUrl) throw new Error('Base URL is required for OpenAI-compatible providers. Set it in Settings.');
      const client = createOpenAI({ apiKey: apiKey || 'none', baseURL: baseUrl });
      if (!modelName) throw new Error('Model name is required for OpenAI-compatible providers. Set it in Settings.');
      return client(modelName);
    }
    default:
      throw new Error(`Unknown AI provider: "${provider}". Choose one in Settings.`);
  }
}

const SYSTEM_PROMPT = `You are an expert at configuring Uptime Kuma monitoring for Docker containers.

Given a list of Docker containers with their metadata, suggest appropriate Uptime Kuma health check monitors for each one.

Available Uptime Kuma monitor types and their required fields:
- "http": HTTP/HTTPS check. Fields: url (full URL string), method ("GET")
- "port": TCP port check. Fields: hostname (string), port (number)
- "ping": ICMP ping check. Fields: hostname (string)
- "dns": DNS resolution check. Fields: hostname (string), dns_resolve_server ("1.1.1.1"), dns_resolve_type ("A")
- "postgres": PostgreSQL check. Fields: databaseConnectionString (template e.g. "postgres://user:password@hostname:5432/dbname")
- "mysql": MySQL/MariaDB check. Fields: databaseConnectionString (template e.g. "mysql://user:password@hostname:3306/dbname")
- "redis": Redis check. Fields: databaseConnectionString (e.g. "redis://hostname:6379")
- "mongodb": MongoDB check. Fields: databaseConnectionString (e.g. "mongodb://hostname:27017")

## OpenAPI specs
Some containers will include an "openApiSpecs" array. Each entry was discovered by probing the container's HTTP ports and contains:
- port: the host port the spec was found on
- foundAt: the exact URL
- title/description: from the spec's info block
- endpoints: array of { method, path, summary, description, tags, operationId }

When openApiSpecs is present, treat it as the highest-priority source of truth for what HTTP endpoints exist. Specifically:
1. Scan all endpoint paths for anything containing "health", "ready", "live", "ping", "status", "metrics", "monitor", "heartbeat", "up", "alive" — suggest these as HTTP monitors.
2. Use the endpoint's summary or description as the monitor description.
3. If no dedicated health path exists in the spec, pick the most meaningful root-level GET endpoint as the HTTP check.
4. Prefer openApiSpecs data over image-name heuristics when they conflict — the spec is ground truth.
5. Still suggest a ping check regardless.

## Hostname rules
- For host-mapped ports (hostPort is non-null): use "localhost" and the hostPort
- For container-only ports (hostPort is null): use the container name and the containerPort

## Health endpoint knowledge
Always prefer a specific health/readiness endpoint over the root path when one is known for the image.
Use this knowledge to suggest the best HTTP check URL:

**Generic patterns (apply broadly):**
- If a Docker label contains a health path hint (e.g. "health.path", "healthcheck.path", "traefik.http.routers.*.rule" containing a path, or any label with "health" in the key), use that path.
- If envKeys include hints like "HEALTH_PATH", "HEALTHCHECK_PATH", "METRICS_PATH", use them in the URL.
- Always add a /metrics check on the same port if the image or labels suggest Prometheus exposure (e.g. labels contain "prometheus", envKeys contain "METRICS_PORT" or "PROMETHEUS").

**By image/framework — suggest these specific paths:**
- nginx, apache, httpd → /healthz or / (root)
- traefik → /ping (built-in health endpoint)
- caddy → /health (Caddy admin, but also check root)
- haproxy → /stats or root
- grafana → /api/health
- prometheus → /-/healthy and /-/ready
- alertmanager → /-/healthy
- node-exporter, any *-exporter → /metrics
- uptime-kuma → /
- portainer → /api/status
- gitea → /api/healthz
- gitlab → /-/health and /-/readiness
- harbor → /api/v2.0/ping
- nextcloud → /status.php
- wordpress → /wp-login.php or /
- ghost → /ghost/api/v4/admin/site/
- strapi → /_health
- directus → /server/health
- hasura → /healthz
- keycloak → /health/ready
- authentik → /-/health/ready/
- vaultwarden, bitwarden → /alive
- vault (hashicorp) → /v1/sys/health
- consul → /v1/status/leader
- minio → /minio/health/live
- influxdb → /health
- loki → /ready
- tempo → /ready
- jaeger → /
- zipkin → /health
- elasticsearch → /_cluster/health
- opensearch → /_cluster/health
- kibana → /api/status
- logstash → /
- redis (HTTP API not applicable — use port/db check instead)
- rabbitmq → /api/health/checks/aliveness (management plugin, port 15672)
- nats → /healthz
- kafka → (TCP port check only — no standard HTTP health endpoint)
- zookeeper → (TCP port check only)
- mysql, mariadb, postgres, mongo → (DB-type check + TCP, no HTTP)
- Node.js apps → /health, /healthz, or /api/health (suggest all three as separate checks if uncertain)
- Python/Django → /health/, /healthcheck/, /api/health/
- Python/FastAPI or Flask → /health, /docs (FastAPI), /ping
- Go apps → /health, /healthz, /readyz
- Java/Spring Boot → /actuator/health (primary), /actuator/info, /actuator/metrics
- Java/Quarkus → /q/health/ready, /q/health/live
- Java/Micronaut → /health
- .NET / ASP.NET → /health, /healthz
- Ruby on Rails → /up (Rails 7.1+), /health
- PHP/Laravel → /up, /health
- Rust apps → /health, /healthz

## Rules
1. Always suggest at least a ping check for every container.
2. For any container with an HTTP port, suggest at least one HTTP check. Use the most specific health path you know for the image; if uncertain, suggest /health as the primary and note it may need adjusting.
3. If a container likely exposes Prometheus metrics (image name contains "exporter", labels contain "prometheus.io/scrape=true", or envKeys include "METRICS_PORT"), add a separate /metrics HTTP check.
4. For databases (postgres, mysql, mariadb, redis, mongo, mongodb): suggest a TCP port check AND a database-type monitor (requiresConnectionString: true).
5. Do not suggest both a root "/" check and a specific health path — pick the most useful one unless they serve clearly different purposes (e.g. /actuator/health is different from the app root).
6. Database connection string templates: use "localhost" for host-mapped ports, container name otherwise.
7. Monitor names: "[ContainerName] - [CheckType]" (e.g. "my-app - Health", "my-app - Metrics", "my-postgres - TCP Port").
8. Set interval to 60 for all monitors.

For database monitors, set requiresConnectionString: true so the UI can prompt the user.

Respond ONLY with a valid JSON object. No markdown, no explanation. Format:
{
  "<containerId>": [
    {
      "type": "http",
      "name": "my-app - Health",
      "description": "Spring Boot actuator health endpoint",
      "interval": 60,
      "requiresConnectionString": false,
      "url": "http://localhost:8080/actuator/health",
      "method": "GET"
    },
    {
      "type": "http",
      "name": "my-app - Metrics",
      "description": "Prometheus metrics endpoint",
      "interval": 60,
      "requiresConnectionString": false,
      "url": "http://localhost:8080/metrics",
      "method": "GET"
    }
  ]
}`;

async function suggestMonitors(containers) {
  const model = getModel();

  const containerList = containers.map(c => {
    const entry = {
      id: c.id,
      name: c.name,
      image: c.image,
      ports: c.ports,
      labels: c.labels,
      envKeys: c.envKeys || [],
      networks: c.networks,
    };
    if (c.openApiSpecs && c.openApiSpecs.length > 0) {
      entry.openApiSpecs = c.openApiSpecs.map(s => ({
        port: s.port,
        foundAt: s.foundAt,
        title: s.title,
        description: s.description,
        endpoints: s.endpoints,
      }));
    }
    return entry;
  });

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: `Please suggest Uptime Kuma health check monitors for these Docker containers:\n\n${JSON.stringify(containerList, null, 2)}`,
  });

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI returned invalid JSON. Please try again.');
  }
}

module.exports = { suggestMonitors };
