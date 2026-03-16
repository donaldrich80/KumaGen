import { useState } from 'react';
import { ChevronDown, ChevronUp, Database, Globe, Network, Radio, Search, Loader2, Container } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const TYPE_META = {
  http:     { label: 'HTTP',       icon: Globe,     color: 'info',      cardClass: 'border-blue-800/50    bg-blue-950/40'    },
  port:     { label: 'TCP Port',   icon: Network,   color: 'secondary', cardClass: 'border-emerald-800/50  bg-emerald-950/40' },
  ping:     { label: 'Ping',       icon: Radio,     color: 'secondary', cardClass: 'border-violet-800/50   bg-violet-950/40'  },
  dns:      { label: 'DNS',        icon: Search,    color: 'secondary', cardClass: 'border-indigo-800/50   bg-indigo-950/40'  },
  docker:   { label: 'Container',  icon: Container, color: 'secondary', cardClass: 'border-cyan-800/50     bg-cyan-950/40'    },
  postgres: { label: 'PostgreSQL', icon: Database,  color: 'warning',   cardClass: 'border-amber-800/50    bg-amber-950/40'   },
  mysql:    { label: 'MySQL',      icon: Database,  color: 'warning',   cardClass: 'border-yellow-800/50   bg-yellow-950/40'  },
  redis:    { label: 'Redis',      icon: Database,  color: 'warning',   cardClass: 'border-orange-800/50   bg-orange-950/40'  },
  mongodb:  { label: 'MongoDB',    icon: Database,  color: 'warning',   cardClass: 'border-rose-800/50     bg-rose-950/40'    },
};

const DEFAULT_META = { label: '', icon: Radio, color: 'secondary', cardClass: 'border-slate-700/50 bg-slate-900/40' };

