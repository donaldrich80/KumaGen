const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'kumagen.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitored_containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_id TEXT NOT NULL,
      container_name TEXT NOT NULL,
      monitor_id INTEGER,
      monitor_name TEXT NOT NULL,
      monitor_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_monitored_containers_container_id
      ON monitored_containers(container_id);
  `);
}

// Settings helpers
function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// Monitored containers helpers
function getMonitoredContainerIds() {
  const rows = getDb().prepare('SELECT DISTINCT container_id FROM monitored_containers').all();
  return new Set(rows.map(r => r.container_id));
}

function getMonitorsByContainerId(containerId) {
  return getDb()
    .prepare('SELECT * FROM monitored_containers WHERE container_id = ? ORDER BY created_at DESC')
    .all(containerId);
}

function recordMonitors(containerId, containerName, monitors) {
  const insert = getDb().prepare(
    'INSERT INTO monitored_containers (container_id, container_name, monitor_id, monitor_name, monitor_type) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = getDb().transaction((monitors) => {
    for (const m of monitors) {
      insert.run(containerId, containerName, m.monitorId ?? null, m.name, m.type);
    }
  });
  insertMany(monitors);
}

// Returns the Kuma monitor ID of the group for a given container, or null
function getGroupMonitorId(containerId) {
  const row = getDb()
    .prepare('SELECT monitor_id FROM monitored_containers WHERE container_id = ? AND monitor_type = ? ORDER BY created_at DESC LIMIT 1')
    .get(containerId, 'group');
  return row ? row.monitor_id : null;
}

module.exports = { getSetting, setSetting, getAllSettings, getMonitoredContainerIds, getMonitorsByContainerId, recordMonitors, getGroupMonitorId };
