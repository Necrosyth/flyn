import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChannelConfig } from './channel.types';
import { Loader2, Apple, HelpCircle } from 'lucide-react';

interface Props {
  onSubmit: (config: ChannelConfig) => void;
  onTest: (config: ChannelConfig) => Promise<boolean>;
  isLoading: boolean;
}

export function AppleBusinessConnectForm({ onSubmit, onTest, isLoading }: Props) {
  const [formData, setFormData] = useState({ name: 'Apple Business Chat', mspId: '', internalToken: '' });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const buildConfig = (): ChannelConfig => ({
    name: formData.name,
    credentials: { 
      mspId: formData.mspId,
      internalToken: formData.internalToken 
    },
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(buildConfig()); };

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    const success = await onTest(buildConfig());
    setTestResult({ success, message: success ? 'Apple Business integration verified!' : 'Invalid MSP ID or Token.' });
    setIsTesting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center">
          <Apple className="w-4 h-4 text-white" />
        </div>
        <h4 className="font-semibold text-sm">Apple Messages for Business</h4>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex gap-3 items-start">
        <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          Apple Business Chat requires an <strong>Apple Messages for Business Account</strong>. 
          Register at <a href="https://register.apple.com" target="_blank" rel="noreferrer" className="underline font-bold">register.apple.com</a> 
          and select <strong>FLYN AI</strong> as your Messaging Service Provider (MSP).
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1">Channel Name</label>
          <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-9" required />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Apple MSP ID / Business ID</label>
          <Input value={formData.mspId} onChange={(e) => setFormData({ ...formData, mspId: e.target.value })} className="h-9" placeholder="bid-xxxxxxxxxxxxxx" required />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Internal Secret / Token</label>
          <Input type="password" value={formData.internalToken} onChange={(e) => setFormData({ ...formData, internalToken: e.target.value })} className="h-9" placeholder="Enter secret provided by Apple Portal" required />
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {testResult.message}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleTest} disabled={isTesting || !formData.mspId} className="flex-1">
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
          </Button>
          <Button type="submit" disabled={isLoading || !formData.mspId} className="flex-1 bg-black text-white hover:bg-zinc-800">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
          </Button>
        </div>
      </form>
    </div>
  );
}

const Input = ({ className, ...props }: any) => (
  <input {...props} className={`w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-ring focus:outline-none ${className}`} />
);
