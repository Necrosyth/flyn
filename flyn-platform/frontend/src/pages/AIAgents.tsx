/**
 * AI Agents Page — Production Rewrite
 * ------------------------------------
 * Displays agents from backend (via useAgentStore).
 * Supports: create, edit, delete, Vapi voice call.
 * Shares state with the Workflow Builder voice_agent node selector.
 */

import { motion, AnimatePresence } from "framer-motion";
import { withPlanGate } from "@/components/PlanGate";
import {
  Bot,
  Plus,
  MessageSquare,
  Phone,
  Mail,
  Sparkles,
  Mic,
  PhoneOff,
  Loader2,
  Radio,
  Pencil,
  Trash2,
  Search,
  X,
  Workflow,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Vapi from "@vapi-ai/web";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWebRTCCall } from "@/hooks/useWebRTCCall";
import { useAgentStore } from "@/hooks/useAgentStore";
import AgentBuilder from "@/components/agents/AgentBuilder";
import type { Agent, CreateAgentPayload } from "@/services/agents";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Safely extract a plain-string error message from any thrown value.
 * Handles: Error instances, {message} objects, {error: {message}} nesting,
 * arrays (Vapi validation), and raw strings.
 */
function extractErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;

    // Direct .message (could be string or array)
    if (obj.message) {
      if (typeof obj.message === "string") return obj.message;
      if (Array.isArray(obj.message)) return obj.message.join(", ");
      return String(obj.message);
    }

    // Nested .error.message (Vapi SDK wraps errors)
    if (obj.error && typeof obj.error === "object") {
      const inner = obj.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
      if (Array.isArray(inner.message)) return inner.message.join(", ");
    }

    // Plain .error string
    if (typeof obj.error === "string") return obj.error;

    // Last resort
    return JSON.stringify(err);
  }
  return String(err);
}

// ============================================================================
// Built-in (seed) agents — removed as per user request
// ============================================================================

const SEED_AGENTS: Agent[] = [];

// ============================================================================
// Pre-built workflow templates for each seed agent
// ============================================================================

