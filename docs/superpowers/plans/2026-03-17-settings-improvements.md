# Settings Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four UX improvements: AI indicator badges in Settings, a `preferPublicUrl` toggle, programmatic multi-endpoint HTTP suggestions, and dynamic examples in the Help dialog.

**Architecture:** All four changes are additive — no existing logic is removed. Features 1 and 4 are UI-only. Feature 2 adds one new setting key (backend + frontend). Feature 3 introduces a new `server/health-endpoints.js` module and extends `programmatic.js`. Changes are isolated; each task can be built and tested independently.

**Tech Stack:** React + Tailwind (frontend), Node.js + Express + better-sqlite3 (backend), Lucide icons, shadcn/ui components.

---

## Chunk 1: AI Badges in Settings + `preferPublicUrl` setting

### Task 1: AI indicator badges in Settings.jsx

**Files:**
- Modify: `client/src/components/Settings.jsx:276-293`

The monitor suggestion checkboxes section renders a static array. We need to mark HTTP, DNS, and Database as requiring AI. The badge should be visually subtle — a small `AI` chip next to the label.

- [ ] **Step 1: Add AI badge data to the checkbox array**

In `Settings.jsx`, find the checkboxes array (around line 276):
```js
{[
  { key: 'suggestHttp',     label: 'HTTP / HTTPS' },
  { key: 'suggestPort',     label: 'TCP Port' },
  { key: 'suggestPing',     label: 'Ping' },
  { key: 'suggestDns',      label: 'DNS' },
  { key: 'suggestDocker',   label: 'Docker Container' },
  { key: 'suggestDatabase', label: 'Database' },
].map(({ key, label }) => (
```

Replace with:
```js
{[
  { key: 'suggestHttp',     label: 'HTTP / HTTPS', needsAI: true },
  { key: 'suggestPort',     label: 'TCP Port',     needsAI: false },
  { key: 'suggestPing',     label: 'Ping',         needsAI: false },
  { key: 'suggestDns',      label: 'DNS',          needsAI: true },
  { key: 'suggestDocker',   label: 'Docker Container', needsAI: false },
  { key: 'suggestDatabase', label: 'Database',     needsAI: true },
].map(({ key, label, needsAI: requiresAI }) => (
```

- [ ] **Step 2: Render the AI badge inside the checkbox row**

The current label rendering inside the map is:
```jsx
<div key={key} className="flex items-center gap-2">
  <Checkbox ... />
  <Label htmlFor={key} className="text-sm font-normal cursor-pointer">{label}</Label>
</div>
```

Replace with:
```jsx
<div key={key} className="flex items-center gap-2">
  <Checkbox
    id={key}
    checked={!!form[key]}
    onCheckedChange={val => setForm(f => ({ ...f, [key]: !!val }))}
  />
  <Label htmlFor={key} className="text-sm font-normal cursor-pointer flex items-center gap-1.5">
    {label}
    {requiresAI && (
      <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-violet-950/60 border border-violet-700/50 text-violet-300 leading-none">AI</span>
    )}
  </Label>
</div>
```

- [ ] **Step 3: Update the section description to explain AI badges**

Find the `<p>` tag just above the grid (line ~274):
```jsx
<p className="text-xs text-muted-foreground">Choose which types of monitors the AI should suggest.</p>
```

Replace with:
```jsx
<p className="text-xs text-muted-foreground">
  Choose which monitor types to suggest. Types marked{' '}
  <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-violet-950/60 border border-violet-700/50 text-violet-300 leading-none">AI</span>{' '}
  require an AI API key.
</p>
```

- [ ] **Step 4: Verify visually — open Settings, confirm HTTP/DNS/Database have violet AI chip, Port/Ping/Docker do not**

---

### Task 2: `preferPublicUrl` setting

**Files:**
- Modify: `client/src/components/Settings.jsx` (form state, load, save, checkbox)
- Modify: `server/routes/settings.js` (allowed keys)
- Modify: `server/ai.js` (buildSystemPrompt)

`preferPublicUrl` tells the app to use Traefik-discovered public hostnames for HTTP monitors. Currently the AI is *encouraged* to prefer Traefik hostnames — this flag makes it *mandatory*.

- [ ] **Step 1: Add `preferPublicUrl` to form state in Settings.jsx**

In the initial `useState` (line ~68), add:
```js
preferPublicUrl: false,
```

