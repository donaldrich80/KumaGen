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

Rules:
1. Always suggest at least a ping check for every container
2. Web servers (nginx, apache, traefik, caddy, haproxy): suggest HTTP check on the appropriate port
3. Databases (postgres, postgresql, mysql, mariadb, redis, mongo, mongodb): suggest a TCP port check AND a database-type monitor (with requiresConnectionString: true)
4. APIs and app servers (node, python, go, etc.) with exposed HTTP ports: suggest HTTP check
5. For host-mapped ports (hostPort is non-null), use "localhost" as hostname and the hostPort for the URL/port
6. For container-only ports (hostPort is null), use the container name as hostname and the containerPort
7. Database connection string templates should use "localhost" for host-mapped ports, container name otherwise
8. Monitor names: "[ContainerName] - [CheckType]" (e.g. "my-nginx - HTTP", "my-postgres - TCP Port")
9. Set interval to 60 for all monitors
10. Do not duplicate checks (e.g. don't add both a "port" and "http" check for the same port if it's clearly HTTP)

For database monitors, set requiresConnectionString: true so the UI can prompt the user.

Respond ONLY with a valid JSON object. No markdown, no explanation. Format:
{
  "<containerId>": [
    {
      "type": "http",
      "name": "my-nginx - HTTP",
      "description": "HTTP health check for nginx on port 80",
      "interval": 60,
      "requiresConnectionString": false,
      "url": "http://localhost:80",
      "method": "GET"
    }
  ]
}`;

async function suggestMonitors(containers) {
  const model = getModel();

  const containerList = containers.map(c => ({
    id: c.id,
    name: c.name,
    image: c.image,
    ports: c.ports,
    labels: c.labels,
    envKeys: c.envKeys || [],
    networks: c.networks,
  }));

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
