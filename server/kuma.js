const { io } = require('socket.io-client');
const { getSetting } = require('./db');

function getKumaSettings() {
  const url = getSetting('kumaUrl') || process.env.KUMA_URL;
  const username = getSetting('kumaUsername') || process.env.KUMA_USERNAME;
  const password = getSetting('kumaPassword') || process.env.KUMA_PASSWORD;

  if (!url) throw new Error('Uptime Kuma URL not configured. Set it in Settings.');
  if (!username || !password) throw new Error('Uptime Kuma credentials not configured. Set them in Settings.');

  return { url, username, password };
}

function connectAndLogin(url, username, password) {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Connection to Uptime Kuma timed out after 15 seconds'));
    }, 15000);

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Cannot connect to Uptime Kuma: ${err.message}`));
    });

    socket.on('connect', () => {
      socket.emit('login', { username, password, token: '' }, (result) => {
        if (!result.ok) {
          clearTimeout(timeout);
          socket.disconnect();
          reject(new Error(result.msg || 'Uptime Kuma login failed. Check credentials.'));
          return;
        }
        // Wait for monitorList — Kuma's signal that initial state sync is complete
        // and the server is ready to process commands like addMonitor.
        socket.once('monitorList', (data) => {
          clearTimeout(timeout);
          resolve({ socket, monitorList: data || {} });
        });
      });
    });
  });
}

async function testConnection() {
  const { url, username, password } = getKumaSettings();
  const { socket } = await connectAndLogin(url, username, password);
  socket.disconnect();
  return { ok: true };
}

async function addMonitors(monitors, options = {}) {
  const { url, username, password } = getKumaSettings();
  const { socket, monitorList } = await connectAndLogin(url, username, password);

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
        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timed out waiting for Kuma response')), 30000);
          // Uptime Kuma v1 uses "add" (not "addMonitor") for the socket event
          socket.emit('add', payload, (res) => {
            clearTimeout(timeout);
            if (res.ok) {
              resolve({ ok: true, monitorID: res.monitorID });
            } else {
              reject(new Error(res.msg || 'Failed to add monitor'));
            }
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

module.exports = { testConnection, addMonitors };
