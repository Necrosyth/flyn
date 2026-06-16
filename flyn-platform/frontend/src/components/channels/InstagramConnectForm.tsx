import { useState } from 'react';
import { FaInstagram } from 'react-icons/fa';
import { ChannelConfig } from './channel.types';
import { Button } from '@/components/ui/button';

interface Props {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function InstagramConnectForm({ onSubmit, onTest, isLoading }: Props) {
  const [formData, setFormData] = useState({ name: 'Instagram DMs', pageAccessToken: '', appSecret: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: formData.name,
    credentials: { accessToken: formData.pageAccessToken, appSecret: formData.appSecret || undefined },
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(buildConfig()); };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest(buildConfig());
    setTestResult({ success, message: success ? 'Instagram Business Account detected!' : 'Failed — check the token or make sure an Instagram Business Account is linked to your Facebook Page.' });
    setIsTesting(false);
  };

  const handleOAuth = () => {
    if (!window.FB) {
      alert("Facebook SDK not loaded. Please contact support.");
      return;
    }

    window.FB.login((response: any) => {
      if (response.authResponse) {
        const accessToken = response.authResponse.accessToken;
        // Same backend endpoint can handle Instagram/WhatsApp WABA registration
        handleRegisterEmbedded(accessToken);
      } else {
        console.log('User cancelled login or did not fully authorize.');
      }
    }, {
      config_id: '1639408067365377',
      response_type: 'code',
      override_default_response_type: true,
      extras: { 
        feature: 'whatsapp_embedded_signup'
      }
    });
  };

  const handleRegisterEmbedded = async (token: string) => {
    setConnecting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/channels/whatsapp/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}` 
        },
        body: JSON.stringify({ accessToken: token })
      });
      
      if (res.ok) {
        toast({ title: "Instagram Connected", description: "Your business account is now linked." });
        if (onConnected) onConnected();
      } else {
        throw new Error("Registration failed");
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Connection failed", description: err.message });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Button 
          type="button"
          onClick={handleOAuth}
          className="w-full bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCB045] hover:opacity-90 text-white flex items-center justify-center gap-2 h-11"
        >
          <FaInstagram className="w-5 h-5" />
          Connect with Meta (OAuth)
        </Button>
        <p className="text-[10px] text-center text-muted-foreground uppercase font-semibold">or connect manually</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
          <FaInstagram className="w-4 h-4 text-white" />
        </div>
        <h4 className="font-semibold text-sm">Instagram DMs</h4>
      </div>

      <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-lg text-xs text-purple-700 dark:text-purple-300 space-y-1">
        <p><strong>Requirements:</strong></p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Instagram Business or Creator account</li>
          <li>Linked to a Facebook Page</li>
          <li>Page Access Token from Meta for Developers</li>
        </ul>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Channel Name</label>
        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" required />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Facebook Page Access Token <span className="text-red-500">*</span></label>
        <input type="password" value={formData.pageAccessToken} onChange={(e) => setFormData({ ...formData, pageAccessToken: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="EAAxxxxxxxx…" required />
        <p className="text-xs text-muted-foreground mt-1">Same token as your linked Facebook Page</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">App Secret (optional)</label>
        <input type="password" value={formData.appSecret} onChange={(e) => setFormData({ ...formData, appSecret: e.target.value })}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring focus:outline-none" placeholder="For webhook signature verification" />
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
          {testResult.message}
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={handleTest} disabled={isTesting || !formData.pageAccessToken}
          className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-accent disabled:opacity-50 text-sm">
          {isTesting ? 'Testing…' : 'Test Connection'}
        </button>
        <button type="submit" disabled={isLoading || !formData.pageAccessToken}
          className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm">
          {isLoading ? 'Connecting…' : 'Connect Instagram'}
        </button>
      </div>
    </form>
  </div>
  );
}