function MonitorCard({ suggestion, selected, onToggle, editedFields, onFieldChange, connectionString, onConnectionStringChange }) {
  const [expanded, setExpanded] = useState(suggestion.requiresConnectionString);
  const meta = TYPE_META[suggestion.type] || DEFAULT_META;
  const Icon = meta.icon;

  return (
    <div className={`rounded-lg border p-3 transition-colors ${meta.cardClass} ${selected ? 'ring-2 ring-primary/40 ring-inset' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm">{editedFields.name ?? suggestion.name}</span>
            <Badge variant={meta.color}>{meta.label}</Badge>
            {suggestion.requiresConnectionString && (
              <Badge variant="warning">Needs connection string</Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">{suggestion.description}</p>

          {selected && (
            <div className="space-y-2 pt-1">
              {suggestion.type === 'http' && (
                <div className="space-y-1">
                  <Label className="text-xs">URL</Label>
                  <Input
                    className="h-7 text-xs font-mono"
                    value={editedFields.url ?? suggestion.url ?? ''}
                    onChange={e => onFieldChange('url', e.target.value)}
                  />
                </div>
              )}
              {(suggestion.type === 'port' || suggestion.type === 'ping' || suggestion.type === 'dns') && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Hostname</Label>
                    <Input
                      className="h-7 text-xs font-mono"
                      value={editedFields.hostname ?? suggestion.hostname ?? ''}
                      onChange={e => onFieldChange('hostname', e.target.value)}
                    />
                  </div>
                  {suggestion.type === 'port' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Port</Label>
                      <Input
                        className="h-7 text-xs font-mono"
                        type="number"
                        value={editedFields.port ?? suggestion.port ?? ''}
                        onChange={e => onFieldChange('port', parseInt(e.target.value, 10))}
                      />
                    </div>
                  )}
                </div>
              )}
              {suggestion.type === 'dns' && (
                <div className="space-y-1">
                  <Label className="text-xs">DNS Server</Label>
                  <Input
                    className="h-7 text-xs font-mono"
                    value={editedFields.dns_resolve_server ?? suggestion.dns_resolve_server ?? '1.1.1.1'}
                    onChange={e => onFieldChange('dns_resolve_server', e.target.value)}
                  />
                </div>
              )}
              {suggestion.type === 'docker' && (
                <div className="space-y-1">
                  <Label className="text-xs">Container Name</Label>
                  <Input
                    className="h-7 text-xs font-mono"
                    value={editedFields.dockerContainer ?? suggestion.dockerContainer ?? ''}
                    onChange={e => onFieldChange('dockerContainer', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Requires a Docker Host configured in Uptime Kuma</p>
                </div>
              )}
              {suggestion.requiresConnectionString && (
                <div className="space-y-1">
                  <Label className="text-xs">Connection String</Label>
                  <Input
                    className="h-7 text-xs font-mono"
                    placeholder={suggestion.databaseConnectionString || 'postgres://user:pass@host:5432/db'}
                    value={connectionString}
                    onChange={e => onConnectionStringChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to skip this monitor</p>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Monitor Name</Label>
                <Input
                  className="h-7 text-xs"
                  value={editedFields.name ?? suggestion.name}
                  onChange={e => onFieldChange('name', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContainerSection({ cid, suggs, containerName, selectedMonitors, onToggle, editedFields, onFieldChange, connectionStrings, onConnectionStringChange }) {
  const [open, setOpen] = useState(false);
  const selectedCount = suggs.filter((_, i) => selectedMonitors[`${cid}_${i}`]).length;

  // Collect the distinct type labels for the summary chips shown when collapsed
  const typeLabels = [...new Set(suggs.map(s => (TYPE_META[s.type] || DEFAULT_META).label))];

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Collapsible header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="hidden sm:inline-flex font-mono bg-muted px-1.5 py-0.5 rounded text-xs shrink-0">{cid.slice(0, 12)}</span>
        <span className="hidden sm:inline text-muted-foreground text-xs shrink-0">→</span>
        <span className="font-semibold text-sm truncate">{containerName}</span>

        {/* Type summary chips — hidden when open */}
        {!open && (
          <span className="flex items-center gap-1 ml-1 flex-wrap">
            {typeLabels.map(label => (
              <span key={label} className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 leading-none">{label}</span>
            ))}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2 shrink-0">
          <Badge variant={selectedCount === suggs.length ? 'secondary' : 'outline'} className="text-xs">
            {selectedCount}/{suggs.length} selected
          </Badge>
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </span>
      </button>

      {/* Monitor list */}
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
          {suggs.map((sugg, i) => {
            const key = `${cid}_${i}`;
            return (
              <MonitorCard
                key={key}
                suggestion={sugg}
                selected={!!selectedMonitors[key]}
                onToggle={() => onToggle(key)}
                editedFields={editedFields[key] || {}}
                onFieldChange={(field, val) => onFieldChange(key, field, val)}
                connectionString={connectionStrings[key] || ''}
                onConnectionStringChange={val => onConnectionStringChange(key, val)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SuggestionReview({ selectedContainerIds, suggestions, containerNames = {}, onBack, onNext, loading }) {
  const [selectedMonitors, setSelectedMonitors] = useState(() => {
    const init = {};
    for (const [cid, suggs] of Object.entries(suggestions)) {
      suggs.forEach((_, i) => { init[`${cid}_${i}`] = true; });
    }
    return init;
  });

  const [editedFields, setEditedFields] = useState({});
  const [connectionStrings, setConnectionStrings] = useState({});

  function toggleMonitor(key) {
    setSelectedMonitors(s => ({ ...s, [key]: !s[key] }));
  }

  function setField(key, field, value) {
    setEditedFields(s => ({ ...s, [key]: { ...(s[key] || {}), [field]: value } }));
  }

  function buildMonitorPayload() {
    const monitors = [];
    for (const [cid, suggs] of Object.entries(suggestions)) {
      for (let i = 0; i < suggs.length; i++) {
        const key = `${cid}_${i}`;
        if (!selectedMonitors[key]) continue;
        const sugg = suggs[i];
        const edits = editedFields[key] || {};
        const connStr = connectionStrings[key] || '';
        if (sugg.requiresConnectionString && !connStr) continue;
        const { description, requiresConnectionString, ...kumaFields } = sugg;
        const merged = { ...kumaFields, ...edits };
        if (sugg.requiresConnectionString) merged.databaseConnectionString = connStr;
        monitors.push({ containerId: cid, containerName: containerNames[cid] || cid, ...merged });
      }
    }
    return monitors;
  }

  const containerEntries = Object.entries(suggestions);
  const totalSelected = Object.values(selectedMonitors).filter(Boolean).length;

  return (
    <div className="space-y-3">
      {containerEntries.map(([cid, suggs]) => (
        <ContainerSection
          key={cid}
          cid={cid}
          suggs={suggs}
          containerName={containerNames[cid] || suggs[0]?.name?.split(' - ')[0] || cid}
          selectedMonitors={selectedMonitors}
          onToggle={toggleMonitor}
          editedFields={editedFields}
          onFieldChange={setField}
          connectionStrings={connectionStrings}
          onConnectionStringChange={(key, val) => setConnectionStrings(s => ({ ...s, [key]: val }))}
        />
      ))}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={() => onNext(buildMonitorPayload())} disabled={totalSelected === 0 || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Add {totalSelected} Monitor{totalSelected !== 1 ? 's' : ''} to Uptime Kuma
        </Button>
      </div>
    </div>
  );
}
