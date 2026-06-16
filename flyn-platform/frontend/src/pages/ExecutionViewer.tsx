/**
 * Execution Viewer Page
 * ---------------------
 * A universal execution results page that works for:
 *  1. Any flow published from the Visual Builder (?runId=xxx)
 *  2. The built-in AI Router demo (click "Run Demo")
 *
 * Shows: run status, node-by-node timeline with I/O, final context.
 */

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '@/lib/api';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Zap,
  BrainCircuit,
  GitBranch,
  Send,
  AlertTriangle,
  Sparkles,
  StopCircle,
  Timer,
  Shield,
  Database,
  Repeat,
  Split,
  Merge,
} from 'lucide-react';

import { VapiWebCaller } from '@/components/VapiWebCaller';

// ── Types ────────────────────────────────────────────────────────

interface NodeRun {
  nodeId: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string };
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface RunResult {
  workflowRunId: string;
  status: string;
  currentNodes: string[];
  executionHistory: NodeRun[];
  context: {
    variables: Record<string, unknown>;
    nodeOutputs: Record<string, unknown>;
  };
  ticketInput?: Record<string, unknown>;
  workflow?: { name: string; nodeCount: number; edgeCount: number; description?: string };
  message?: string;
}

// ── Dynamic node-type → icon / color (works for ANY flow) ───────

const TYPE_VISUALS: Record<string, { icon: React.ElementType; color: string }> = {
  trigger: { icon: Zap, color: '#22c55e' },
  action: { icon: Send, color: '#8b5cf6' },
  condition: { icon: GitBranch, color: '#f59e0b' },
  ai_router: { icon: BrainCircuit, color: '#a855f7' },
  wait: { icon: Timer, color: '#3b82f6' },
  approval: { icon: Shield, color: '#6366f1' },
  end: { icon: StopCircle, color: '#6b7280' },
  mongodb: { icon: Database, color: '#10b981' },
  loop: { icon: Repeat, color: '#f97316' },
  split: { icon: Split, color: '#06b6d4' },
  join: { icon: Merge, color: '#06b6d4' },
};

function guessNodeType(nodeId: string): string {
  const id = nodeId.toLowerCase();
  if (id.includes('trigger') || id.includes('start')) return 'trigger';
  if (id.includes('ai') || id.includes('classify') || id.includes('router')) return 'ai_router';
  if (id.includes('condition') || id.includes('decision') || id.includes('check')) return 'condition';
  if (id.includes('wait') || id.includes('delay')) return 'wait';
  if (id.includes('approval') || id.includes('approve')) return 'approval';
  if (id.includes('end') || id.includes('stop') || id.includes('terminate')) return 'end';
  if (id.includes('mongo') || id.includes('query') || id.includes('database')) return 'mongodb';
  if (id.includes('loop') || id.includes('iterate') || id.includes('for_each')) return 'loop';
  if (id.includes('split') || id.includes('fork') || id.includes('parallel')) return 'split';
  if (id.includes('join') || id.includes('merge')) return 'join';
  return 'action';
}

function getNodeVisual(nodeId: string) {
  const t = guessNodeType(nodeId);
  return TYPE_VISUALS[t] ?? TYPE_VISUALS.action;
}

