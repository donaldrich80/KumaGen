import { useState } from 'react';
import { ChevronDown, ChevronUp, Database, Globe, Network, Radio, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TYPE_META = {
  http:     { label: 'HTTP',     icon: Globe,    color: 'info' },
  port:     { label: 'TCP Port', icon: Network,  color: 'secondary' },
  ping:     { label: 'Ping',     icon: Radio,    color: 'secondary' },
  dns:      { label: 'DNS',      icon: Search,   color: 'secondary' },
  postgres: { label: 'PostgreSQL', icon: Database, color: 'warning' },
  mysql:    { label: 'MySQL',    icon: Database, color: 'warning' },
  redis:    { label: 'Redis',    icon: Database, color: 'warning' },
  mongodb:  { label: 'MongoDB',  icon: Database, color: 'warning' },
};

function MonitorCard({ suggestion, index, selected, onToggle, editedFields, onFieldChange, connectionString, onConnectionStringChange }) {
  const [expanded, setExpanded] = useState(suggestion.requiresConnectionString);
  const meta = TYPE_META[suggestion.type] || { label: suggestion.type, icon: Radio, color: 'secondary' };
  const Icon = meta.icon;

  const urlField = suggestion.url || suggestion.hostname;

  return (
    <div className={`rounded-lg border p-3 transition-colors ${selected ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
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
              {/* Editable primary field */}
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

              {/* Connection string for DB monitors */}
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

              {/* Monitor name override */}
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

export function SuggestionReview({ selectedContainerIds, suggestions, containerNames = {}, onBack, onNext, loading }) {
  // selectedMonitors: { [containerId_index]: boolean }
  const [selectedMonitors, setSelectedMonitors] = useState(() => {
    const init = {};
    for (const [cid, suggs] of Object.entries(suggestions)) {
      suggs.forEach((_, i) => { init[`${cid}_${i}`] = true; });
    }
    return init;
  });

  // editedFields: { [containerId_index]: { fieldName: value } }
  const [editedFields, setEditedFields] = useState({});

  // connectionStrings: { [containerId_index]: string }
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

        // Skip DB monitors without a connection string
        if (sugg.requiresConnectionString && !connStr) continue;

        const { description, requiresConnectionString, ...kumaFields } = sugg;
        const merged = { ...kumaFields, ...edits };

        if (sugg.requiresConnectionString) {
          merged.databaseConnectionString = connStr;
        }

        monitors.push({
          containerId: cid,
          containerName: containerNames[cid] || cid,
          ...merged,
        });
      }
    }
    return monitors;
  }

  const containerEntries = Object.entries(suggestions);
  const totalSelected = Object.values(selectedMonitors).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {containerEntries.map(([cid, suggs]) => (
        <div key={cid} className="space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{cid.slice(0, 12)}</span>
            <span className="text-muted-foreground">→</span>
            <span>{containerNames[cid] || suggs[0]?.name?.split(' - ')[0] || cid}</span>
            <Badge variant="secondary" className="ml-auto">{suggs.length} suggestion{suggs.length !== 1 ? 's' : ''}</Badge>
          </h3>
          <div className="space-y-2 pl-2">
            {suggs.map((sugg, i) => {
              const key = `${cid}_${i}`;
              return (
                <MonitorCard
                  key={key}
                  suggestion={sugg}
                  index={i}
                  selected={!!selectedMonitors[key]}
                  onToggle={() => toggleMonitor(key)}
                  editedFields={editedFields[key] || {}}
                  onFieldChange={(field, val) => setField(key, field, val)}
                  connectionString={connectionStrings[key] || ''}
                  onConnectionStringChange={val => setConnectionStrings(s => ({ ...s, [key]: val }))}
                />
              );
            })}
          </div>
        </div>
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
