import { useState } from 'react';
import { ChannelConfig } from './channel.types';
import { ExternalLink, Info } from 'lucide-react';

interface VapiConnectFormProps {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function VapiConnectForm({ onSubmit, onTest, isLoading }: VapiConnectFormProps) {
  const [formData, setFormData] = useState({ name: 'Vapi AI Voice', apiKey: '', publicKey: '', phoneNumberId: '', assistantId: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: formData.name,
    credentials: {
      vapiApiKey: formData.apiKey.trim(),
      vapiPublicKey: formData.publicKey.trim(),
      vapiPhoneNumberId: formData.phoneNumberId.trim() || undefined,
      vapiAssistantId: formData.assistantId.trim() || undefined,
    },
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(buildConfig()); };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest(buildConfig());
    setTestResult({ success, message: success ? 'API key verified — Vapi account is reachable.' : 'Could not connect. Check your Vapi API key.' });
    setIsTesting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3 flex items-start gap-3">
        <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">VP</span>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Your Vapi Account</p>
          <p className="text-xs text-muted-foreground mt-0.5">AI voice calls run through your own Vapi account. You control assistants, phone numbers, and billing directly on Vapi.</p>
          <a href="https://dashboard.vapi.ai" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline mt-1">
            Open Vapi Dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Channel Name</label>
        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Private / Server API Key <span className="text-red-500">*</span></label>
        <input type="password" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <p className="text-xs text-muted-foreground mt-1">Used by the backend to initiate outbound calls. Never exposed to browsers.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Public Key <span className="text-red-500">*</span></label>
        <input type="text" value={formData.publicKey} onChange={(e) => setFormData({ ...formData, publicKey: e.target.value })}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <p className="text-xs text-muted-foreground mt-1">Used by the browser Dialer (Vapi Web SDK). Safe to expose to clients.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Phone Number ID <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input type="text" value={formData.phoneNumberId} onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <p className="text-xs text-muted-foreground mt-1">Vapi Phone Number resource ID for outbound PSTN calls.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Default Assistant ID <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input type="text" value={formData.assistantId} onChange={(e) => setFormData({ ...formData, assistantId: e.target.value })}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <p className="text-xs text-muted-foreground mt-1">Pre-fills the Dialer. You can always override this per-call.</p>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {testResult.message}
        </div>
      )}

      <div className="flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-lg p-3 text-xs text-primary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>After connecting, the Dialer automatically uses your Vapi Public Key and default assistant. Outbound calls via the Flyn backend use your Private Key.</span>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={handleTest} disabled={isLoading || isTesting || !formData.apiKey}
          className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-accent disabled:opacity-50 text-sm">
          {isTesting ? 'Testing…' : 'Test API Key'}
        </button>
        <button type="submit" disabled={isLoading || !formData.apiKey || !formData.publicKey}
          className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 text-sm font-medium">
          {isLoading ? 'Connecting…' : 'Connect Vapi'}
        </button>
      </div>
    </form>
  );
}
