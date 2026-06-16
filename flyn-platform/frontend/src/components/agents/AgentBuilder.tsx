/**
 * AgentBuilder — Full-featured agent creation / editing form
 * ----------------------------------------------------------
 * Rendered inside a Dialog on the AIAgents page and (optionally)
 * inline inside the Workflow Builder when creating agents from a
 * voice_agent node.
 *
 * Supports:
 *  - Name, description, role, avatar
 *  - System prompt / personality
 *  - Model config (provider, model, temperature)
 *  - Voice config (provider, voice ID)
 *  - Behaviour (silence timeout, max duration, interruptions)
 *  - Channels, skills/tags
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Sliders,
  Tag,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  Calendar,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Agent, CreateAgentPayload } from '@/services/agents';

// ============================================================================
// CONSTANTS
// ============================================================================

const CHANNEL_OPTIONS = ['Voice', 'Web Chat', 'SMS', 'Email', 'WhatsApp'] as const;

// Twilio-native language support — voices from official AWS Polly docs, codes from Twilio TwiML docs
const TWILIO_LANGUAGES = [
  { code: 'en-US', name: 'English (US)', ttsVoice: 'Polly.Joanna' },
  { code: 'en-IN', name: 'English (India)', ttsVoice: 'Polly.Kajal' },
  { code: 'hi-IN', name: 'Hindi', ttsVoice: 'Polly.Aditi' },
  { code: 'es-US', name: 'Spanish (US)', ttsVoice: 'Polly.Lupe' },
  { code: 'es-ES', name: 'Spanish (Spain)', ttsVoice: 'Polly.Lucia' },
  { code: 'fr-FR', name: 'French', ttsVoice: 'Polly.Lea' },
  { code: 'de-DE', name: 'German', ttsVoice: 'Polly.Vicki' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', ttsVoice: 'Polly.Camila' },
  { code: 'ja-JP', name: 'Japanese', ttsVoice: 'Polly.Kazuha' },
  { code: 'ko-KR', name: 'Korean', ttsVoice: 'Polly.Seoyeon' },
] as const;

// ============================================================================
// COMPONENT
// ============================================================================

interface AgentBuilderProps {
  /** If provided, we're editing an existing agent */
  agent?: Agent;
  /** Called after successful save */
  onSave: (agent: Agent) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** If true, show a loading spinner on the save button */
  saving?: boolean;
}

