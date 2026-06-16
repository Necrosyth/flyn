import { useState } from 'react';
import { FaLinkedin } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { ChannelConfig } from './channel.types';
import { Loader2, Sparkles, Globe } from 'lucide-react';

interface Props {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function LinkedInConnectForm({ onSubmit, onTest, isLoading }: Props) {
  const [formData, setFormData] = useState({ name: 'LinkedIn Marketing', accessToken: '', organizationId: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: formData.name,
    credentials: { 
      accessToken: formData.accessToken,
      organizationId: formData.organizationId 
    },
  });

  const handleOAuth = () => {
    const clientId = import.meta.env.VITE_LINKEDIN_CLIENT_ID || 'LINKEDIN_CLIENT_ID_PLACEHOLDER';
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/channels/oauth/callback/linkedin`);
    const scope = encodeURIComponent('r_liteprofile r_emailaddress w_member_social');
    window.location.href = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(buildConfig()); };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest(buildConfig());
    setTestResult({ success, message: success ? 'LinkedIn account verified!' : 'Invalid credentials.' });
    setIsTesting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-[#0077B5] flex items-center justify-center">
          <FaLinkedin className="w-4 h-4 text-white" />
        </div>
        <h4 className="font-semibold text-sm">LinkedIn Sales & Marketing</h4>
      </div>

      <div className="flex flex-col gap-3">
        <Button 
          type="button"
          onClick={handleOAuth}
          className="w-full bg-[#0077B5] hover:bg-[#0077B5]/90 text-white flex items-center justify-center gap-2 h-11"
        >
          <FaLinkedin className="w-5 h-5" />
          Connect LinkedIn (OAuth)
        </Button>
        <p className="text-[10px] text-center text-muted-foreground uppercase font-semibold">or provide details manually</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-border/50">
        <div>
          <label className="block text-xs font-medium mb-1">Channel Name</label>
          <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-9" required />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Access Token</label>
          <Input type="password" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} className="h-9" placeholder="AQVxxxx…" required />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Organization ID (URN)</label>
          <Input value={formData.organizationId} onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })} className="h-9" placeholder="urn:li:organization:12345" />
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {testResult.message}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleTest} disabled={isTesting || !formData.accessToken} className="flex-1">
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
          </Button>
          <Button type="submit" disabled={isLoading || !formData.accessToken} className="flex-1 bg-[#0077B5] hover:bg-[#0077B5]/90">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// Minimal Input component helper if not imported
const Input = ({ className, ...props }: any) => (
  <input {...props} className={`w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-ring focus:outline-none ${className}`} />
);
