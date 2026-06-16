import { useState } from 'react';
import { ChannelConfig } from './channel.types';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SlackFormProps {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function SlackConnectForm({ onSubmit, onTest, isLoading }: SlackFormProps) {
  const [showManual, setShowManual] = useState(false);
  const [formData, setFormData] = useState({ name: 'Slack Workspace', botToken: '', signingSecret: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleOAuth = () => {
    const clientId = import.meta.env.VITE_SLACK_CLIENT_ID || 'SLACK_CLIENT_ID_PLACEHOLDER';
    const scope = 'chat:write,im:history,groups:history,mpim:history,channels:history,users:read,bot';
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/channels/oauth/callback/slack`);
    window.location.href = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name: formData.name, credentials: { slackBotToken: formData.botToken, signingSecret: formData.signingSecret || undefined } });
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const success = await onTest({ name: formData.name, credentials: { slackBotToken: formData.botToken } });
    setTestResult({ success, message: success ? 'Bot token is valid!' : 'Invalid bot token.' });
    setIsTesting(false);
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={handleOAuth}
        className="w-full flex items-center justify-center gap-3 h-11 bg-[#4A154B] hover:bg-[#4A154B]/90 text-white font-semibold shadow-lg"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.123a2.527 2.527 0 0 1-2.521-2.52A2.527 2.527 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
        Add to Slack
      </Button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-border hover:bg-accent text-sm font-medium text-foreground transition-colors"
      >
        <span>Manual setup (bot token)</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showManual ? 'rotate-180' : ''}`} />
      </button>

      {showManual && (
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Channel Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              placeholder="Slack Workspace"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Bot Token <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.botToken}
              onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              placeholder="xoxb-…"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">Slack App Settings › OAuth & Permissions › Bot User OAuth Token</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Signing Secret (optional)</label>
            <input
              type="password"
              value={formData.signingSecret}
              onChange={(e) => setFormData({ ...formData, signingSecret: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              placeholder="From Slack App Settings › Basic Information"
            />
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {testResult.message}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !formData.botToken}
              className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-accent disabled:opacity-50 text-sm"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test Token'}
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.botToken}
              className="flex-1 px-4 py-2 bg-[#4A154B] text-white rounded-lg hover:bg-purple-900 disabled:opacity-50 text-sm font-medium"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Connect Slack'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