- [ ] **Step 2: Add `preferPublicUrl` to the load handler**

In the `.then(data => { ... setForm({ ... })` block, add:
```js
preferPublicUrl: toBool(data.preferPublicUrl, false),
```

- [ ] **Step 3: Add `preferPublicUrl` to the save serialization**

In `handleSave`, find the `for (const key of [...])` loop and add `'preferPublicUrl'` to the array:
```js
for (const key of ['suggestHttp', 'suggestPort', 'suggestPing', 'suggestDns', 'suggestDocker', 'suggestDatabase', 'useContainerNames', 'useTraefikLabels', 'groupByContainer', 'preferPublicUrl']) {
```

- [ ] **Step 4: Add the checkbox UI to Settings.jsx**

After the `groupByContainer` checkbox block (around line 338), add a new `<div className="space-y-1">` block:
```jsx
<div className="space-y-1">
  <div className="flex items-center gap-2">
    <Checkbox
      id="preferPublicUrl"
      checked={!!form.preferPublicUrl}
      onCheckedChange={val => setForm(f => ({ ...f, preferPublicUrl: !!val }))}
    />
    <Label htmlFor="preferPublicUrl" className="text-sm font-normal cursor-pointer">
      Use Traefik public URL for HTTP monitors
    </Label>
  </div>
  <p className="text-xs text-muted-foreground pl-6">
    When enabled and Traefik labels are present, HTTP monitors use the discovered public hostname (e.g.{' '}
    <code className="font-mono">https://myapp.example.com/health</code>) instead of{' '}
    <code className="font-mono">localhost</code> or container name.
  </p>
</div>
```

- [ ] **Step 5: Add `preferPublicUrl` to allowed keys in server/routes/settings.js**

Find the `ALLOWED_KEYS` array (or equivalent filter list) and add `'preferPublicUrl'`.

To locate it:
```bash
grep -n "groupByContainer\|ALLOWED\|allowedKeys" server/routes/settings.js
```

- [ ] **Step 6: Update buildSystemPrompt in server/ai.js to honor preferPublicUrl**

In `buildSystemPrompt(settings)`, destructure `preferPublicUrl`:
```js
const {
  suggestHttp = true,
  ...
  preferPublicUrl = false,
} = settings || {};
```

Then add a rule to the `rules` array when `preferPublicUrl` is true and `suggestHttp` is true:
```js
if (suggestHttp && preferPublicUrl) {
  rules.push('- IMPORTANT: When traefikRouters is present for a container, you MUST use the public hostname from traefikRouters for HTTP monitor URLs. Do NOT fall back to localhost or container name for HTTP checks when a public URL is available.');
}
```

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Settings.jsx server/routes/settings.js server/ai.js
git commit -m "feat: add AI badges to settings and preferPublicUrl toggle"
```

---

## Chunk 2: Programmatic HTTP suggestions + Help dynamic examples

### Task 3: Programmatic HTTP suggestions from static lookup table

**Files:**
- Create: `server/health-endpoints.js`
- Modify: `server/programmatic.js` (add `generateHttpSuggestions`, integrate into `generateProgrammaticSuggestions`)
- Modify: `server/ai.js` (URL deduplication in `suggestMonitors`)

The goal: for well-known images, generate HTTP monitor suggestions without AI. When AI also suggests HTTP monitors, deduplicate by URL so the user doesn't see duplicates.

- [ ] **Step 1: Create server/health-endpoints.js**

```js
/**
 * Static lookup table: image name substring → array of health endpoint paths.
 * Matched case-insensitively against the container image name.
 * Each entry: { path, description }
 */
