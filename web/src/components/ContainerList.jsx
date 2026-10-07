import { useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, Container, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export function ContainerList({ selectedIds, onSelectionChange, onContainersLoaded, onNext }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchContainers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/containers');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const data = await res.json();
      setContainers(data);
      onContainersLoaded?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchContainers(); }, []);

  function toggleAll(checked) {
    if (checked) {
      onSelectionChange(containers.map(c => c.id));
    } else {
      onSelectionChange([]);
    }
  }

  function toggleOne(id, checked) {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter(i => i !== id));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Scanning Docker containers...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={fetchContainers}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  if (containers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Container className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No running containers found</p>
        <p className="text-sm mt-1">Start some Docker containers and refresh.</p>
        <Button variant="outline" className="mt-4" onClick={fetchContainers}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>
    );
  }

  const allSelected = selectedIds.length === containers.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="select-all"
            checked={allSelected}
            onCheckedChange={toggleAll}
            data-state={someSelected ? 'indeterminate' : undefined}
          />
          <Label htmlFor="select-all" className="text-sm cursor-pointer">
            Select all ({containers.length})
          </Label>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchContainers}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {containers.map(container => (
          <Card
            key={container.id}
            className={`transition-colors cursor-pointer hover:border-primary/50 ${
              selectedIds.includes(container.id) ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => toggleOne(container.id, !selectedIds.includes(container.id))}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedIds.includes(container.id)}
                  onCheckedChange={checked => toggleOne(container.id, checked)}
                  onClick={e => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{container.name}</span>
                    {container.monitored && (
                      <Badge variant="success" className="text-xs">
                        <Wifi className="h-3 w-3 mr-1" />
                        {container.existingMonitors.length} monitor{container.existingMonitors.length !== 1 ? 's' : ''} added
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{container.image}</p>
                  {container.ports.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {container.ports.map((p, i) => (
                        <Badge key={i} variant="outline" className="text-xs font-mono">
                          {p.hostPort ? `${p.hostPort}→` : ''}{p.containerPort}/{p.protocol}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Badge variant={container.state === 'running' ? 'success' : 'secondary'} className="shrink-0 text-xs">
                  {container.state}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onNext} disabled={selectedIds.length === 0}>
          Generate Suggestions ({selectedIds.length} selected)
        </Button>
      </div>
    </div>
  );
}