const AGENT_TEMPLATES: Record<string, { nodes: object[]; edges: object[] }> = {
  "seed-morgan": {
    nodes: [
      { id: "n1", type: "inbox_trigger", name: "Incoming Lead", position: { x: 100, y: 200 }, config: { channel: "whatsapp" } },
      { id: "n2", type: "morgan_leads", name: "Qualify Lead (Morgan)", position: { x: 380, y: 200 }, config: { customer_number: "", phone_number_id: "" } },
      { id: "n3", type: "crm", name: "Update CRM Record", position: { x: 660, y: 200 }, config: {} },
      { id: "n4", type: "send_reply", name: "Send Follow-up", position: { x: 940, y: 200 }, config: { message: "Thanks for connecting! Our team will follow up shortly." } },
      { id: "n5", type: "end", name: "End", position: { x: 1220, y: 200 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  "seed-feedback": {
    nodes: [
      { id: "n1", type: "inbox_trigger", name: "Start Feedback Flow", position: { x: 100, y: 200 }, config: { channel: "whatsapp" } },
      { id: "n2", type: "flyn_feedback", name: "Collect Feedback", position: { x: 380, y: 200 }, config: { customer_number: "", phone_number_id: "" } },
      { id: "n3", type: "crm", name: "Record Feedback Score", position: { x: 660, y: 200 }, config: {} },
      { id: "n4", type: "send_reply", name: "Send Thank You", position: { x: 940, y: 200 }, config: { message: "Thank you for your feedback! We really appreciate it." } },
      { id: "n5", type: "end", name: "End", position: { x: 1220, y: 200 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  "seed-hr": {
    nodes: [
      { id: "n1", type: "inbox_trigger", name: "HR Request", position: { x: 100, y: 200 }, config: { channel: "whatsapp" } },
      { id: "n2", type: "ai_decision", name: "Classify Request", position: { x: 380, y: 200 }, config: { question: "Does this request require a voice call?" } },
      { id: "n3", type: "hr_voice_agent", name: "Call Employee (HR)", position: { x: 660, y: 80 }, config: { customer_number: "", phone_number_id: "" } },
      { id: "n4", type: "send_reply", name: "Send HR Info", position: { x: 660, y: 320 }, config: { message: "Here is the information you requested from HR." } },
      { id: "n5", type: "end", name: "End", position: { x: 940, y: 200 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", label: "Yes — Voice" },
      { id: "e3", source: "n2", target: "n4", label: "No — Text" },
      { id: "e4", source: "n3", target: "n5" },
      { id: "e5", source: "n4", target: "n5" },
    ],
  },
};

const BLANK_TEMPLATE = {
  nodes: [
    { id: "n1", type: "inbox_trigger", name: "Trigger", position: { x: 100, y: 200 }, config: {} },
    { id: "n2", type: "end", name: "End", position: { x: 400, y: 200 }, config: {} },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
};

// ============================================================================
// COMPONENT
// ============================================================================

const AIAgents = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { agents: storeAgents, loading, error, fetchAgents, createAgent, updateAgent, deleteAgent } = useAgentStore();

  // Merge seed + backend agents (deduplicate by id)
  const agents = useMemo(() => {
    const backendIds = new Set(storeAgents.map((a) => a.id));
    const seeds = SEED_AGENTS.filter((s) => !backendIds.has(s.id));
    return [...storeAgents, ...seeds];
  }, [storeAgents]);

  // Fetch on mount
  useEffect(() => {
    fetchAgents();
  }, []);

  // ── Search ──
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.role?.toLowerCase().includes(q) ||
        a.skills?.some((s) => s.toLowerCase().includes(q)),
    );
  }, [agents, search]);

  // ── Vapi Voice ──
  const [callStatus, setCallStatus] = useState<"idle" | "loading" | "active">("idle");
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);

  // ── WebRTC ──
  const webrtc = useWebRTCCall();
  const [webrtcAgentId, setWebrtcAgentId] = useState<string | null>(null);

  // ── Dialogs ──
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);

  // When arriving from another module (e.g. Front Desk "Configure Agent"),
  // open the requested agent's detail view once agents are loaded.
  const location = useLocation();
  const focusAgentId = (location.state as any)?.focusAgentId as string | undefined;
  useEffect(() => {
    if (!focusAgentId) return;
    const match = agents.find((a) => a.id === focusAgentId);
    if (match) setSelectedAgent(match);
  }, [focusAgentId, agents]);

  // ── Init Vapi ──
  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
    if (!publicKey) return;

    // Route Vapi web-call creation through our backend to avoid CORS issues.
    // The SDK sends POST <apiBaseUrl>/call/web — our backend proxies it to api.vapi.ai.
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
      ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')}/vapi-proxy`
      : undefined;

    vapiRef.current = new Vapi(publicKey, apiBaseUrl);

    vapiRef.current.on("call-start", () => {
      setCallStatus("active");
      toast({ title: "Call Connected", description: "You are now speaking with the AI." });
    });

    vapiRef.current.on("call-end", () => {
      setCallStatus("idle");
      setActiveAgentId(null);
      toast({ title: "Call Ended", description: "The voice session has ended." });
    });

    vapiRef.current.on("error", (e: unknown) => {
      console.error("Vapi Error:", e);
      setCallStatus("idle");
      setActiveAgentId(null);

      // Extract a plain-string message from the (potentially nested) error object.
      // The Vapi SDK may emit objects like {type, error: {message, statusCode, ...}, ...}
      // and `message` can be a string OR an array — always coerce to string.
      const msg = extractErrorMessage(e) || "Could not connect to voice service.";

      toast({
        variant: "destructive",
        title: "Voice Connection Error",
        description: msg.length > 120 ? msg.slice(0, 120) + "…" : msg,
      });
    });

    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  const toggleVoiceCall = async (agent: Agent) => {
    if (!vapiRef.current) {
      toast({ variant: "destructive", title: "Configuration Missing", description: "VAPI_PUBLIC_KEY is not configured." });
      return;
    }
    if (callStatus !== "idle") {
      vapiRef.current.stop();
      return;
    }
    let assistantId = agent.vapiAssistantId;
    if (!assistantId) {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
        if (!apiBase) {
          throw new Error("API base URL not configured");
        }
        const res = await fetch(`${apiBase}/vapi-proxy/default-assistant`);
        if (!res.ok) throw new Error("Could not get default assistant");
        const data = (await res.json()) as { assistantId?: string };
        if (!data.assistantId) throw new Error("Default assistantId missing");
        assistantId = data.assistantId;
      } catch (err) {
        const msg = extractErrorMessage(err) || "This agent has no Vapi assistant ID.";
        toast({ variant: "destructive", title: "No Vapi Assistant", description: msg });
        return;
      }
    }

    try {
      setCallStatus("loading");
      setActiveAgentId(agent.id);

      // Race the start call against a 30-second timeout
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Voice connection timed out after 30 seconds.")), 30_000),
      );
      await Promise.race([vapiRef.current.start(assistantId), timeout]);
    } catch (err) {
      console.error("toggleVoiceCall error:", err);
      setCallStatus("idle");
      setActiveAgentId(null);
      const msg = extractErrorMessage(err) || "Failed to start voice call.";
      toast({
        variant: "destructive",
        title: "Voice Call Failed",
        description: msg.length > 140 ? msg.slice(0, 140) + "…" : msg,
      });
    }
  };

  // ── Save handler ──
  const handleSave = async (payload: Agent) => {
    setSaving(true);
    try {
      if (editingAgent) {
        await updateAgent(editingAgent.id, payload as unknown as CreateAgentPayload);
        toast({ title: "Agent Updated", description: `"${payload.name}" has been updated.` });
      } else {
        await createAgent(payload as unknown as CreateAgentPayload);
        toast({ title: "Agent Created", description: `"${payload.name}" has been created and synced with Vapi.` });
      }
      setShowBuilder(false);
      setEditingAgent(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: extractErrorMessage(err) || "Operation failed." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingAgent) return;
    try {
      await deleteAgent(deletingAgent.id);
      toast({ title: "Agent Deleted", description: `"${deletingAgent.name}" has been removed.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: extractErrorMessage(err) || "Failed to delete agent." });
    }
    setDeletingAgent(null);
  };

  // ── Open in Workflow Builder ──
  const openInBuilder = (agent?: Agent) => {
    const template = agent ? (AGENT_TEMPLATES[agent.id] ?? BLANK_TEMPLATE) : BLANK_TEMPLATE;
    navigate("/automations", { state: { presetFlow: template } });
  };

  // ── Channel icon ──
  const ChannelIcon = ({ channel }: { channel: string }) => {
    const Icon = channel === "Voice" ? Phone : channel === "Email" ? Mail : MessageSquare;
    return (
      <div className="p-2 rounded-lg bg-muted" title={channel}>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t("aiAgents.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("aiAgents.subtitle")}</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => openInBuilder()}
            >
              <Workflow className="h-4 w-4 mr-2" />
              Workflow Builder
            </Button>
            <Button
              className="flyn-button-gradient"
              onClick={() => {
                setEditingAgent(null);
                setShowBuilder(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("aiAgents.createAgent")}
            </Button>
          </div>
        </motion.div>

        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agents…" className="pl-9" />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Error banner — never silently swallow a load failure */}
        {error && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <span>Failed to load agents: {error}</span>
            <button onClick={() => fetchAgents()} className="font-semibold underline shrink-0">Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading && agents.length === 0 && (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading agents…
          </div>
        )}

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
          {filtered.map((agent, index) => (
            <motion.div
              key={agent.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: 0.05 + index * 0.03 }}
            >
              <Card className="flyn-card border-0 overflow-hidden group">
                <CardContent className="p-6">
                  {/* Avatar & Status */}
                  <div className="flex flex-col items-center text-center mb-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full flyn-gradient-bg flex items-center justify-center text-white text-2xl font-bold">
                        {agent.avatar || agent.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-card ${agent.status === "active" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    </div>
                    <h3 className="font-semibold text-lg mt-3">{agent.name}</h3>
                    <p className="text-sm text-muted-foreground">{agent.role}</p>
                    {agent.vapiAssistantId && <Badge variant="outline" className="mt-1 text-[10px]">Vapi Synced</Badge>}
                  </div>

                  {/* Skills */}
                  {agent.skills && agent.skills.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mb-4">
                      {agent.skills.map((skill) => (
                        <span key={skill} className="px-2.5 py-1 rounded-lg bg-secondary text-xs font-medium text-secondary-foreground">{skill}</span>
                      ))}
                    </div>
                  )}

                  {/* Channels */}
                  <div className="flex justify-center gap-2 mb-4">
                    {agent.channels.map((c) => <ChannelIcon key={c} channel={c} />)}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 w-full mt-4">
                    {agent.id.startsWith("seed-") ? (
                      <Button variant="secondary" className="flex-1" onClick={() => {
                        setEditingAgent(agent);
                        setShowBuilder(true);
                      }}>
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    ) : (
                      <Button variant="secondary" className="flex-1" onClick={() => setSelectedAgent(agent)}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    )}

                    {agent.channels.includes("Voice") && (
                      <Button
                        variant={activeAgentId === agent.id ? "destructive" : "default"}
                        className={`flex-1 ${activeAgentId === agent.id ? "" : "flyn-button-gradient"}`}
                        onClick={() => toggleVoiceCall(agent)}
                        disabled={callStatus === "loading" && activeAgentId !== agent.id}
                      >
                        {activeAgentId === agent.id ? (
                          <>
                            {callStatus === "loading" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PhoneOff className="h-4 w-4 mr-2" />}
                            {callStatus === "loading" ? "Connecting…" : "End Call"}
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4 mr-2" />
                            Test Voice
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Edit / Delete (custom agents only) */}
                  {!agent.id.startsWith("seed-") && (
                    <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setEditingAgent(agent); setShowBuilder(true); }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={() => setDeletingAgent(agent)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}

          {/* Add New Agent Card */}
          </AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card
              className="border-2 border-dashed border-muted-foreground/30 h-full min-h-[300px] cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                setEditingAgent(null);
                setShowBuilder(true);
              }}
            >
              <CardContent className="h-full flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-muted-foreground">{t("aiAgents.createNewAgent")}</p>
                <p className="text-sm text-muted-foreground/60 text-center mt-1">{t("aiAgents.createNewAgentDesc")}</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Agent Detail Dialog */}
        <Dialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)}>
          <DialogContent className="max-w-md">
            {selectedAgent && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flyn-gradient-bg flex items-center justify-center text-white font-bold">
                      {selectedAgent.avatar || selectedAgent.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div>{selectedAgent.name}</div>
                      <p className="text-sm font-normal text-muted-foreground">{selectedAgent.role}</p>
                    </div>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {selectedAgent.description && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Description</h4>
                      <p className="text-sm text-muted-foreground">{selectedAgent.description}</p>
                    </div>
                  )}
                  {selectedAgent.systemPrompt && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">System Prompt</h4>
                      <p className="text-xs text-muted-foreground bg-muted p-2 rounded whitespace-pre-wrap max-h-40 overflow-auto">{selectedAgent.systemPrompt}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-1">Model</h4>
                      <p className="text-muted-foreground">{selectedAgent.modelProvider} / {selectedAgent.modelName}</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-1">Voice</h4>
                      <p className="text-muted-foreground">{selectedAgent.voiceProvider} / {selectedAgent.voiceId?.slice(0, 12)}…</p>
                    </div>
                  </div>
                  {selectedAgent.skills && selectedAgent.skills.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedAgent.skills.map((s) => (
                          <span key={s} className="px-2.5 py-1 rounded-lg bg-secondary text-xs font-medium">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Channels</h4>
                    <div className="flex gap-2">
                      {selectedAgent.channels.map((c) => (
                        <span key={c} className="px-2.5 py-1 rounded-lg bg-primary/10 text-xs font-medium text-primary">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Status</h4>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${selectedAgent.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedAgent.status === "active" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                      {selectedAgent.status === "active" ? "Active" : selectedAgent.status}
                    </span>
                  </div>
                  {selectedAgent.vapiAssistantId && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Vapi Assistant ID</h4>
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded break-all">{selectedAgent.vapiAssistantId}</code>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Agent Builder Dialog */}
        <Dialog open={showBuilder} onOpenChange={(open) => { if (!open) { setShowBuilder(false); setEditingAgent(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAgent ? "Edit Agent" : "Create New Agent"}</DialogTitle>
              <DialogDescription>Configure your AI voice agent. It will be synced with Vapi and available across the platform.</DialogDescription>
            </DialogHeader>
            <AgentBuilder
              agent={editingAgent || undefined}
              onSave={handleSave}
              onCancel={() => { setShowBuilder(false); setEditingAgent(null); }}
              saving={saving}
            />
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingAgent} onOpenChange={(open) => !open && setDeletingAgent(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Agent</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deletingAgent?.name}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("ai.agent.builder")(AIAgents);
