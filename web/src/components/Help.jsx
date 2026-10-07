import { useState, useEffect } from 'react';
import { HelpCircle, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

function getMonitorTypes(settings) {
  const { preferPublicUrl = false, useContainerNames = false } = settings || {};

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

  const dbExample = useContainerNames
    ? 'postgres://user:pass@my-postgres:5432/dbname'
    : 'postgres://user:pass@localhost:5432/dbname';

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
        'Resolves a hostname via DNS and verifies it returns a valid A record. Ensures your public domain names are properly configured and not pointing to the wrong IP.',
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
        'Connects using the native database protocol to verify the server is healthy and accepting queries. Supports PostgreSQL, MySQL/MariaDB, Redis, and MongoDB. More reliable than a TCP port check because it tests the application layer.',
      source: 'Automatically detected from the container image name (postgres, mysql, mariadb, redis, mongo) — no AI needed. Credentials are pre-filled from the container\'s environment variables when available. Requires a connection string — you will be prompted to confirm it before adding the monitor.',
      example: dbExample,
    },
  ];
}

const AI_PROVIDERS = [
  {
    name: 'Anthropic (Claude)',
    links: [{ label: 'Browse models', url: 'https://docs.anthropic.com/en/docs/about-claude/models' }],
  },
  {
    name: 'OpenAI',
    links: [{ label: 'Browse models', url: 'https://platform.openai.com/docs/models' }],
  },
  {
    name: 'Google Gemini',
    links: [{ label: 'Browse models', url: 'https://ai.google.dev/gemini-api/docs/models/gemini' }],
  },
  {
    name: 'Ollama (local)',
    links: [{ label: 'Browse models', url: 'https://ollama.com/library' }],
  },
  {
    name: 'OpenAI-compatible',
    links: [
      { label: 'Kimi (Moonshot)', url: 'https://platform.moonshot.cn/docs/api/chat' },
      { label: 'Groq', url: 'https://console.groq.com/docs/models' },
      { label: 'Together AI', url: 'https://docs.together.ai/docs/inference-models' },
      { label: 'LM Studio', url: 'https://lmstudio.ai/docs/api/endpoints/openai' },
    ],
  },
];

export function Help({ open, onOpenChange }) {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    if (!open) return;
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const toBool = (val, def) => val === undefined || val === null ? def : val !== 'false';
        setSettings({
          preferPublicUrl: toBool(data.preferPublicUrl, false),
          useContainerNames: toBool(data.useContainerNames, false),
        });
      })
      .catch(() => {});
  }, [open]);

  const monitorTypes = getMonitorTypes(settings);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" /> Help
          </DialogTitle>
          <DialogDescription>
            Monitor type reference and AI provider documentation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Monitor Types */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monitor Types</h3>
            <div className="space-y-5">
              {monitorTypes.map(({ label, badgeClass, description, source, example }) => (
                <div key={label} className="space-y-1.5">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                    {label}
                  </span>
                  <p className="text-sm">{description}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Suggested by: </span>
                    {typeof source === 'string' ? source : source}
                  </p>
                  <code className="block text-xs bg-muted rounded px-2 py-1 text-muted-foreground font-mono">
                    {example}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* AI Provider Docs */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              AI Provider Documentation
            </h3>
            <p className="text-xs text-muted-foreground">
              HTTP health endpoints, DNS, and database monitors are generated by AI. Use the links
              below to browse available models for your configured provider.
            </p>
            <div className="space-y-2.5">
              {AI_PROVIDERS.map(({ name, links }) => (
                <div key={name} className="flex items-start justify-between gap-4">
                  <span className="text-sm font-medium shrink-0">{name}</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end">
                    {links.map(link => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary flex items-center gap-1 hover:underline"
                      >
                        {link.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