const HEALTH_ENDPOINTS = [
  { match: 'nginx',          paths: [{ path: '/healthz', description: 'nginx health check' }, { path: '/', description: 'nginx root' }] },
  { match: 'traefik',        paths: [{ path: '/ping', description: 'Traefik built-in health endpoint' }] },
  { match: 'grafana',        paths: [{ path: '/api/health', description: 'Grafana API health' }] },
  { match: 'prometheus',     paths: [{ path: '/-/healthy', description: 'Prometheus health' }, { path: '/-/ready', description: 'Prometheus readiness' }] },
  { match: 'alertmanager',   paths: [{ path: '/-/healthy', description: 'Alertmanager health' }] },
  { match: 'node-exporter',  paths: [{ path: '/metrics', description: 'Prometheus metrics endpoint' }] },
  { match: 'exporter',       paths: [{ path: '/metrics', description: 'Prometheus metrics endpoint' }] },
  { match: 'portainer',      paths: [{ path: '/api/status', description: 'Portainer API status' }] },
  { match: 'gitea',          paths: [{ path: '/api/healthz', description: 'Gitea health check' }] },
  { match: 'nextcloud',      paths: [{ path: '/status.php', description: 'Nextcloud status' }] },
  { match: 'minio',          paths: [{ path: '/minio/health/live', description: 'MinIO liveness check' }] },
  { match: 'keycloak',       paths: [{ path: '/health/ready', description: 'Keycloak readiness' }] },
  { match: 'authentik',      paths: [{ path: '/-/health/ready/', description: 'Authentik readiness' }] },
  { match: 'vaultwarden',    paths: [{ path: '/alive', description: 'Vaultwarden alive check' }] },
  { match: 'bitwarden',      paths: [{ path: '/alive', description: 'Bitwarden alive check' }] },
  { match: 'vault',          paths: [{ path: '/v1/sys/health', description: 'Vault system health' }] },
  { match: 'influxdb',       paths: [{ path: '/health', description: 'InfluxDB health' }] },
  { match: 'loki',           paths: [{ path: '/ready', description: 'Loki readiness' }] },
  { match: 'elasticsearch',  paths: [{ path: '/_cluster/health', description: 'Elasticsearch cluster health' }] },
  { match: 'opensearch',     paths: [{ path: '/_cluster/health', description: 'OpenSearch cluster health' }] },
  { match: 'kibana',         paths: [{ path: '/api/status', description: 'Kibana status' }] },
  { match: 'rabbitmq',       paths: [{ path: '/api/health/checks/aliveness', description: 'RabbitMQ aliveness (management port 15672)' }] },
  { match: 'nats',           paths: [{ path: '/healthz', description: 'NATS health' }] },
  { match: 'directus',       paths: [{ path: '/server/health', description: 'Directus server health' }] },
  { match: 'strapi',         paths: [{ path: '/_health', description: 'Strapi health' }] },
  { match: 'hasura',         paths: [{ path: '/healthz', description: 'Hasura health check' }] },
  { match: 'ghost',          paths: [{ path: '/ghost/api/v4/admin/site/', description: 'Ghost admin API' }] },
];

/**
 * Returns known health endpoint paths for a given image name.
 * @param {string} imageName - Docker image name (may include tag)
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
```

- [ ] **Step 2: Add getHttpPort helper and generateHttpSuggestions to programmatic.js**

At the top of `programmatic.js`, add the require:
```js
const { getKnownEndpoints } = require('./health-endpoints');
const { getTraefikRouters } = require('./traefik');
```

(Note: `getTraefikRouters` is already imported, keep it.)

Add a helper function after the imports:
```js
/** Returns the best HTTP hostname+port for a container given settings. */
function resolveHttpBase(c, settings) {
  const { useContainerNames = false, preferPublicUrl = false, useTraefikLabels = true } = settings;

  // preferPublicUrl: try to find a Traefik hostname first
  if (preferPublicUrl && useTraefikLabels) {
    const routers = getTraefikRouters(c.labels || {});
    if (routers.length > 0) {
      const r = routers[0];
      const scheme = r.scheme || 'https';
      const hostname = r.hostnames[0];
      if (hostname) return { base: `${scheme}://${hostname}`, isPublic: true };
    }
  }

  // Fallback: find a host-mapped HTTP-ish port
  const httpPorts = (c.ports || []).filter(p => p.protocol === 'tcp');
  if (httpPorts.length === 0) return null;

  const port = useContainerNames
    ? httpPorts[0].containerPort
    : (httpPorts[0].hostPort ?? httpPorts[0].containerPort);
  const hostname = useContainerNames ? c.name : 'localhost';
  return { base: `http://${hostname}:${port}`, isPublic: false };
}
```

Add `generateHttpSuggestions` function:
```js
/**
 * Generates HTTP monitor suggestions for containers with known health endpoints.
 * Only runs when suggestHttp is true.
 */
