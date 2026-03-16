import { useState, useEffect } from 'react';
import { Settings2, HelpCircle, Loader2, CheckCircle2, XCircle, RefreshCw, Bot, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { StepIndicator } from '@/components/StepIndicator';
import { ContainerList } from '@/components/ContainerList';
import { SuggestionReview } from '@/components/SuggestionReview';
import { Settings } from '@/components/Settings';
import { Help } from '@/components/Help';

export default function App() {
  const [step, setStep] = useState(1);
  const [selectedContainerIds, setSelectedContainerIds] = useState([]);
  const [containerNames, setContainerNames] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingMonitors, setLoadingMonitors] = useState(false);
  const [suggestionError, setSuggestionError] = useState(null);
  const [addResults, setAddResults] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState({ required: false, ready: true });

  function fetchAiStatus() {
    fetch('/api/settings/ai-status').then(r => r.json()).then(setAiStatus).catch(() => {});
  }

  useEffect(() => { fetchAiStatus(); }, []);
  // Refresh status whenever settings dialog closes
  useEffect(() => { if (!settingsOpen) fetchAiStatus(); }, [settingsOpen]);

  async function handleGenerateSuggestions() {
    setLoadingSuggestions(true);
    setSuggestionError(null);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerIds: selectedContainerIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuggestions(data.suggestions);
      setStep(2);
    } catch (err) {
      setSuggestionError(err.message);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function handleAddMonitors(monitors) {
    setLoadingMonitors(true);
    try {
      const res = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitors }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddResults(data);
      setStep(3);
    } catch (err) {
      setSuggestionError(err.message);
    } finally {
      setLoadingMonitors(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedContainerIds([]);
    setSuggestions({});
    setAddResults(null);
    setSuggestionError(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">KumaGen</h1>
            <span className="text-xs text-muted-foreground mt-0.5">Uptime Kuma monitor generator</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)}>
              <HelpCircle className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <StepIndicator currentStep={step} />

        {/* AI not configured warning */}
        {aiStatus.required && !aiStatus.ready && !loadingSuggestions && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              HTTP, DNS, or database monitors are enabled but no AI API key is configured.{' '}
              <button className="underline font-medium" onClick={() => setSettingsOpen(true)}>Open Settings</button>{' '}
              to add a key, or disable those monitor types to proceed without AI.
            </AlertDescription>
          </Alert>
        )}

        {/* Suggestion loading overlay */}
        {loadingSuggestions && (
          <Card>
            <CardContent className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div>
                <p className="font-semibold">
                  {aiStatus.required ? 'Analyzing containers with AI…' : 'Generating monitor suggestions…'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {aiStatus.required ? 'AI is generating HTTP/database monitor suggestions' : 'Building suggestions from container metadata'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error display */}
        {suggestionError && !loadingSuggestions && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{suggestionError}</AlertDescription>
          </Alert>
        )}

        {/* Step 1: Container selection */}
        {step === 1 && !loadingSuggestions && (
          <Card>
            <CardHeader>
              <CardTitle>Select Containers</CardTitle>
              <CardDescription>Choose which running containers to generate health checks for.</CardDescription>
            </CardHeader>
            <CardContent>
              <ContainerList
                selectedIds={selectedContainerIds}
                onSelectionChange={setSelectedContainerIds}
                onContainersLoaded={containers =>
                  setContainerNames(Object.fromEntries(containers.map(c => [c.id, c.name])))
                }
                onNext={handleGenerateSuggestions}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2: Review suggestions */}
        {step === 2 && !loadingSuggestions && (
          <Card>
            <CardHeader>
              <CardTitle>Review Suggestions</CardTitle>
              <CardDescription>
                {aiStatus.required
                  ? 'AI has suggested the following monitors. Select, edit, and confirm before adding to Uptime Kuma.'
                  : 'The following monitors were generated from your container metadata. Select, edit, and confirm before adding to Uptime Kuma.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SuggestionReview
                selectedContainerIds={selectedContainerIds}
                suggestions={suggestions}
                containerNames={containerNames}
                onBack={() => setStep(1)}
                onNext={handleAddMonitors}
                loading={loadingMonitors}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Results */}
        {step === 3 && addResults && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Done
              </CardTitle>
              <CardDescription>
                {addResults.summary.succeeded} monitor{addResults.summary.succeeded !== 1 ? 's' : ''} added
                {addResults.summary.failed > 0 && `, ${addResults.summary.failed} failed`}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {addResults.results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  {r.ok
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                  <span className={r.ok ? '' : 'text-muted-foreground'}>{r.name}</span>
                  {r.ok
                    ? <Badge variant="success" className="ml-auto">ID #{r.monitorID}</Badge>
                    : <span className="ml-auto text-xs text-destructive">{r.error}</span>}
                </div>
              ))}
              <div className="pt-4">
                <Button variant="outline" onClick={handleReset}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Scan Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <Settings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Help open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
