# Group Monitors by Container Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional setting that creates a Uptime Kuma group monitor for each container and nests all of that container's monitors inside it, reusing an existing group if one already exists.

**Architecture:** `connectAndLogin` is updated to capture and return the initial `monitorList` payload (which Kuma sends for free at login). `addMonitors` receives a `groupByContainer` flag; when set, it looks up an existing group by name in that payload (or in KumaGen's local DB as a fallback), creates one if absent, then sets `parent` on every child monitor. The setting is persisted in SQLite via the existing key-value store and exposed through the settings dialog checkbox.

**Tech Stack:** Node.js / socket.io-client (server), React / shadcn (client), better-sqlite3 (persistence)

---

## Chunk 1: Backend — capture monitorList and thread groupByContainer through addMonitors

### Task 1: Update `connectAndLogin` to return monitorList data

**Files:**
- Modify: `server/kuma.js`

`connectAndLogin` currently resolves with just the socket after receiving `monitorList`. Change it to resolve with `{ socket, monitorList }` so callers can inspect existing monitors without an extra round-trip.

- [ ] **Step 1: Update `connectAndLogin` to resolve `{ socket, monitorList }`**

In `server/kuma.js`, change the `monitorList` handler:

```js
socket.once('monitorList', (data) => {
  clearTimeout(timeout);
  resolve({ socket, monitorList: data || {} });
});
```

- [ ] **Step 2: Update `testConnection` to destructure the new shape**

```js
async function testConnection() {
  const { url, username, password } = getKumaSettings();
  const { socket } = await connectAndLogin(url, username, password);
  socket.disconnect();
  return { ok: true };
}
```

- [ ] **Step 3: Update `addMonitors` to destructure the new shape**

Change the opening of `addMonitors`:

```js
async function addMonitors(monitors, options = {}) {
  const { url, username, password } = getKumaSettings();
  const { socket, monitorList } = await connectAndLogin(url, username, password);
  // ...rest unchanged for now
```

- [ ] **Step 4: Manual smoke-test — confirm test-connection still works**

```bash
curl -s -X POST http://localhost:3001/api/settings/test-connection
# Expected: {"ok":true,"message":"Connected to Uptime Kuma successfully"}
```

- [ ] **Step 5: Commit**

```bash
git add server/kuma.js
git commit -m "refactor: connectAndLogin resolves {socket, monitorList}"
```

---

### Task 2: Implement group-monitor lookup and creation logic

**Files:**
- Modify: `server/kuma.js`
- Modify: `server/db.js`

When `groupByContainer` is true, for each unique `containerId` in the monitors array:
1. Search `monitorList` (the Kuma-side data) for a `type === 'group'` entry whose `name` matches `containerName`
2. Fall back to KumaGen's local SQLite `monitored_containers` table for a row with `monitor_type = 'group'`
3. If neither found, emit `"add"` with `type: "group"` to create one
4. Attach the resolved `groupId` as `parent` on every child monitor for that container

- [ ] **Step 1: Add `getGroupMonitorId` helper to `db.js`**

```js
// Returns the Kuma monitor ID of the group for a given container, or null
function getGroupMonitorId(containerId) {
  const row = getDb()
    .prepare('SELECT monitor_id FROM monitored_containers WHERE container_id = ? AND monitor_type = ? ORDER BY created_at DESC LIMIT 1')
    .get(containerId, 'group');
  return row ? row.monitor_id : null;
}
```

Export it:
```js
module.exports = { getSetting, setSetting, getAllSettings, getMonitoredContainerIds, getMonitorsByContainerId, recordMonitors, getGroupMonitorId };
```

- [ ] **Step 2: Add `resolveOrCreateGroup` helper inside `addMonitors` in `kuma.js`**

Add this function inside `addMonitors` (closure over `socket`, `monitorList`):

```js
async function resolveOrCreateGroup(containerId, containerName) {
  // 1. Check live monitorList from Kuma for an existing group with this name
  const existingGroup = Object.values(monitorList).find(
    m => m.type === 'group' && m.name === containerName
  );
  if (existingGroup) return existingGroup.id;

  // 2. Check KumaGen's local DB (handles renamed-in-Kuma edge case less well,
  //    but is a useful safety net when container names are stable)
  const storedId = getGroupMonitorId(containerId);
  if (storedId) return storedId;

  // 3. Create a new group monitor
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out creating group monitor')), 30000);
    socket.emit('add', {
      type: 'group',
      name: containerName,
      active: true,
      notificationIDList: {},
      accepted_statuscodes: ['200-299'],
      kafkaProducerBrokers: [],
      kafkaProducerSaslOptions: {},
    }, (res) => {
      clearTimeout(timeout);
      if (res.ok) resolve(res.monitorID);
      else reject(new Error(res.msg || 'Failed to create group monitor'));
    });
  });

  // Record the group in local DB so future runs can find it
  recordMonitors(containerId, containerName, [{ monitorId: result, name: containerName, type: 'group' }]);

  return result;
}
```

- [ ] **Step 3: Wire `groupByContainer` into the per-monitor loop**

Replace the existing loop in `addMonitors`:

```js
async function addMonitors(monitors, options = {}) {
  const { groupByContainer = false } = options;
  const { url, username, password } = getKumaSettings();
  const { socket, monitorList } = await connectAndLogin(url, username, password);

  // Pre-resolve group IDs for all containers that appear in this batch
  const groupIdByContainer = {};
  if (groupByContainer) {
    const uniqueContainers = [...new Map(monitors.map(m => [m.containerId, m])).values()];
    for (const { containerId, containerName } of uniqueContainers) {
      groupIdByContainer[containerId] = await resolveOrCreateGroup(containerId, containerName);
    }
  }

  const results = [];
  try {
    for (const monitor of monitors) {
      const { containerId, containerName, ...monitorData } = monitor;
      try {
        const payload = {
          maxretries: 1,
          retryInterval: 60,
          accepted_statuscodes: ['200-299'],
          notificationIDList: {},
          kafkaProducerBrokers: [],
          kafkaProducerSaslOptions: {},
          ...monitorData,
        };
        if (groupByContainer && groupIdByContainer[containerId]) {
          payload.parent = groupIdByContainer[containerId];
        }
        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timed out waiting for Kuma response')), 30000);
          socket.emit('add', payload, (res) => {
            clearTimeout(timeout);
            if (res.ok) resolve({ ok: true, monitorID: res.monitorID });
            else reject(new Error(res.msg || 'Failed to add monitor'));
          });
        });
        results.push({ containerId, containerName, name: monitorData.name, type: monitorData.type, ...result });
      } catch (err) {
        results.push({ containerId, containerName, name: monitorData.name, ok: false, error: err.message });
      }
    }
  } finally {
    socket.disconnect();
  }

  return results;
}
```

- [ ] **Step 4: Update the `require('./db')` import at the top of `kuma.js`**

Add `recordMonitors` and `getGroupMonitorId` (both are used inside `resolveOrCreateGroup`):

```js
const { getSetting, recordMonitors, getGroupMonitorId } = require('./db');
```

- [ ] **Step 5: Manual test — create monitors with grouping enabled**

```bash
curl -s -X POST http://localhost:3001/api/monitors \
  -H 'Content-Type: application/json' \
  -d '{
    "monitors": [
      {"containerId":"test-nginx","containerName":"test-nginx","name":"Nginx HTTP","type":"http","url":"http://192.168.1.167:8080","interval":60},
      {"containerId":"test-nginx","containerName":"test-nginx","name":"Nginx TCP","type":"port","hostname":"192.168.1.167","port":8080,"interval":60}
    ],
    "options": {"groupByContainer": true}
  }'
# Expected: both monitors ok:true, group "test-nginx" visible in Uptime Kuma UI with 2 children
```

- [ ] **Step 6: Manual test — run same request again to verify group is reused, not duplicated**

```bash
# Same curl command as Step 5
# Expected: a third monitor added under the SAME group, not a new group created
```

- [ ] **Step 7: Commit**

```bash
git add server/kuma.js server/db.js
git commit -m "feat: add groupByContainer support in addMonitors"
```

---

### Task 3: Thread `options` from the monitors route

**Files:**
- Modify: `server/routes/monitors.js`
- Modify: `server/routes/settings.js`

The route needs to accept `options` from the request body and pass it to `addMonitors`. The setting also needs to be readable so the route can default to whatever the user configured.

- [ ] **Step 1: Update the `require('../db')` import at the top of `monitors.js`**

Add `getSetting` to the destructured import:

```js
const { recordMonitors, getSetting } = require('../db');
```

- [ ] **Step 2: Update the route handler to read `options` and fall back to the stored setting**

```js
const { addMonitors } = require('../kuma');
const { recordMonitors, getSetting } = require('../db');

router.post('/', async (req, res) => {
  const { monitors, options = {} } = req.body;
  if (!Array.isArray(monitors) || monitors.length === 0) {
    return res.status(400).json({ error: 'monitors must be a non-empty array' });
  }

  // Fall back to the stored setting if caller does not explicitly pass the option
  const groupByContainer =
    options.groupByContainer !== undefined
      ? options.groupByContainer
      : (getSetting('groupByContainer') ?? 'false') !== 'false';

  try {
    const results = await addMonitors(monitors, { groupByContainer });
    // ... rest of existing recording logic unchanged
```

- [ ] **Step 3: Add `groupByContainer` to the allowed keys in `settings.js`**

```js
const allowed = ['aiProvider', 'aiApiKey', 'aiModel', 'aiBaseUrl', 'kumaUrl', 'kumaUsername', 'kumaPassword',
  'anthropicApiKey',
  'suggestHttp', 'suggestPort', 'suggestPing', 'suggestDns', 'suggestDocker', 'suggestDatabase',
  'useContainerNames', 'useTraefikLabels', 'groupByContainer',
];
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/monitors.js server/routes/settings.js
git commit -m "feat: wire groupByContainer setting through monitors route"
```

---

## Chunk 2: Frontend — settings checkbox and rebuild

### Task 4: Add the setting to the Settings dialog

**Files:**
- Modify: `client/src/components/Settings.jsx`

Add `groupByContainer` to the form state, the `toBool` load block, the boolean serialization list in `handleSave`, and the checkbox grid.

- [ ] **Step 1: Add `groupByContainer` to initial form state**

In the `useState` initializer:
```js
groupByContainer: false,
```

- [ ] **Step 2: Load it in the `useEffect` fetch block**

```js
groupByContainer: toBool(data.groupByContainer, false),
```

- [ ] **Step 3: Serialize it in `handleSave`**

Add `'groupByContainer'` to the boolean-serialization loop:
```js
for (const key of ['suggestHttp', 'suggestPort', 'suggestPing', 'suggestDns', 'suggestDocker', 'suggestDatabase',
                    'useContainerNames', 'useTraefikLabels', 'groupByContainer']) {
```

- [ ] **Step 4: Add the checkbox below `useTraefikLabels` in the JSX**

Add this block after the `useTraefikLabels` section (still inside `<div className="pt-1 space-y-3">`):

```jsx
<div className="space-y-1">
  <div className="flex items-center gap-2">
    <Checkbox
      id="groupByContainer"
      checked={!!form.groupByContainer}
      onCheckedChange={val => setForm(f => ({ ...f, groupByContainer: !!val }))}
    />
    <Label htmlFor="groupByContainer" className="text-sm font-normal cursor-pointer">
      Group monitors by container
    </Label>
  </div>
  <p className="text-xs text-muted-foreground pl-6">
    Creates a group monitor for each container and nests its monitors inside it. Reuses an existing group if one already exists.
  </p>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Settings.jsx
git commit -m "feat: add groupByContainer checkbox to settings UI"
```

---

### Task 5: Rebuild and redeploy

- [ ] **Step 1: Rebuild the Docker image**

```bash
docker compose build --no-cache
# Expected: Image kumagen-kumagen Built
```

- [ ] **Step 2: Redeploy**

```bash
docker compose up -d --force-recreate
# Expected: Container kumagen-kumagen-1 Started
```

- [ ] **Step 3: End-to-end verify via API (grouping on)**

```bash
curl -s -X POST http://localhost:3001/api/monitors \
  -H 'Content-Type: application/json' \
  -d '{
    "monitors": [
      {"containerId":"test-redis","containerName":"test-redis","name":"Redis TCP","type":"port","hostname":"192.168.1.167","port":6379,"interval":60}
    ],
    "options": {"groupByContainer": true}
  }'
# Expected: {"results":[{"ok":true,...}],"summary":{"succeeded":1,"failed":0}}
# Verify in Uptime Kuma UI at localhost:3002: a "test-redis" group containing "Redis TCP"
```

- [ ] **Step 4: End-to-end verify — run again to confirm group is reused**

```bash
# Same curl. Expected: new monitor added under same "test-redis" group
```

- [ ] **Step 5: End-to-end verify via UI**

1. Open `http://localhost:3001`
2. Open Settings → confirm "Group monitors by container" checkbox is present
3. Enable it, save
4. Select a container, generate suggestions, add monitors
5. Confirm Uptime Kuma shows a named group containing the monitors

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete group-monitors-by-container feature"
```
