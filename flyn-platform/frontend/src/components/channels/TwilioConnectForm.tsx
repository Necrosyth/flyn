import { useState } from 'react';
import { ChannelConfig } from './channel.types';
import { ExternalLink } from 'lucide-react';

interface TwilioConnectFormProps {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function TwilioConnectForm({ onSubmit, onTest, isLoading }: TwilioConnectFormProps) {
  const [formData, setFormData] = useState({ name: 'Twilio SMS & Voice', accountSid: '', authToken: '', phoneNumber: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: formData.name,
    credentials: {
      twilioAccountSid: formData.accountSid.trim(),
      twilioAuthToken: formData.authToken.trim(),
      twilioPhoneNumber: formData.phoneNumber.trim(),
    },
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(buildConfig()); };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest(buildConfig());
    setTestResult({ success, message: success ? 'Credentials verified — Twilio account is reachable.' : 'Could not connect. Check your Account SID and Auth Token.' });
    setIsTesting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3">
        <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">TW</span>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Your Twilio Account</p>
          <p className="text-xs text-muted-foreground mt-0.5">SMS, MMS, and voice calls are made through your own Twilio account. You pay Twilio directly.</p>
          <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline mt-1">
            Open Twilio Console <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Channel Name</label>
        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" required />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Account SID <span className="text-red-500">*</span></label>
        <input type="text" value={formData.accountSid} onChange={(e) => setFormData({ ...formData, accountSid: e.target.value })}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Auth Token <span className="text-red-500">*</span></label>
        <input type="password" value={formData.authToken} onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
          placeholder="Your auth token" required
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Twilio Phone Number <span className="text-red-500">*</span></label>
        <input type="text" value={formData.phoneNumber} onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
          placeholder="+14155552671" required
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
        <p className="text-xs text-muted-foreground mt-1">E.164 format — the number that will appear as the sender.</p>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {testResult.message}
        </div>
      )}

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-600 dark:text-amber-400">
        <strong>Inbound SMS:</strong> In your Twilio console, set the "A message comes in" webhook for this number to:<br />
        <code className="font-mono bg-amber-500/20 px-1 rounded mt-1 block">https://api.myflynai.com/api/channels/webhook/twilio?tenantId=YOUR_TENANT_ID</code>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={handleTest} disabled={isLoading || isTesting || !formData.accountSid || !formData.authToken}
          className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-accent disabled:opacity-50 text-sm">
          {isTesting ? 'Testing…' : 'Test Credentials'}
        </button>
        <button type="submit" disabled={isLoading || !formData.accountSid || !formData.authToken || !formData.phoneNumber}
          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium">
          {isLoading ? 'Connecting…' : 'Connect Twilio'}
        </button>
      </div>
    </form>
  );
}