function prettyNodeName(nodeId: string): string {
  return nodeId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Status badge ────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    completed: { bg: 'bg-green-500/15 border-green-500/30', text: 'text-green-400', icon: CheckCircle2 },
    running: { bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400', icon: Loader2 },
    waiting: { bg: 'bg-yellow-500/15 border-yellow-500/30', text: 'text-yellow-400', icon: Clock },
    failed: { bg: 'bg-red-500/15 border-red-500/30', text: 'text-red-400', icon: XCircle },
    pending: { bg: 'bg-zinc-500/15 border-zinc-500/30', text: 'text-zinc-400', icon: Clock },
  };
  const c = config[s] ?? config.running;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text}`}>
      <Icon className={`h-3 w-3 ${s === 'running' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

// ── JSON viewer ─────────────────────────────────────────────────

function JsonBlock({ data, label, defaultOpen }: { data: unknown; label: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  if (data === undefined || data === null) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 overflow-x-auto max-h-72 scrollbar-thin">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Single Node Run card ────────────────────────────────────────

function NodeRunCard({ run, index, animate }: { run: NodeRun; index: number; animate: boolean }) {
  const visual = getNodeVisual(run.nodeId);
  const Icon = visual.icon;
  const displayName = prettyNodeName(run.nodeId);
  const isAiNode = run.output && ('confidence' in run.output || 'classification' in run.output || 'intent' in run.output);

  const output = run.output;
  const outputObj = isRecord(output) ? output : undefined;
  const routing = outputObj && isRecord(outputObj.routing) ? outputObj.routing : undefined;
  const evaluationResults = outputObj ? outputObj.evaluationResults : undefined;

  return (
    <div className="relative pl-8 pb-8 last:pb-0 group" style={{ animation: animate ? `fadeSlideIn 0.4s ease-out ${index * 0.12}s both` : undefined }}>
      <div className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-800 group-last:hidden" />
      <div className="absolute left-[7px] top-1 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center" style={{ borderColor: visual.color, backgroundColor: `${visual.color}22` }}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: visual.color }} />
      </div>
      <div className="ml-4 rounded-xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-sm p-4 hover:border-zinc-700 transition-all">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${visual.color}22` }}>
              <Icon className="h-4 w-4" style={{ color: visual.color }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">{displayName}</p>
              <p className="text-[10px] font-mono text-zinc-500">{run.nodeId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {run.durationMs != null && <span className="text-[10px] text-zinc-500 font-mono">{run.durationMs}ms</span>}
            <StatusBadge status={run.status} />
          </div>
        </div>

        {run.error && (
          <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <span className="font-semibold">{run.error.code}:</span> {run.error.message}
          </div>
        )}

        {isAiNode && run.output && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: 'Intent', value: (outputObj?.classification ?? outputObj?.intent ?? '—'), color: '#a855f7' },
              { label: 'Confidence', value: `${((Number(outputObj?.confidence ?? 0)) * 100).toFixed(1)}%`, color: '#22d3ee' },
              { label: 'Route', value: (routing?.path ?? '—'), color: '#f59e0b' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg p-2 text-center" style={{ backgroundColor: `${item.color}11`, border: `1px solid ${item.color}33` }}>
                <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: `${item.color}99` }}>{item.label}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: item.color }}>{String(item.value)}</p>
              </div>
            ))}
          </div>
        )}

        {Array.isArray(evaluationResults) && (
          <div className="mt-3 space-y-1">
            {evaluationResults.map((ev, i) => {
              const evObj = isRecord(ev) ? ev : {};
              const result = Boolean(evObj.result);
              const reason = typeof evObj.reason === 'string' ? evObj.reason : undefined;
              const condition = typeof evObj.condition === 'string' ? evObj.condition : undefined;
              return (
                <div key={i} className={`text-xs px-2 py-1 rounded-md ${result ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {result ? '✅' : '❌'} {reason || condition || 'condition evaluated'}
                </div>
              );
            })}
          </div>
        )}

        <JsonBlock data={run.input} label="Input" />
        <JsonBlock data={run.output} label="Output" />
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function ExecutionViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animateNodes, setAnimateNodes] = useState(false);

  const [ticketText, setTicketText] = useState('I have been charged twice for my subscription this month. Please refund the duplicate charge immediately.');
  const [customerName, setCustomerName] = useState('Sarah Johnson');

  const runIdParam = searchParams.get('runId');
  const isFromBuilder = !!runIdParam;

  useEffect(() => {
    if (runIdParam) loadRun(runIdParam);
  }, [runIdParam]);

  const loadRun = async (runId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [runRes, histRes] = await Promise.all([
        fetch(`${API_BASE_URL}/orchestrator/run/${runId}`).then((r) => r.json()),
        fetch(`${API_BASE_URL}/orchestrator/run/${runId}/history`).then((r) => r.json()),
      ]);
      // Distinguish API-level errors (run not found) from execution-level errors (run failed)
      // API error: { error: "Workflow run not found" } — no status field
      // Execution error: { id, status: "FAILED", error: { nodeId, message, code } } — has status field
      if (runRes.error && !runRes.status) {
        throw new Error(typeof runRes.error === 'string' ? runRes.error : JSON.stringify(runRes.error));
      }
      setResult({
        workflowRunId: runRes.id,
        status: runRes.status,
        currentNodes: runRes.currentNodes ?? [],
        executionHistory: histRes.nodeRuns ?? [],
        context: runRes.context ?? { variables: {}, nodeOutputs: {} },
      });
      setAnimateNodes(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(msg || 'Failed to load run');
    } finally {
      setLoading(false);
    }
  };

  const runDemo = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setAnimateNodes(false);
    try {
      const res = await fetch(`${API_BASE_URL}/orchestrator/demo-ai-router`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { ticket_text: ticketText, customer_name: customerName } }),
      });
      if (!res.ok) { const eb = await res.json().catch(() => ({})); throw new Error(eb.message ?? `HTTP ${res.status}`); }
      const data = await res.json();
      setResult({
        workflowRunId: data.workflowRunId, status: data.status, currentNodes: data.currentNodes ?? [],
        executionHistory: data.executionHistory ?? [], context: data.context ?? { variables: {}, nodeOutputs: {} },
        ticketInput: data.ticketInput, workflow: data.workflow, message: data.message,
      });
      setTimeout(() => setAnimateNodes(true), 50);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [ticketText, customerName]);

  const totalDuration = result?.executionHistory.reduce((s, n) => s + (n.durationMs ?? 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <style>{`@keyframes fadeSlideIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }`}</style>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/automations')} className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 transition" title="Back to Builder">
              <ArrowLeft className="h-5 w-5 text-zinc-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold">{result?.workflow?.name || 'Workflow Execution Viewer'}</h1>
              <p className="text-xs text-zinc-500">{isFromBuilder ? 'Published from Visual Builder' : 'FLYN Orchestrator — Live Execution'}</p>
            </div>
          </div>
          {result && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-500">Run: {result.workflowRunId.slice(0, 8)}…</span>
              <StatusBadge status={result.status} />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Demo Input Panel — only when NOT from builder */}
        {!isFromBuilder && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-purple-400" />
              <h2 className="text-base font-semibold">AI Router Demo — Test Ticket</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Ticket Message</label>
                <textarea value={ticketText} onChange={(e) => setTicketText(e.target.value)} rows={3} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none" placeholder="Describe the support issue…" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Customer Name</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                <p className="text-[10px] text-zinc-600 mt-2">Try: billing, technical, complaint, cancellation</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={runDemo} disabled={loading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-sm font-semibold text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-purple-500/20">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {loading ? 'Running…' : 'Run AI Router Demo'}
              </button>
              {result && (
                <button onClick={() => { setResult(null); setError(null); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>
            {error && <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400"><XCircle className="h-4 w-4 inline mr-1.5" />{error}</div>}
          </div>
        )}

        {isFromBuilder && error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400"><XCircle className="h-4 w-4 inline mr-1.5" />{error}</div>
        )}

        {loading && (
          <div className="text-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">Executing workflow…</p>
          </div>
        )}

        {result && !loading && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Summary sidebar */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sticky top-24">
                <h3 className="text-sm font-semibold mb-3 text-zinc-300">Run Summary</h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between"><span className="text-zinc-500">Status</span><StatusBadge status={result.status} /></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Run ID</span><span className="font-mono text-zinc-400">{result.workflowRunId.slice(0, 12)}…</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Nodes Executed</span><span className="text-zinc-300 font-semibold">{result.executionHistory.length}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Total Time</span><span className="text-zinc-300 font-semibold">{totalDuration}ms</span></div>
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-800 space-y-1.5">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium mb-2">Executed Nodes</p>
                  {result.executionHistory.map((run) => {
                    const v = getNodeVisual(run.nodeId);
                    const NIcon = v.icon;
                    const s = run.status.toLowerCase();
                    return (
                      <div key={run.nodeId} className="flex items-center gap-2 text-xs">
                        <NIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: v.color }} />
                        <span className="text-zinc-300 truncate flex-1">{prettyNodeName(run.nodeId)}</span>
                        {s === 'completed' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                        {s === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                        {s === 'waiting' && <Clock className="h-3 w-3 text-yellow-500" />}
                      </div>
                    );
                  })}
                </div>

                <button onClick={() => navigate('/automations')} className="mt-5 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Builder
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div className="lg:col-span-2">
              <h3 className="text-sm font-semibold mb-4 text-zinc-300">
                Execution Timeline <span className="ml-2 text-xs font-normal text-zinc-500">({result.executionHistory.length} nodes)</span>
              </h3>
              <div className="space-y-0">
                {result.executionHistory.map((run, i) => (
                  <NodeRunCard key={run.nodeId} run={run} index={i} animate={animateNodes} />
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <h4 className="text-sm font-semibold text-zinc-300 mb-3">Final Workflow Context</h4>
                <JsonBlock data={result.context?.nodeOutputs} label="All Node Outputs" defaultOpen={result.executionHistory.length <= 4} />
                <JsonBlock data={result.context?.variables} label="Variables" />
                {result.ticketInput && <JsonBlock data={result.ticketInput} label="Trigger Data" />}
              </div>

              {/* Web Calling Hub */}
              {result.context?.nodeOutputs && (
                <VapiWebCaller nodeOutputs={result.context.nodeOutputs} />
              )}
            </div>
          </div>
        )}

        {!result && !loading && !isFromBuilder && (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
              <BrainCircuit className="h-10 w-10 text-zinc-700" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-400 mb-2">No execution yet</h3>
            <p className="text-sm text-zinc-600 max-w-md mx-auto">
              Click <strong>"Run AI Router Demo"</strong> above, or build a flow in the{' '}
              <button onClick={() => navigate('/automations')} className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Visual Builder</button>{' '}
              and hit Publish to see real execution results here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
