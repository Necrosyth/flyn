import { useState } from 'react';
import { ChannelConfig } from './channel.types';

interface GenericConnectFormProps {
  defaultName?: string;
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function GenericConnectForm({ defaultName = 'Custom Webhook', onSubmit, onTest, isLoading }: GenericConnectFormProps) {
  const [formData, setFormData] = useState({ name: defaultName, apiKey: '', apiSecret: '', webhookToken: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: formData.name,
    credentials: {
      apiKey: formData.apiKey || undefined,
      apiSecret: formData.apiSecret || undefined,
      webhookToken: formData.webhookToken || undefined,
    },
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(buildConfig()); };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest(buildConfig());
    setTestResult({ success, message: success ? 'Connection looks good.' : 'Connection test failed.' });
    setIsTesting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Channel Name</label>
        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">API Key / Token</label>
          <input type="text" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="Optional" />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">API Secret</label>
          <input type="password" value={formData.apiSecret} onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Webhook Token</label>
        <input type="text" value={formData.webhookToken} onChange={(e) => setFormData({ ...formData, webhookToken: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="Optional" />
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {testResult.message}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={handleTest} disabled={isLoading || isTesting}
          className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-accent disabled:opacity-50 text-sm">
          {isTesting ? 'Testing…' : 'Test Connection'}
        </button>
        <button type="submit" disabled={isLoading}
          className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm">
          {isLoading ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </form>
  );
}