function generateHttpSuggestions(containers, settings) {
  const { suggestHttp = true } = settings || {};
  if (!suggestHttp) return {};

  const result = {};
  for (const c of containers) {
    const endpoints = getKnownEndpoints(c.image);
    if (endpoints.length === 0) {
      result[c.id] = [];
      continue;
    }

    const resolved = resolveHttpBase(c, settings);
    if (!resolved) {
      result[c.id] = [];
      continue;
    }

    result[c.id] = endpoints.map(({ path, description }) => ({
      type: 'http',
      name: `${c.name} - ${description}`,
      description,
      interval: 60,
      requiresConnectionString: false,
      url: `${resolved.base}${path}`,
      method: 'GET',
    }));
  }
  return result;
}
```

- [ ] **Step 3: Integrate generateHttpSuggestions into generateProgrammaticSuggestions**

In `generateProgrammaticSuggestions`, destructure `preferPublicUrl`:
```js
const {
  suggestDocker = true,
  suggestPort = true,
  suggestPing = true,
  suggestHttp = true,
  useContainerNames = false,
  useTraefikLabels = true,
  preferPublicUrl = false,
} = settings || {};
```

Before the `return result;` line, merge in HTTP suggestions:
```js
if (suggestHttp) {
  const httpSuggs = generateHttpSuggestions(containers, settings);
  for (const [cid, suggs] of Object.entries(httpSuggs)) {
    if (suggs.length > 0) {
      result[cid] = [...(result[cid] || []), ...suggs];
    }
  }
}

