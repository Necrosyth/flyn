import { useState } from 'react';
import { FaTiktok } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { ChannelConfig } from './channel.types';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function TikTokConnectForm({ onSubmit, onTest, isLoading }: Props) {
  const [formData, setFormData] = useState({ name: 'TikTok for Business', accessToken: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: formData.name,
    credentials: { accessToken: formData.accessToken },
  });

  const handleOAuth = () => {
    const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY || 'TIKTOK_CLIENT_KEY_PLACEHOLDER';
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/channels/oauth/callback/tiktok`);
    const scope = 'business.message.read,business.message.send,ads.read';
    // TikTok for Business OAuth URL
    window.location.href = `https://business-api.tiktok.com/portal/auth?app_id=${clientKey}&redirect_uri=${redirectUri}&state=flyn_auth&scope=${scope}`;
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(buildConfig()); };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest(buildConfig());
    setTestResult({ success, message: success ? 'TikTok Business account verified!' : 'Invalid access token or account not authorized.' });
    setIsTesting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-[#000000] flex items-center justify-center">
          <FaTiktok className="w-4 h-4 text-white" />
        </div>
        <h4 className="font-semibold text-sm">TikTok for Business</h4>
      </div>

      <div className="flex flex-col gap-3">
        <Button 
          type="button"
          onClick={handleOAuth}
          className="w-full bg-[#000000] hover:bg-zinc-800 text-white flex items-center justify-center gap-2 h-11 shadow-lg"
        >
          <FaTiktok className="w-5 h-5" />
          Connect with TikTok (OAuth)
        </Button>
        <p className="text-[10px] text-center text-muted-foreground uppercase font-semibold">or provide access token manually</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-border/50">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Channel Name</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Access Token <span className="text-red-500">*</span></label>
          <input type="password" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="act.xxxxxxxx…" required />
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
            {testResult.message}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleTest} disabled={isTesting || !formData.accessToken}
            className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-accent disabled:opacity-50 text-sm">
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test Connection'}
          </button>
          <button type="submit" disabled={isLoading || !formData.accessToken}
            className="flex-1 px-4 py-2 bg-[#000000] text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Connect TikTok
          </button>
        </div>
      </form>
    </div>
  );
}
