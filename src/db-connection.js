/**
 * Builds pre-filled database connection strings from container env vars.
 * Only called when the container has known credential env vars in its dbEnv map.
 * Returns null if there are no env var values worth using (fallback to AI template).
 *
 * Last verified: 2026-10-07.
 */

const DEFAULT_PORTS = { postgres: 5432, mysql: 3306, redis: 6379, mongodb: 27017 };

/**
 * Resolves { hostname, port } for a database connection string. Shared with
 * programmatic.js. Prefers the host-mapped port when useContainerNames is false.
 */
function resolveDbAddress(c, dbType, settings) {
  const useContainerNames = !!(settings && settings.useContainerNames);
  const defaultPort = DEFAULT_PORTS[dbType];
  const mapping = (c.ports || []).find(p => p.containerPort === defaultPort && p.protocol === 'tcp');
  const port = !mapping ? defaultPort
    : useContainerNames ? mapping.containerPort : (mapping.hostPort ?? mapping.containerPort);
  return { hostname: useContainerNames ? c.name : 'localhost', port };
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
      const pass = dbEnv.POSTGRES_PASSWORD || '';
      if (!dbEnv.POSTGRES_USER && !pass) return null;
      // The official image defaults the superuser to "postgres" when POSTGRES_USER is unset
      const user = dbEnv.POSTGRES_USER || 'postgres';
      const db   = dbEnv.POSTGRES_DB || 'postgres';
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
      if (!(sugg.type in DEFAULT_PORTS)) continue;
      const { hostname, port } = resolveDbAddress(c, sugg.type, settings);
      const connStr = buildDbConnectionString(sugg.type, c.dbEnv, hostname, port);
      if (connStr) sugg.databaseConnectionString = connStr;
    }
  }
}

module.exports = { buildDbConnectionString, enrichDbSuggestions, resolveDbAddress };