return result;
```

- [ ] **Step 4: Add URL deduplication in ai.js suggestMonitors**

In `suggestMonitors`, after the merge loop, add deduplication for HTTP monitors by URL:

Find the merge block:
```js
const merged = { ...programmatic };
for (const [cid, aiSuggs] of Object.entries(aiResult)) {
  if (merged[cid]) {
    merged[cid] = [...merged[cid], ...aiSuggs];
  } else {
    merged[cid] = aiSuggs;
  }
}
return merged;
```

Replace with:
```js
const merged = { ...programmatic };
for (const [cid, aiSuggs] of Object.entries(aiResult)) {
  if (merged[cid]) {
    // Deduplicate HTTP suggestions by normalized URL
    const existingUrls = new Set(
      merged[cid].filter(s => s.type === 'http' && s.url).map(s => s.url.toLowerCase())
    );
    const dedupedAi = aiSuggs.filter(
      s => s.type !== 'http' || !s.url || !existingUrls.has(s.url.toLowerCase())
    );
    merged[cid] = [...merged[cid], ...dedupedAi];
  } else {
    merged[cid] = aiSuggs;
  }
}
return merged;
```

- [ ] **Step 5: Export generateHttpSuggestions from programmatic.js**

```js
module.exports = { generateProgrammaticSuggestions, generateHttpSuggestions, needsAI };
```

- [ ] **Step 6: Commit**

```bash
git add server/health-endpoints.js server/programmatic.js server/ai.js
git commit -m "feat: add programmatic HTTP suggestions from health-endpoints lookup table"
```

---

### Task 4: Dynamic examples in Help dialog

**Files:**
- Modify: `client/src/components/Help.jsx`

Currently `Help.jsx` has a static `MONITOR_TYPES` array with hardcoded examples. We need to:
1. Fetch settings when the dialog opens
2. Derive example strings based on `preferPublicUrl` / `useContainerNames`
3. Pass derived examples into the render

- [ ] **Step 1: Add React import and settings state to Help.jsx**

At the top of Help.jsx, change the import:
```js
import { useState, useEffect } from 'react';
import { HelpCircle, ExternalLink } from 'lucide-react';
```

- [ ] **Step 2: Convert Help from static to settings-aware component**

Convert `MONITOR_TYPES` from a module-level constant to a function that takes settings and returns the array. Add it inside or above the component.

Remove the static `MONITOR_TYPES` constant and replace with a function:
```js
function getMonitorTypes(settings) {
  const { preferPublicUrl = false, useContainerNames = false } = settings || {};

  // Derive example hostnames based on settings
  let httpExample, portExample, pingExample;
  if (preferPublicUrl) {
    httpExample = 'https://myapp.example.com/health';
    portExample = 'myapp.example.com:8080';
    pingExample = 'myapp.example.com';
  } else if (useContainerNames) {
    httpExample = 'http://my-app:8080/health';
    portExample = 'my-app:8080';
    pingExample = 'my-app';
  } else {
    httpExample = 'http://localhost:8080/health';
    portExample = 'localhost:8080';
    pingExample = 'localhost';
  }

  return [
    {
      label: 'HTTP / HTTPS',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      description:
        'Sends an HTTP or HTTPS request to a URL and checks for a successful response (2xx). The primary check for web services and APIs.',
      source: 'AI-generated using known health endpoint patterns for the container image (e.g. /actuator/health for Spring Boot, /api/health for Node.js). When Traefik labels are present, the real public hostname is used instead of localhost.',
      example: httpExample,
    },
    {
      label: 'TCP Port',
      badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      description:
        'Attempts a TCP connection to verify a port is open and accepting connections. Works for any service regardless of protocol.',
      source: 'Automatically generated for every exposed TCP port on a container — no AI needed.',
      example: portExample,
    },
    {
      label: 'Ping',
      badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      description:
        'Sends an ICMP ping to verify a host is reachable at the network level. A lightweight availability check that detects total outages.',
      source: 'Automatically generated for every selected container — no AI needed.',
      example: pingExample,
    },
    {
      label: 'DNS',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      description:
        'Resolves a hostname via DNS and verifies it returns a valid A record. Ensures your public domain names are properly configured.',
      source: (
        <>
          <strong>Traefik labels (programmatic):</strong> Automatically generated from{' '}
          <code className="font-mono text-xs">traefik.http.routers.*.rule</code> labels when{' '}
          <em>Read Traefik labels</em> is enabled in Settings — no AI needed.
          <br />
          <strong>AI-generated:</strong> Also suggested by AI when the <em>DNS</em> monitor type is
          enabled in Settings.
        </>
      ),
      example: 'myapp.example.com → resolves to A record',
    },
    {
      label: 'Docker Container',
      badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      description:
        'Checks that a Docker container is in the "running" state by querying the Docker socket. Alerts immediately when a container crashes or is manually stopped.',
      source: 'Automatically generated for every selected container — no AI needed.',
      example: 'Container: my-app',
    },
    {
      label: 'Database',
      badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      description:
        'Connects using the native database protocol to verify the server is healthy and accepting queries. Supports PostgreSQL, MySQL/MariaDB, Redis, and MongoDB.',
      source: 'AI-generated when a database image (postgres, mysql, redis, mongo) is detected. Requires a connection string — you will be prompted to enter one before adding the monitor.',
      example: useContainerNames
        ? 'postgres://user:pass@my-postgres:5432/dbname'
        : 'postgres://user:pass@localhost:5432/dbname',
    },
  ];
}
```

- [ ] **Step 3: Add settings state and fetch to the Help component**

Change the component to:
```jsx
export function Help({ open, onOpenChange }) {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    if (!open) return;
    fetch('/api/settings').then(r => r.json()).then(data => {
      const toBool = (val, def) => val === undefined || val === null ? def : val !== 'false';
      setSettings({
        preferPublicUrl: toBool(data.preferPublicUrl, false),
        useContainerNames: toBool(data.useContainerNames, false),
      });
    }).catch(() => {});
  }, [open]);

  const monitorTypes = getMonitorTypes(settings);

  return (
    // ... rest of JSX unchanged, except replace MONITOR_TYPES with monitorTypes
  );
}
```

- [ ] **Step 4: Replace MONITOR_TYPES reference in JSX**

In the render, change:
```jsx
{MONITOR_TYPES.map(({ label, badgeClass, description, source, example }) => (
```
to:
```jsx
{monitorTypes.map(({ label, badgeClass, description, source, example }) => (
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Help.jsx
git commit -m "feat: Help dialog examples reflect current hostname settings"
```

---

## Chunk 3: Build and deploy

### Task 5: Build and deploy updated container

- [ ] **Step 1: Build updated Docker image**

```bash
cd /Users/donaldrich/Projects/KumaGen
docker build -t kumagen:latest .
```

- [ ] **Step 2: Restart KumaGen service**

```bash
docker compose -f docker-compose.yml up -d --force-recreate kumagen
```

(Adjust compose file name and service name to match actual deployment.)

- [ ] **Step 3: Verify the UI**

Open the app, go to Settings:
- Confirm HTTP/DNS/Database checkboxes show violet `AI` chip
- Confirm new "Use Traefik public URL for HTTP monitors" checkbox appears
- Save settings and confirm no errors

Open Help dialog:
- With default settings (localhost), confirm examples show `localhost:8080/health`
- Enable `Use container names` in Settings, reopen Help, confirm examples show container name

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup after settings improvements"
```
