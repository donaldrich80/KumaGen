# KumaGen

AI-powered Uptime Kuma monitor generator for Docker containers.

KumaGen scans your running Docker containers, uses AI to suggest appropriate health check monitors for each one, lets you review and edit the suggestions, then pushes them directly into your Uptime Kuma instance — all from a clean web UI.

---

## Features

- **Container scanning** — discovers all running Docker containers via the local socket
- **AI-generated suggestions** — sends container metadata (image, ports, labels, env var keys) to your chosen AI provider and receives tailored monitor suggestions
- **Multiple monitor types** — HTTP/HTTPS, TCP port, Ping, DNS, and database checks (PostgreSQL, MySQL, Redis, MongoDB)
- **Review & edit** — select, deselect, and edit every suggested monitor before it's added
- **Direct Kuma integration** — pushes monitors to Uptime Kuma via its Socket.IO API
- **Multi-provider AI** — supports Anthropic, OpenAI, Google Gemini, Ollama (local), and any OpenAI-compatible endpoint (Groq, Kimi, Together AI, LM Studio, etc.)
- **State tracking** — remembers which containers have already been monitored to avoid duplicates
- **Settings UI** — configure everything from the browser, no config files needed

---

## Screenshots

> _Coming soon_

---

## Quick Start

### Docker Compose (recommended)

```yaml
services:
  kumagen:
    image: ghcr.io/donaldrich80/kumagen:latest
    ports:
      - "3003:3003"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - kumagen-data:/app/data
    restart: unless-stopped

volumes:
  kumagen-data:
```

Then open **http://localhost:3003** and configure your settings.

### Build from source

```bash
git clone https://github.com/donaldrich80/KumaGen.git
cd KumaGen
docker compose up --build -d
```

---

## Configuration

All settings are configurable from the **Settings** panel in the UI (gear icon, top right). They are persisted to a local SQLite database and survive container restarts.

| Setting | Description |
|---------|-------------|
| **Kuma URL** | URL of your Uptime Kuma instance (e.g. `http://localhost:3001`) |
| **Kuma Username** | Uptime Kuma login username |
| **Kuma Password** | Uptime Kuma login password |
| **AI Provider** | One of: Anthropic, OpenAI, Google Gemini, Ollama, OpenAI-compatible |
| **API Key** | API key for the selected provider (not required for Ollama) |
| **Model** | Model name to use (leave blank for the provider default) |
| **Base URL** | Required for Ollama and OpenAI-compatible providers |

### Environment variable defaults

You can pre-seed settings via environment variables (useful for `docker run` or secrets management):

```env
ANTHROPIC_API_KEY=sk-ant-...
KUMA_URL=http://uptime-kuma:3001
KUMA_USERNAME=admin
KUMA_PASSWORD=secret
```

---

## Supported AI Providers

| Provider | Default Model | Notes |
|----------|--------------|-------|
| **Anthropic** | `claude-opus-4-6` | [Browse models](https://docs.anthropic.com/en/docs/about-claude/models) |
| **OpenAI** | `gpt-4o` | [Browse models](https://platform.openai.com/docs/models) |
| **Google Gemini** | `gemini-2.0-flash` | [Browse models](https://ai.google.dev/gemini-api/docs/models/gemini) |
| **Ollama** | `llama3.2` | Self-hosted. [Browse models](https://ollama.com/library) |
| **OpenAI-compatible** | _(your choice)_ | Kimi, Groq, Together AI, LM Studio, and more |

---

## How It Works

1. **Scan** — KumaGen lists all running containers from the Docker socket, showing image name, exposed ports, and whether monitors have already been added.
2. **Select** — choose which containers you want to generate monitors for.
3. **Generate** — container metadata is sent to your configured AI provider. The AI suggests monitors based on image name patterns, exposed ports, labels, and environment variable keys.
4. **Review** — every suggestion is shown with an editable name, URL/hostname/port, and (for database monitors) a connection string field. Deselect anything you don't want.
5. **Push** — confirmed monitors are created in Uptime Kuma via its Socket.IO API. KumaGen records which containers have been processed so you won't see duplicate suggestions next time.

---

## Supported Monitor Types

| Type | When suggested |
|------|---------------|
| **HTTP/HTTPS** | Web servers (nginx, apache, traefik, caddy) and app containers with HTTP ports |
| **TCP Port** | Any container with an exposed port, databases |
| **Ping** | Every container gets at least a ping check |
| **DNS** | Suggested for containers that appear to serve DNS |
| **PostgreSQL** | `postgres` / `postgresql` images |
| **MySQL / MariaDB** | `mysql` / `mariadb` images |
| **Redis** | `redis` images |
| **MongoDB** | `mongo` / `mongodb` images |

Database monitors require a connection string — KumaGen provides an editable template and prompts you to fill it in before adding.

---

## Development

```bash
git clone https://github.com/donaldrich80/KumaGen.git
cd KumaGen
npm run install:all   # install backend + frontend deps
npm run dev           # backend on :3003, Vite dev server on :5173
```

### Project structure

```
KumaGen/
├── server/
│   ├── index.js          # Express server
│   ├── ai.js             # Multi-provider AI integration (Vercel AI SDK)
│   ├── docker.js         # Docker container scanning
│   ├── kuma.js           # Uptime Kuma Socket.IO client
│   ├── db.js             # SQLite state & settings
│   └── routes/
│       ├── containers.js
│       ├── suggestions.js
│       ├── monitors.js
│       └── settings.js
└── client/
    └── src/
        ├── App.jsx
        └── components/
            ├── ContainerList.jsx
            ├── SuggestionReview.jsx
            └── Settings.jsx
```

---

## License

MIT
