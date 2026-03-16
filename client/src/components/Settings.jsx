import { useState, useEffect } from 'react';
import { Settings2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const PROVIDERS = [
  {
    value: 'anthropic',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    defaultModel: 'claude-opus-4-6',
    needsBaseUrl: false,
    links: [{ label: 'Browse models', url: 'https://docs.anthropic.com/en/docs/about-claude/models' }],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
    defaultModel: 'gpt-4o',
    needsBaseUrl: false,
    links: [{ label: 'Browse models', url: 'https://platform.openai.com/docs/models' }],
  },
  {
    value: 'google',
    label: 'Google Gemini',
    placeholder: 'AIza...',
    defaultModel: 'gemini-2.0-flash',
    needsBaseUrl: false,
    links: [{ label: 'Browse models', url: 'https://ai.google.dev/gemini-api/docs/models/gemini' }],
  },
  {
    value: 'ollama',
    label: 'Ollama (local)',
    placeholder: '(no key needed)',
    defaultModel: 'llama3.2',
    needsBaseUrl: true,
    baseUrlLabel: 'Ollama URL',
    baseUrlPlaceholder: 'http://localhost:11434',
    links: [{ label: 'Browse models', url: 'https://ollama.com/library' }],
  },
  {
    value: 'openai-compatible',
    label: 'OpenAI-compatible',
    placeholder: 'API key',
    defaultModel: '',
    needsBaseUrl: true,
    baseUrlLabel: 'Base URL',
    baseUrlPlaceholder: 'https://api.moonshot.cn/v1',
    links: [
      { label: 'Kimi (Moonshot)', url: 'https://platform.moonshot.cn/docs/api/chat' },
      { label: 'Groq', url: 'https://console.groq.com/docs/models' },
      { label: 'Together AI', url: 'https://docs.together.ai/docs/inference-models' },
      { label: 'LM Studio', url: 'https://lmstudio.ai/docs/api/endpoints/openai' },
    ],
  },
];

export function Settings({ open, onOpenChange }) {
  const [form, setForm] = useState({
    kumaUrl: '',
    kumaUsername: '',
    kumaPassword: '',
    aiProvider: 'anthropic',
    aiApiKey: '',
    aiModel: '',
    aiBaseUrl: '',
    suggestHttp: true,
    suggestPort: true,
    suggestPing: true,
    suggestDns: false,
    suggestDocker: true,
    suggestDatabase: true,
    useContainerNames: false,
    useTraefikLabels: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveResult, setSaveResult] = useState(null);

  const providerMeta = PROVIDERS.find(p => p.value === form.aiProvider) || PROVIDERS[0];

  useEffect(() => {
    if (!open) return;
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const toBool = (val, def) => val === undefined || val === null ? def : val !== 'false';
        setForm({
          kumaUrl: data.kumaUrl || '',
          kumaUsername: data.kumaUsername || '',
          kumaPassword: data.kumaPassword || '',
          aiProvider: data.aiProvider || 'anthropic',
          // Migrate legacy anthropicApiKey if new key not set
          aiApiKey: data.aiApiKey || (data.aiProvider === 'anthropic' || !data.aiProvider ? (data.anthropicApiKey || '') : '') || '',
          aiModel: data.aiModel || '',
          aiBaseUrl: data.aiBaseUrl || '',
          suggestHttp:      toBool(data.suggestHttp, true),
          suggestPort:      toBool(data.suggestPort, true),
          suggestPing:      toBool(data.suggestPing, true),
          suggestDns:       toBool(data.suggestDns, false),
          suggestDocker:    toBool(data.suggestDocker, true),
          suggestDatabase:  toBool(data.suggestDatabase, true),
          useContainerNames: toBool(data.useContainerNames, false),
          useTraefikLabels:  toBool(data.useTraefikLabels, true),
        });
      });
  }, [open]);

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);
    try {
      // Serialize booleans to strings for SQLite key-value store
      const payload = { ...form };
      for (const key of ['suggestHttp', 'suggestPort', 'suggestPing', 'suggestDns', 'suggestDocker', 'suggestDatabase', 'useContainerNames', 'useTraefikLabels']) {
        payload[key] = String(payload[key]);
      }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSaveResult({ ok: data.ok, message: data.ok ? 'Settings saved.' : 'Failed to save.' });
    } catch {
      setSaveResult({ ok: false, message: 'Network error.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test-connection', { method: 'POST' });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.ok ? data.message : data.error });
    } catch {
      setTestResult({ ok: false, message: 'Network error.' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Settings
          </DialogTitle>
          <DialogDescription>Configure your Uptime Kuma connection and AI provider.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Uptime Kuma section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uptime Kuma</h3>
            <div className="space-y-1.5">
              <Label htmlFor="kumaUrl">URL</Label>
              <Input
                id="kumaUrl"
                placeholder="http://localhost:3001"
                value={form.kumaUrl}
                onChange={e => setForm(f => ({ ...f, kumaUrl: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kumaUsername">Username</Label>
                <Input
                  id="kumaUsername"
                  placeholder="admin"
                  value={form.kumaUsername}
                  onChange={e => setForm(f => ({ ...f, kumaUsername: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kumaPassword">Password</Label>
                <Input
                  id="kumaPassword"
                  type="password"
                  placeholder="••••••••"
                  value={form.kumaPassword}
                  onChange={e => setForm(f => ({ ...f, kumaPassword: e.target.value }))}
                />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Test Connection
            </Button>
            {testResult && (
              <p className={`text-sm flex items-center gap-1.5 ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>
                {testResult.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.message}
              </p>
            )}
          </div>

          {/* AI provider section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Provider</h3>

            <div className="space-y-1.5">
              <Label htmlFor="aiProvider">Provider</Label>
              <select
                id="aiProvider"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.aiProvider}
                onChange={e => setForm(f => ({ ...f, aiProvider: e.target.value, aiModel: '', aiBaseUrl: '' }))}
              >
                {PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {providerMeta.value !== 'ollama' && (
              <div className="space-y-1.5">
                <Label htmlFor="aiApiKey">API Key</Label>
                <Input
                  id="aiApiKey"
                  type="password"
                  placeholder={providerMeta.placeholder}
                  value={form.aiApiKey}
                  onChange={e => setForm(f => ({ ...f, aiApiKey: e.target.value }))}
                />
              </div>
            )}

            {providerMeta.needsBaseUrl && (
              <div className="space-y-1.5">
                <Label htmlFor="aiBaseUrl">{providerMeta.baseUrlLabel}</Label>
                <Input
                  id="aiBaseUrl"
                  placeholder={providerMeta.baseUrlPlaceholder}
                  value={form.aiBaseUrl}
                  onChange={e => setForm(f => ({ ...f, aiBaseUrl: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="aiModel">Model</Label>
              <Input
                id="aiModel"
                placeholder={providerMeta.defaultModel || 'model name'}
                value={form.aiModel}
                onChange={e => setForm(f => ({ ...f, aiModel: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default{providerMeta.defaultModel ? ` (${providerMeta.defaultModel})` : ''}. See Help for model links.
              </p>
            </div>
          </div>

          {/* Monitor Suggestions section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monitor Suggestions</h3>
            <p className="text-xs text-muted-foreground">Choose which types of monitors the AI should suggest.</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'suggestHttp',     label: 'HTTP / HTTPS' },
                { key: 'suggestPort',     label: 'TCP Port' },
                { key: 'suggestPing',     label: 'Ping' },
                { key: 'suggestDns',      label: 'DNS' },
                { key: 'suggestDocker',   label: 'Docker Container' },
                { key: 'suggestDatabase', label: 'Database' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={!!form[key]}
                    onCheckedChange={val => setForm(f => ({ ...f, [key]: !!val }))}
                  />
                  <Label htmlFor={key} className="text-sm font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
            <div className="pt-1 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="useContainerNames"
                    checked={!!form.useContainerNames}
                    onCheckedChange={val => setForm(f => ({ ...f, useContainerNames: !!val }))}
                  />
                  <Label htmlFor="useContainerNames" className="text-sm font-normal cursor-pointer">
                    Use container names instead of localhost
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Enable when Uptime Kuma runs in the same Docker network (e.g. <code className="font-mono">test-nginx:80</code> instead of <code className="font-mono">localhost:8080</code>).
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="useTraefikLabels"
                    checked={!!form.useTraefikLabels}
                    onCheckedChange={val => setForm(f => ({ ...f, useTraefikLabels: !!val }))}
                  />
                  <Label htmlFor="useTraefikLabels" className="text-sm font-normal cursor-pointer">
                    Read Traefik labels for hostname discovery
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Extracts public hostnames from <code className="font-mono">traefik.http.routers.*.rule</code> labels to suggest DNS checks and use real URLs in HTTP monitors.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {saveResult && (
              <p className={`text-sm ${saveResult.ok ? 'text-green-600' : 'text-destructive'}`}>{saveResult.message}</p>
            )}
            <Button onClick={handleSave} disabled={saving} className="ml-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