const AgentBuilder: React.FC<AgentBuilderProps> = ({
  agent,
  onSave,
  onCancel,
  saving = false,
}) => {
  // ── Form State ─────────────────────────────────────────────
  const [name, setName] = useState(agent?.name || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [role, setRole] = useState(agent?.role || '');
  const [firstMessage, setFirstMessage] = useState(agent?.firstMessage || 'Hello! How can I help you today?');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '');
  const [twilioVoice, setTwilioVoice] = useState(agent?.twilioVoice || 'Polly.Joanna');
  const [language, setLanguage] = useState(agent?.language || 'en-US');
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>(agent?.supportedLanguages || []);
  const [multiLangEnabled, setMultiLangEnabled] = useState((agent?.supportedLanguages?.length ?? 0) > 1);
  const [endCallOnSilence, setEndCallOnSilence] = useState(agent?.endCallOnSilence ?? true);
  const [silenceTimeout, setSilenceTimeout] = useState(agent?.silenceTimeoutSeconds ?? 30);
  const [maxDuration, setMaxDuration] = useState(agent?.maxDurationSeconds ?? 600);
  const [interruptions, setInterruptions] = useState(agent?.interruptionsEnabled ?? true);
  const [channels, setChannels] = useState<string[]>(agent?.channels || ['Voice']);
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>(agent?.skills || []);
  const [enableCalendarBooking, setEnableCalendarBooking] = useState(agent?.enableCalendarBooking ?? false);
  const [calendarId, setCalendarId] = useState(agent?.calendarId || '');

  // Collapsible sections
  const [showVoice, setShowVoice] = useState(true);
  const [showBehaviour, setShowBehaviour] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Handlers ───────────────────────────────────────────────
  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    const cfg = TWILIO_LANGUAGES.find(l => l.code === code);
    if (cfg) setTwilioVoice(cfg.ttsVoice);
  };

  const toggleSupportedLang = (code: string) => {
    setSupportedLanguages(prev =>
      prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code],
    );
  };

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  };

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
      setSkillInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: CreateAgentPayload = {
      name,
      description: description || undefined,
      role: role || undefined,
      firstMessage,
      systemPrompt: systemPrompt || undefined,
      twilioVoice: twilioVoice || undefined,
      language: language || undefined,
      multiLanguage: multiLangEnabled,
      supportedLanguages: multiLangEnabled && supportedLanguages.length > 0
        ? [language, ...supportedLanguages.filter(l => l !== language)]
        : undefined,
      endCallOnSilence,
      silenceTimeoutSeconds: silenceTimeout,
      maxDurationSeconds: maxDuration,
      interruptionsEnabled: interruptions,
      channels: channels as CreateAgentPayload['channels'],
      skills,
      enableCalendarBooking,
      calendarId: enableCalendarBooking && calendarId ? calendarId : undefined,
      status: 'active',
    };

    // onSave is handled by the parent — it calls the store's create/update
    onSave(payload as unknown as Agent);
  };

  // ── Section Toggle ─────────────────────────────────────────
  const SectionHeader: React.FC<{
    icon: React.ReactNode;
    label: string;
    open: boolean;
    toggle: () => void;
  }> = ({ icon, label, open, toggle }) => (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center justify-between w-full py-2 px-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ──────────── Identity ──────────── */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="agent-name">Name *</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morgan Sales Agent"
              required
            />
          </div>
          <div>
            <Label htmlFor="agent-role">Role</Label>
            <Input
              id="agent-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Lead Qualification"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="agent-desc">Description</Label>
          <Textarea
            id="agent-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent do?"
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor="agent-first-msg">First Message *</Label>
          <Textarea
            id="agent-first-msg"
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            placeholder="Hello! I'm your AI assistant. How can I help?"
            rows={2}
            required
          />
        </div>
        <div>
          <Label htmlFor="agent-prompt">System Prompt / Personality</Label>
          <Textarea
            id="agent-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a friendly sales agent who qualifies leads..."
            rows={4}
          />
        </div>
      </div>

      {/* ──────────── Voice & Language ──────────── */}
      <div className="border border-border rounded-lg px-3 pb-3">
        <SectionHeader
          icon={<Mic className="h-4 w-4" />}
          label="Voice & Language"
          open={showVoice}
          toggle={() => setShowVoice((p) => !p)}
        />
        <AnimatePresence>
          {showVoice && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {/* ── Twilio Language Config ── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Twilio Call Language</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Language</Label>
                    <Select value={language} onValueChange={handleLanguageChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TWILIO_LANGUAGES.map(l => (
                          <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Polly Voice (auto-set)</Label>
                    <Input
                      value={twilioVoice}
                      onChange={(e) => setTwilioVoice(e.target.value)}
                      placeholder="Polly.Joanna"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Multi-language</Label>
                    <p className="text-xs text-muted-foreground">Agent asks caller to choose language</p>
                  </div>
                  <Switch checked={multiLangEnabled} onCheckedChange={setMultiLangEnabled} />
                </div>

                {multiLangEnabled && (
                  <div>
                    <Label className="mb-1.5 block">Additional Languages</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {TWILIO_LANGUAGES.filter(l => l.code !== language).map(l => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => toggleSupportedLang(l.code)}
                          className={`px-2 py-1 rounded text-xs border transition-colors ${supportedLanguages.includes(l.code) ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ──────────── Behaviour ──────────── */}
      <div className="border border-border rounded-lg px-3 pb-3">
        <SectionHeader
          icon={<Sliders className="h-4 w-4" />}
          label="Call Behaviour"
          open={showBehaviour}
          toggle={() => setShowBehaviour((p) => !p)}
        />
        <AnimatePresence>
          {showBehaviour && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <Label>End call on silence</Label>
                <Switch checked={endCallOnSilence} onCheckedChange={setEndCallOnSilence} />
              </div>
              {endCallOnSilence && (
                <div>
                  <Label>Silence Timeout (seconds)</Label>
                  <Input
                    type="number"
                    value={silenceTimeout}
                    onChange={(e) => setSilenceTimeout(Number(e.target.value))}
                    min={5}
                    max={300}
                  />
                </div>
              )}
              <div>
                <Label>Max Call Duration (seconds)</Label>
                <Input
                  type="number"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(Number(e.target.value))}
                  min={30}
                  max={3600}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Allow interruptions</Label>
                <Switch checked={interruptions} onCheckedChange={setInterruptions} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ──────────── Channels & Skills ──────────── */}
      <div className="border border-border rounded-lg px-3 pb-3">
        <SectionHeader
          icon={<Tag className="h-4 w-4" />}
          label="Channels & Skills"
          open={showAdvanced}
          toggle={() => setShowAdvanced((p) => !p)}
        />
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div>
                <Label className="mb-1 block">Channels</Label>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_OPTIONS.map((ch) => (
                    <Badge
                      key={ch}
                      variant={channels.includes(ch) ? 'default' : 'outline'}
                      className="cursor-pointer select-none"
                      onClick={() => toggleChannel(ch)}
                    >
                      {ch}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-1 block">Skills / Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    placeholder="Add a skill..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addSkill}>
                    Add
                  </Button>
                </div>
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {skills.map((s) => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setSkills((prev) => prev.filter((x) => x !== s))}
                      >
                        {s} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ──────────── Calendar Booking ──────────── */}
      <div className="border-t border-border pt-4">
        <SectionHeader
          icon={<Calendar className="h-4 w-4 text-green-500" />}
          label="Calendar Booking"
          open={showCalendar}
          toggle={() => setShowCalendar(!showCalendar)}
        />
        <AnimatePresence>
          {showCalendar && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 mt-3 pl-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-calendar" className="text-sm font-medium">
                    Allow appointment bookings
                  </Label>
                  <Switch
                    id="enable-calendar"
                    checked={enableCalendarBooking}
                    onCheckedChange={setEnableCalendarBooking}
                  />
                </div>
                {enableCalendarBooking && (
                  <div className="space-y-2">
                    <Label htmlFor="calendar-provider" className="text-xs text-muted-foreground">
                      Calendar Provider (optional — uses workspace default if not selected)
                    </Label>
                    <Select value={calendarId || ''} onValueChange={setCalendarId}>
                      <SelectTrigger id="calendar-provider" className="text-sm">
                        <SelectValue placeholder="Select a connected calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google">Google Calendar</SelectItem>
                        <SelectItem value="microsoft">Microsoft Outlook</SelectItem>
                        <SelectItem value="calendly">Calendly</SelectItem>
                        <SelectItem value="zoom">Zoom Calendar</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground italic">
                      When enabled, this agent can book appointments into your calendar during conversations.
                      <br />
                      You must first connect your calendar in <strong>Settings → Integrations</strong>.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ──────────── Actions ──────────── */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" className="flex-1 flyn-button-gradient" disabled={!name || !firstMessage || saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {agent ? 'Update Agent' : 'Create Agent'}
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default AgentBuilder;
