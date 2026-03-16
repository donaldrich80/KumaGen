const PROBE_PATHS = [
  '/openapi.json',
  '/openapi.yaml',
  '/swagger.json',
  '/swagger/v1/swagger.json',
  '/swagger/v2/swagger.json',
  '/api-docs',
  '/api-docs.json',
  '/api/openapi.json',
  '/api/swagger.json',
  '/api/api-docs',
  '/docs/openapi.json',
  '/v1/openapi.json',
  '/v2/openapi.json',
  '/v3/openapi.json',
  '/api/v1/openapi.json',
  '/api/v2/openapi.json',
];

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return null; // YAML or non-JSON — skip
    }
  } catch {
    return null; // timeout, connection refused, etc.
  } finally {
    clearTimeout(timeout);
  }
}

function isOpenApiSpec(obj) {
  return obj && typeof obj === 'object' && (obj.openapi || obj.swagger) && obj.paths;
}

function extractEndpoints(spec) {
  const endpoints = [];
  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head']) {
      const op = item[method];
      if (!op) continue;
      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: op.summary || null,
        description: op.description || null,
        tags: op.tags || [],
        operationId: op.operationId || null,
      });
    }
  }
  return endpoints;
}

async function probePort(host, port) {
  for (const scheme of ['http', 'https']) {
    for (const probePath of PROBE_PATHS) {
      const url = `${scheme}://${host}:${port}${probePath}`;
      const data = await fetchJson(url);
      if (isOpenApiSpec(data)) {
        return {
          foundAt: url,
          title: data.info?.title || null,
          description: data.info?.description || null,
          version: data.info?.version || null,
          endpoints: extractEndpoints(data),
        };
      }
    }
  }
  return null;
}

async function getOpenApiSpecs(container) {
  // Only probe host-mapped ports (reachable from this process)
  const httpPorts = container.ports.filter(p => p.hostPort);
  if (httpPorts.length === 0) return [];

  const results = await Promise.all(
    httpPorts.map(async p => {
      const spec = await probePort('localhost', p.hostPort);
      if (!spec) return null;
      return { port: p.hostPort, containerPort: p.containerPort, ...spec };
    })
  );

  return results.filter(Boolean);
}

module.exports = { getOpenApiSpecs };
