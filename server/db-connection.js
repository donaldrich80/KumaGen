/**
 * Builds pre-filled database connection strings from container env vars.
 * Only called when the container has known credential env vars in its dbEnv map.
 * Returns null if there are no env var values worth using (fallback to AI template).
 */

const DEFAULT_PORTS = { postgres: 5432, mysql: 3306, redis: 6379, mongodb: 27017 };

/**
 * Resolves the hostname to use for a database connection string.
 * Mirrors the logic in programmatic.js for consistency.
 */
function resolveDbHostname(c, settings) {
  return (settings.useContainerNames) ? c.name : 'localhost';
}

/**
 * Resolves the port to use for a database connection string.
 * Prefers the host-mapped port when useContainerNames is false.
 */
function resolveDbPort(c, dbType, settings) {
  const defaultPort = DEFAULT_PORTS[dbType];
  const mapping = (c.ports || []).find(p => p.containerPort === defaultPort && p.protocol === 'tcp');
  if (!mapping) return defaultPort;
  return settings.useContainerNames ? mapping.containerPort : (mapping.hostPort ?? mapping.containerPort);
}

/**
 * Builds a pre-filled connection string for a database monitor.
 * Returns null when no useful credential data is available (caller should keep the AI template).
 *
 * @param {string} dbType  - 'postgres' | 'mysql' | 'redis' | 'mongodb'
 * @param {object} dbEnv   - map of allowlisted env var key→value from the container
 * @param {string} hostname
 * @param {number} port
 * @returns {string|null}
 */
function buildDbConnectionString(dbType, dbEnv, hostname, port) {
  const enc = v => encodeURIComponent(v);

  switch (dbType) {
    case 'postgres': {
      const user = dbEnv.POSTGRES_USER || '';
      const pass = dbEnv.POSTGRES_PASSWORD || '';
      const db   = dbEnv.POSTGRES_DB || 'postgres';
      if (!user && !pass) return null;
      return `postgres://${enc(user)}:${enc(pass)}@${hostname}:${port}/${db}`;
    }

    case 'mysql': {
      const user = dbEnv.MYSQL_USER || dbEnv.MARIADB_USER || 'root';
      const pass = dbEnv.MYSQL_PASSWORD || dbEnv.MARIADB_PASSWORD
                || dbEnv.MYSQL_ROOT_PASSWORD || dbEnv.MARIADB_ROOT_PASSWORD || '';
      const db   = dbEnv.MYSQL_DATABASE || dbEnv.MARIADB_DATABASE || '';
      if (!pass && !db) return null;
      return `mysql://${enc(user)}:${enc(pass)}@${hostname}:${port}/${db}`;
    }

    case 'redis': {
      const pass = dbEnv.REDIS_PASSWORD || dbEnv.REQUIREPASS || '';
      if (!pass) return null; // no password = no improvement over generic template
      return `redis://:${enc(pass)}@${hostname}:${port}`;
    }

    case 'mongodb': {
      const user = dbEnv.MONGO_INITDB_ROOT_USERNAME || dbEnv.MONGODB_USERNAME || '';
      const pass = dbEnv.MONGO_INITDB_ROOT_PASSWORD || dbEnv.MONGODB_PASSWORD || '';
      const db   = dbEnv.MONGO_INITDB_DATABASE || dbEnv.MONGODB_DATABASE || '';
      if (!user && !pass) return null;
      return `mongodb://${enc(user)}:${enc(pass)}@${hostname}:${port}/${db}`;
    }

    default:
      return null;
  }
}

/**
 * Enriches database-type suggestions in the merged suggestions map with
 * pre-filled connection strings derived from container env vars.
 * Mutates suggestions in place; falls back to existing databaseConnectionString if no env data.
 */
function enrichDbSuggestions(merged, containers, settings) {
  const containerMap = Object.fromEntries(containers.map(c => [c.id, c]));

  for (const [cid, suggs] of Object.entries(merged)) {
    const c = containerMap[cid];
    if (!c || !c.dbEnv || Object.keys(c.dbEnv).length === 0) continue;

    for (const sugg of suggs) {
      if (!['postgres', 'mysql', 'redis', 'mongodb'].includes(sugg.type)) continue;
      const hostname = resolveDbHostname(c, settings);
      const port = resolveDbPort(c, sugg.type, settings);
      const connStr = buildDbConnectionString(sugg.type, c.dbEnv, hostname, port);
      if (connStr) sugg.databaseConnectionString = connStr;
    }
  }
}

module.exports = { buildDbConnectionString, enrichDbSuggestions };
